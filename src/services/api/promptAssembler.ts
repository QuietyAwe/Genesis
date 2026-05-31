// Prompt Blueprint assembler.
// Builds the system prompt from world lore, character cards, history status, and stage context.
// Fog of War: only the speaking character gets their full card; others are name-only.

import { Character, ChatMessage, LoreEntry } from '../../types';
import { ApiMessage, LLMConfig, streamChat } from './client';

const DEFAULT_TEMPLATE_WITH_VARS = `你是一位小说叙事引擎，当前舞台上有多位角色自主互动。

{{world_lore}}

你是「{{speaker_name}}」。{{speaker_setting}}

在场所有人：{{all_characters}}。上一句是{{last_speaker}}说的。
（你不了解其他角色的详细设定，请根据对话历史判断他们的态度和立场。）

{{initial_status}}

{{stage_summary}}

{{dynamic_lore}}

本次由你扮演{{speaker_name}}。`;

const DEFAULT_SYSTEM_PROMPT = DEFAULT_TEMPLATE_WITH_VARS;

export { DEFAULT_SYSTEM_PROMPT, DEFAULT_TEMPLATE_WITH_VARS };

/** Number of messages added to contextWindow to form the compression threshold. */
export const BATCH_SIZE = 10;

const SUMMARY_SYSTEM_PROMPT = `你是剧情摘要引擎。以下是[旧的剧情摘要]（若有），以及[一段最新的剧情发展]。请将最新剧情的客观事实精炼地融合进旧摘要中，输出一份连贯的全局剧情提要。不要包含任何对话细节，仅保留核心事件和角色状态变化。总长度不超过100字。`;

const AVAILABLE_VARIABLES = [
  { tag: '{{speaker_name}}', label: '当前发言角色名' },
  { tag: '{{speaker_setting}}', label: '当前发言角色完整设定' },
  { tag: '{{other_characters}}', label: '在场其他角色名（无设定）' },
  { tag: '{{all_characters}}', label: '在场所有角色名' },
  { tag: '{{last_speaker}}', label: '上一句发言者名' },
  { tag: '{{world_lore}}', label: '世界观设定' },
  { tag: '{{stage_summary}}', label: '舞台剧情提要' },
  { tag: '{{initial_status}}', label: '当前发言角色处境' },
  { tag: '{{dynamic_lore}}', label: '动态世界书词条' },
] as const;

export { AVAILABLE_VARIABLES };

interface PromptVars {
  worldLore?: string;
  characters: Character[];
  /** ID of the character who is about to speak — used to resolve speaker variables. */
  speakerId?: string;
  /** Pre-generated stage summary (from LLM summarizer). */
  stageSummary?: string;
  /** Name of the character who spoke last — used for {{last_speaker}}. */
  lastSpeakerName?: string;
  /** Initial status /处境 for the speaking character. */
  initialStatus?: string;
  /** Lore entries from associated worlds (for dynamic keyword injection). */
  loreEntries?: LoreEntry[];
  /** Recent message contents for keyword scanning (last 3-5 messages). */
  recentMessageContents?: string[];
}

/**
 * Scan recent message contents for keyword matches in non-global lore entries.
 * Returns the content of matched entries, deduplicated.
 */
function matchLoreKeywords(entries: LoreEntry[], recentContents: string[]): string[] {
  const nonGlobal = entries.filter((e) => !e.isGlobal && e.keywords.length > 0);
  if (nonGlobal.length === 0 || recentContents.length === 0) return [];

  const combinedText = recentContents.join('\n').toLowerCase();
  const matched: string[] = [];
  const seen = new Set<string>();

  for (const entry of nonGlobal) {
    if (seen.has(entry.id)) continue;
    for (const keyword of entry.keywords) {
      if (combinedText.includes(keyword.toLowerCase())) {
        matched.push(entry.content);
        seen.add(entry.id);
        break;
      }
    }
  }

  return matched;
}

export function assembleSystemPrompt(vars: PromptVars, customTemplate?: string): string {
  const template = customTemplate || DEFAULT_SYSTEM_PROMPT;

  // Resolve speaker
  const speaker = vars.speakerId
    ? vars.characters.find((c) => c.id === vars.speakerId)
    : undefined;

  // Build atomic variable values
  const allNames = vars.characters.map((c) => c.name).join('、');
  const speakerName = speaker?.name ?? '';
  const speakerSetting = speaker?.coreSetting ?? '';
  const otherNames = vars.characters.filter((c) => c.id !== speaker?.id)
    .map((c) => c.name).join('、');
  const lastSpeaker = vars.lastSpeakerName ?? '';

  // Build initial status block
  const initialStatus = vars.initialStatus
    ? `[你当前的处境]\n${vars.initialStatus}`
    : '';

  // Build dynamic lore block
  let dynamicLore = '';
  if (vars.loreEntries && vars.loreEntries.length > 0) {
    const parts: string[] = [];

    // Global entries: always inject
    const globalEntries = vars.loreEntries.filter((e) => e.isGlobal);
    for (const entry of globalEntries) {
      parts.push(entry.content);
    }

    // Keyword-matched entries: scan recent messages
    if (vars.recentMessageContents) {
      const keywordMatches = matchLoreKeywords(vars.loreEntries, vars.recentMessageContents);
      parts.push(...keywordMatches);
    }

    if (parts.length > 0) {
      dynamicLore = `[动态世界词条]\n${parts.join('\n')}`;
      console.log(`[PromptAssembler::Lorebook] Injected ${parts.length} lore entries (${globalEntries.length} global, ${parts.length - globalEntries.length} keyword-matched)`);
    }
  }

  // Replace variable tags in template
  let result = template;
  result = result.replace(/\{\{all_characters\}\}/g, allNames);
  result = result.replace(/\{\{speaker_name\}\}/g, speakerName);
  result = result.replace(/\{\{speaker_setting\}\}/g, speakerSetting);
  result = result.replace(/\{\{other_characters\}\}/g, otherNames);
  result = result.replace(/\{\{last_speaker\}\}/g, lastSpeaker);
  result = result.replace(/\{\{world_lore\}\}/g, vars.worldLore || '');
  result = result.replace(/\{\{stage_summary\}\}/g, vars.stageSummary || '');
  result = result.replace(/\{\{initial_status\}\}/g, initialStatus);
  result = result.replace(/\{\{dynamic_lore\}\}/g, dynamicLore);

  return result;
}

/**
 * Lightweight stage summarizer (sliding window batch compression).
 * Merges old summary + stale messages into a new consolidated summary.
 * Runs asynchronously — does NOT block the current auto-reply turn.
 */
export async function summarizeStage(
  staleMessages: ChatMessage[],
  oldSummary: string,
  config: LLMConfig,
): Promise<string> {
  try {
    console.log(`[PromptAssembler::Summary] Compressing ${staleMessages.length} stale messages, oldSummary=${oldSummary.length} chars`);

    const historyText = staleMessages
      .map((m) => `${m.senderName || '旁白'}：${m.content.slice(0, 200)}`)
      .join('\n');

    const userPrompt = oldSummary
      ? `【旧的剧情摘要】\n${oldSummary}\n\n【最新的剧情发展】\n${historyText}\n\n请将最新剧情融合进旧摘要，输出连贯的全局剧情提要。`
      : `【剧情发展】\n${historyText}\n\n请概括以上剧情的关键事件和角色状态变化。`;

    const summaryMessages: ApiMessage[] = [
      { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ];

    const summaryConfig: LLMConfig = {
      ...config,
      temperature: 0.2,
      maxTokens: 200,
    };

    let summary = '';
    const stream = streamChat({
      systemPrompt: SUMMARY_SYSTEM_PROMPT,
      messages: summaryMessages,
      config: summaryConfig,
    });

    for await (const chunk of stream) {
      summary += chunk;
    }

    console.log(`[PromptAssembler::Summary] Compression done (${summary.length} chars): ${summary.slice(0, 80)}...`);
    return summary.trim();
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    console.error('[PromptAssembler::Summary] Compression failed:', errMsg);
    return oldSummary; // fallback: keep old summary on failure
  }
}

function messagesHaveUnpairedToolBoundary(messages: ApiMessage[]): number {
  let toolOpen = 0;
  let toolClose = 0;

  for (const msg of messages) {
    const content = msg.content || '';
    if (/<tool_code|<function|tool_call/i.test(content)) {
      toolOpen++;
    }
    if (/tool_result|<\/tool_code|<\/function|tool_response/i.test(content)) {
      toolClose++;
    }
    if (msg.role === 'tool') {
      toolClose++;
    }
  }

  return toolOpen - toolClose;
}

/**
 * Sanitize a name for the OpenAI API `name` field.
 * The API accepts Unicode letters, digits, hyphens, and underscores.
 * We only strip control characters and whitespace, preserving the original
 * name (including Chinese/Japanese/etc.) so the LLM can recognize it.
 * Falls back to a safe hash only if the name is truly empty.
 */
function sanitizeName(raw: string): string {
  // Remove control chars, tabs, newlines — keep everything else including CJK
  const sanitized = raw.replace(/[\x00-\x1f\x7f-\x9f\s]/g, '').trim();
  if (sanitized.length > 0) return sanitized;
  // Fallback: short hash of the original name
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
  }
  return `char_${Math.abs(hash).toString(36)}`;
}

/**
 * "World vs. Me" dynamic role mapping.
 *
 * Prevents LLM identity confusion by reframing conversation history from
 * the current speaker's first-person perspective:
 *
 * - Messages from the current speaker → { role: "assistant", content: pure台词 }
 * - Messages from others / narrator / user → { role: "user", name: sanitized_name, content: pure台词 }
 *
 * This aligns with how LLMs were trained: "assistant" = the model itself,
 * "user" = the external world speaking to it.
 */
export interface CompressionResult {
  apiMessages: ApiMessage[];
  /** If true, staleMessages should be compressed asynchronously. */
  needsCompression: boolean;
  /** Messages that were cut off — for async summarization. Empty if no compression needed. */
  staleMessages: ChatMessage[];
}

export function buildApiMessages(
  history: ChatMessage[],
  maxTurns: number = 20,
  speakerId?: string,
  contextWindow: number = 20,
): CompressionResult {
  // Dynamic thresholds based on user's contextWindow setting
  const retainCount = contextWindow;
  const compressionThreshold = contextWindow + BATCH_SIZE;

  // Helper: map a single ChatMessage to ApiMessage using World-vs-Me logic
  const toApiMessage = (m: ChatMessage): ApiMessage => {
    const isSelf = m.senderId === speakerId && m.senderType === 'character';

    if (isSelf) {
      // "Me" — the speaking character → assistant role, no name prefix
      return {
        role: 'assistant',
        content: m.content,
      };
    }

    // "World" — everyone else → user role with name tag
    const apiName = m.senderType === 'character'
      ? sanitizeName(m.senderName)
      : m.senderType === 'narrator'
        ? 'narrator'
        : m.senderType === 'guest'
          ? sanitizeName(m.senderName)
          : 'user';

    return {
      role: 'user',
      content: m.content,
      name: apiName,
    };
  };

  // No compression needed — history fits within threshold
  if (history.length <= compressionThreshold) {
    // Still respect maxTurns for API window, but no compression
    const windowStart = Math.max(0, history.length - maxTurns);
    const sliced = history.slice(windowStart);
    return {
      apiMessages: sliced.map(toApiMessage),
      needsCompression: false,
      staleMessages: [],
    };
  }

  // === Sliding window batch compression ===
  // Split: staleMessages (oldest, to be summarized) + activeMessages (newest, sent to LLM)
  const staleCount = history.length - retainCount;
  const staleMessages = history.slice(0, staleCount);
  const activeMessages = history.slice(staleCount);

  console.log(`[PromptAssembler::Compression] Sliding window: contextWindow=${contextWindow}, threshold=${compressionThreshold}, history=${history.length}, stale=${staleMessages.length}, active=${activeMessages.length}`);

  // Detect unpaired tool boundaries in the active window
  const activeApi = activeMessages.map(toApiMessage);
  const unpaired = messagesHaveUnpairedToolBoundary(activeApi);
  if (unpaired > 0) {
    // Expand active window to include the unpaired boundary
    const extraStaleCount = Math.max(0, staleCount - unpaired - 2);
    const adjustedStale = history.slice(0, extraStaleCount);
    const adjustedActive = history.slice(extraStaleCount);
    console.log(`[PromptAssembler::Compression] Adjusted for unpaired tool boundary: stale=${adjustedStale.length}, active=${adjustedActive.length}`);
    return {
      apiMessages: adjustedActive.map(toApiMessage),
      needsCompression: true,
      staleMessages: adjustedStale,
    };
  }

  return {
    apiMessages: activeApi,
    needsCompression: true,
    staleMessages,
  };
}
