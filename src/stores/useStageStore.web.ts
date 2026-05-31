// Web in-memory implementation of the Stage store.
// Characters come from ArchiveStore, messages are stored in memory.
// LLM calls go through the real streaming API client.
import { create } from 'zustand';
import { Character, ChatMessage, Stage } from '../types';
import { useArchiveStore } from './useArchiveStore';
import { useSettingsStore } from './useSettingsStore';
import * as secureStore from '../services/secureStore';
import { streamChat, LLMConfig } from '../services/api/client';
import { assembleSystemPrompt, buildApiMessages, summarizeStage } from '../services/api/promptAssembler';
import { decideNextSpeakerWindow } from '../services/scheduler/hybridRouter';

const STORAGE_KEY = 'genesis_stage';

interface StageState {
  stage: Stage | null;
  /** ALL messages for the current stage (all branches). */
  allMessages: ChatMessage[];
  characters: Character[];
  isStreaming: boolean;
  streamingContent: string;
  currentSpeaker: string | null;
  activeBranchId: string | null;
  apiError: string | null;
  runtimeActivity: Map<string, number>;
  stageSummary: string;
  lastPrompt: { system: string; messages: string } | null;
  pendingSwitch: { targetBranchId: string; forkIndex: number } | null;
  forkIndex: number;

  createStage: (name: string, characterIds: string[], worldIds?: string[], openingScene?: string, characterStatuses?: Record<string, string>) => Promise<void>;
  selectStage: (stageId: string) => Promise<void>;
  loadStage: (stageId: string) => Promise<void>;
  sendMessage: (content: string, senderType: ChatMessage['senderType'], senderName: string, senderAvatar: string, senderId?: string) => void;
  triggerAutoReply: () => Promise<void>;
  clearStage: () => Promise<void>;
  clearApiError: () => void;
  regenerateMessage: (msgId: string) => Promise<void>;
  deleteMessage: (msgId: string) => Promise<void>;
  deleteBranch: (branchId: string, msgId: string) => Promise<void>;
  prepareSwitchBranch: (targetBranchId: string) => void;
  switchBranch: (branchId: string) => void;
  clearPendingSwitch: () => void;
  getBranches: () => Array<{ branchId: string; label: string; msgCount: number }>;
}

interface PersistedStage {
  stage: Stage | null;
  messages: ChatMessage[];
}

function loadFromStorage(): PersistedStage {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { stage: null, messages: [] };
    return JSON.parse(raw);
  } catch {
    return { stage: null, messages: [] };
  }
}

function saveToStorage(data: PersistedStage) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    console.warn('[Stage] localStorage write failed');
  }
}

/** Filter messages by branchId. */
function filterByBranch(messages: ChatMessage[], branchId: string | null): ChatMessage[] {
  if (!branchId) return messages;
  return messages.filter((m) => m.branchId === branchId);
}

/**
 * Find the fork point between two branches.
 * Compares by content+senderId (not ID) to find the true divergence point.
 * Returns the ID of the first message in targetBranch that differs from currentBranch.
 */
function findForkPointId(allMessages: ChatMessage[], currentBranchId: string, targetBranchId: string): string | null {
  const currentMsgs = filterByBranch(allMessages, currentBranchId);
  const targetMsgs = filterByBranch(allMessages, targetBranchId);

  const minLen = Math.min(currentMsgs.length, targetMsgs.length);
  for (let i = 0; i < minLen; i++) {
    const isSameContent = currentMsgs[i].content === targetMsgs[i].content
      && currentMsgs[i].senderId === targetMsgs[i].senderId;
    if (!isSameContent) {
      return targetMsgs[i].id;
    }
  }
  if (targetMsgs.length > currentMsgs.length) {
    return targetMsgs[currentMsgs.length].id;
  }
  return null;
}

/**
 * Find the fork point index in the CURRENT branch (for scroll target).
 * Returns the index of the first message where content diverges.
 */
function findForkPointIndex(allMessages: ChatMessage[], currentBranchId: string, targetBranchId: string): number {
  const currentMsgs = filterByBranch(allMessages, currentBranchId);
  const targetMsgs = filterByBranch(allMessages, targetBranchId);

  const minLen = Math.min(currentMsgs.length, targetMsgs.length);
  for (let i = 0; i < minLen; i++) {
    const isSameContent = currentMsgs[i].content === targetMsgs[i].content
      && currentMsgs[i].senderId === targetMsgs[i].senderId;
    if (!isSameContent) {
      return i;
    }
  }
  return currentMsgs.length;
}

export const useStageStore = create<StageState>((set, get) => ({
  stage: null,
  allMessages: [],
  characters: [],
  isStreaming: false,
  streamingContent: '',
  currentSpeaker: null,
  activeBranchId: null,
  apiError: null,
  runtimeActivity: new Map(),
  stageSummary: '',
  lastPrompt: null,
  pendingSwitch: null,
  forkIndex: -1,

  createStage: async (name, characterIds, worldIds, openingScene, characterStatuses) => {
    console.log(`[Stage::Web] createStage: "${name}" with ${characterIds.length} characters`);
    const chars = useArchiveStore.getState().characters.filter((c) => characterIds.includes(c.id));
    const snapshots: Record<string, { name: string; avatar: string; coreSetting: string; activityLevel: number; ambientColor: string }> = {};
    for (const c of chars) {
      snapshots[c.id] = { name: c.name, avatar: c.avatar, coreSetting: c.coreSetting, activityLevel: c.activityLevel ?? 5, ambientColor: c.ambientColor };
    }

    const stage: Stage = {
      id: crypto.randomUUID(),
      name,
      worldIds: worldIds || [],
      characterIds,
      systemPrompt: null,
      characterSnapshots: snapshots,
      openingScene: openingScene || undefined,
      characterStatuses: characterStatuses || undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    console.log(`[Stage::Web] createStage: saved ${Object.keys(snapshots).length} character snapshots, openingScene=${!!openingScene}`);
    set({ stage, allMessages: [], characters: chars, activeBranchId: null, runtimeActivity: new Map(chars.map((c) => [c.id, c.activityLevel ?? 5])) });
    saveToStorage({ stage, messages: [] });
  },

  selectStage: async (stageId: string) => {
    console.log(`[Stage::Web] selectStage: ${stageId}`);
    await get().loadStage(stageId);
  },

  loadStage: async (_stageId: string) => {
    const persisted = loadFromStorage();
    const stage = persisted.stage;
    const allChars = useArchiveStore.getState().characters;
    let allMessages = persisted.messages || [];

    const stageIds = stage?.characterIds || [];
    const liveChars = allChars.filter((c) => stageIds.includes(c.id));
    const liveIds = new Set(liveChars.map((c) => c.id));
    const restoredFromSnapshot: Character[] = [];
    if (stage?.characterSnapshots) {
      for (const charId of stageIds) {
        if (!liveIds.has(charId) && stage.characterSnapshots[charId]) {
          const snap = stage.characterSnapshots[charId];
          console.log(`[Stage::Web] loadStage: ${charId} deleted from archive, restoring from snapshot`);
          restoredFromSnapshot.push({
            id: charId,
            name: snap.name,
            avatar: snap.avatar,
            coreSetting: snap.coreSetting,
            activityLevel: snap.activityLevel,
            ambientColor: snap.ambientColor,
          });
        }
      }
    }

    const chars = [...liveChars, ...restoredFromSnapshot];
    let activeBranch: string | null = null;
    if (allMessages.length > 0) {
      activeBranch = allMessages[allMessages.length - 1].branchId;
    }

    // Auto-inject opening scene as narrator message if messages are empty
    if (allMessages.length === 0 && stage?.openingScene) {
      const openingBranchId = crypto.randomUUID();
      const openingMsg: ChatMessage = {
        id: crypto.randomUUID(),
        stageId: stage.id,
        senderType: 'narrator',
        senderName: '',
        senderAvatar: '',
        senderId: null,
        content: stage.openingScene,
        branchId: openingBranchId,
        isSelected: true,
        timestamp: Date.now(),
      };
      allMessages = [openingMsg];
      activeBranch = openingBranchId;
      saveToStorage({ stage, messages: allMessages });
      console.log(`[Stage::Web] loadStage: injected opening scene narrator message, branch=${openingBranchId}`);
    }

    set({
      stage,
      allMessages,
      characters: chars,
      activeBranchId: activeBranch,
      runtimeActivity: new Map(chars.map((c) => [c.id, c.activityLevel ?? 5])),
      stageSummary: stage?.stageSummary || '',
    });
  },

  sendMessage: (content, senderType, senderName, senderAvatar, senderId) => {
    const { stage, allMessages, activeBranchId } = get();
    if (!stage) return;

    const branchId = activeBranchId || crypto.randomUUID();

    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      stageId: stage.id,
      senderType,
      senderName,
      senderAvatar,
      senderId: senderId || null,
      content,
      branchId,
      isSelected: true,
      timestamp: Date.now(),
    };

    const newMessages = [...allMessages, msg];
    set({ allMessages: newMessages, activeBranchId: branchId });
    saveToStorage({ stage: get().stage, messages: newMessages });

    if (senderType !== 'character') {
      get().triggerAutoReply();
    }
  },

  triggerAutoReply: async () => {
    const state = get();
    const { stage, allMessages, characters, activeBranchId } = state;
    if (!stage || characters.length === 0) return;

    const branchMessages = filterByBranch(allMessages, activeBranchId);
    const settings = useSettingsStore.getState();
    const apiKey = await secureStore.getApiKey();
    const baseUrl = await secureStore.getBaseUrl();
    const model = await secureStore.getModel();
    if (!apiKey || !baseUrl) {
      console.warn('[Stage::AutoReply] No API credentials configured');
      return;
    }

    const lastMsg = branchMessages[branchMessages.length - 1];
    const { nextSpeakerId, reason } = decideNextSpeakerWindow(
      characters,
      branchMessages.map((m) => ({ content: m.content, senderId: m.senderId })),
      state.runtimeActivity,
    );
    console.log(`[Stage::Scheduler] Reason: ${reason}, nextSpeakerId: ${nextSpeakerId}`);

    const speaker = nextSpeakerId ? characters.find((c) => c.id === nextSpeakerId) : null;
    if (!speaker) return;

    const worldLore = stage.worldIds
      .map((wid) => useArchiveStore.getState().worlds.find((w) => w.id === wid)?.lore)
      .filter(Boolean)
      .join('\n\n');

    // Gather lore entries from associated worlds
    const loreEntries = stage.worldIds
      .flatMap((wid) => useArchiveStore.getState().worlds.find((w) => w.id === wid)?.loreEntries || []);

    const { apiMessages: recentMessages, needsCompression, staleMessages } = buildApiMessages(branchMessages, settings.contextWindow, speaker.id, settings.contextWindow);

    // Use persisted stageSummary as the current summary for this turn
    const currentSummary = stage.stageSummary || '';

    // Fire off async compression in the background (non-blocking)
    if (needsCompression && staleMessages.length > 0) {
      const oldSummary = stage.stageSummary || '';
      console.log(`[Stage::Compression] Triggering async compression: ${staleMessages.length} stale messages, oldSummary=${oldSummary.length} chars`);

      const compressConfig: LLMConfig = {
        apiKey, baseUrl, model: model || 'gpt-4o-mini', temperature: 0.2, maxTokens: 200,
      };
      summarizeStage(staleMessages, oldSummary, compressConfig)
        .then((newSummary) => {
          if (newSummary) {
            console.log(`[Stage::Compression] Async compression done: ${newSummary.length} chars`);
            set((s) => ({
              stageSummary: newSummary,
              stage: s.stage ? { ...s.stage, stageSummary: newSummary } : null,
            }));
            saveToStorage({ stage: get().stage, messages: get().allMessages });
          }
        })
        .catch((e) => console.error('[Stage::Compression] Async compression failed:', e));
    }

    // Recent message contents for lore keyword scanning (last 5 messages)
    const recentMessageContents = branchMessages.slice(-5).map((m) => m.content);

    // Character initial status from stage.characterStatuses
    const initialStatus = stage.characterStatuses?.[speaker.id] || undefined;

    const systemPrompt = assembleSystemPrompt({
      characters, worldLore: worldLore || undefined, speakerId: speaker.id,
      stageSummary: currentSummary, lastSpeakerName: lastMsg?.senderName,
      initialStatus,
      loreEntries: loreEntries.length > 0 ? loreEntries : undefined,
      recentMessageContents,
    }, stage.systemPrompt || settings.customPromptTemplate || undefined);

    const config: LLMConfig = {
      apiKey, baseUrl, model: model || 'gpt-4o-mini',
      temperature: settings.temperature, maxTokens: settings.maxTokens,
    };

    set({ isStreaming: true, streamingContent: '…', currentSpeaker: speaker.name });

    try {
      let fullContent = '';
      const stream = streamChat({ systemPrompt, messages: recentMessages, config });
      for await (const chunk of stream) {
        fullContent += chunk;
        set({ streamingContent: fullContent });
      }

      const replyBranchId = activeBranchId || crypto.randomUUID();
      const replyMsg: ChatMessage = {
        id: crypto.randomUUID(),
        stageId: stage.id,
        senderType: 'character',
        senderName: speaker.name,
        senderAvatar: speaker.avatar,
        senderId: speaker.id,
        content: fullContent,
        branchId: replyBranchId,
        isSelected: true,
        timestamp: Date.now(),
      };

      const newMessages = [...get().allMessages, replyMsg];
      set({ allMessages: newMessages, streamingContent: '', isStreaming: false, currentSpeaker: null });
      saveToStorage({ stage: get().stage, messages: newMessages });
    } catch (e) {
      console.error('[Stage::LLM] API error:', e);
      set({ isStreaming: false, streamingContent: '', currentSpeaker: null, apiError: e instanceof Error ? e.message : String(e) });
    }
  },

  clearStage: async () => {
    set({ allMessages: [], streamingContent: '', isStreaming: false, currentSpeaker: null, activeBranchId: null });
    saveToStorage({ stage: get().stage, messages: [] });
  },

  clearApiError: () => {
    set({ apiError: null });
  },

  regenerateMessage: async (msgId: string) => {
    const state = get();
    const { stage, allMessages, characters, activeBranchId, isStreaming } = state;
    if (!stage || characters.length === 0) return;

    // Step 1: Abort
    if (isStreaming) {
      console.warn('[Stage::Regen] Aborting in-progress stream');
      set({ isStreaming: false, streamingContent: '', currentSpeaker: null });
    }

    // Step 2: Fork — find target in active branch
    const branchMessages = filterByBranch(allMessages, activeBranchId);
    const msgIdx = branchMessages.findIndex((m) => m.id === msgId);
    if (msgIdx < 0) return;

    const targetMsg = branchMessages[msgIdx];
    if (targetMsg.senderType !== 'character') return;

    const ancestorMessages = branchMessages.slice(0, msgIdx);
    const newBranchId = `branch-${Date.now()}`;

    console.log(`[Stage::Regen] Forking at index ${msgIdx}, ancestorCount=${ancestorMessages.length}, newBranch=${newBranchId}`);

    const speaker = characters.find((c) => c.id === targetMsg.senderId);
    if (!speaker) return;

    const settings = useSettingsStore.getState();
    const apiKey = await secureStore.getApiKey();
    const baseUrl = await secureStore.getBaseUrl();
    const model = await secureStore.getModel();
    if (!apiKey || !baseUrl) return;

    // Step 3: Copy ancestors into new branch (in-memory)
    const newBranchMessages: ChatMessage[] = ancestorMessages.map((m) => ({
      ...m,
      id: crypto.randomUUID(),
      branchId: newBranchId,
    }));

    // Step 4: Switch activeBranchId immediately
    set({
      allMessages: [...allMessages, ...newBranchMessages],
      isStreaming: true,
      streamingContent: '…',
      currentSpeaker: speaker.name,
      activeBranchId: newBranchId,
    });

    // Step 5: Stream & Persist
    const worldLore = stage.worldIds
      .map((wid) => useArchiveStore.getState().worlds.find((w) => w.id === wid)?.lore)
      .filter(Boolean)
      .join('\n\n');

    // Gather lore entries from associated worlds
    const loreEntries = stage.worldIds
      .flatMap((wid) => useArchiveStore.getState().worlds.find((w) => w.id === wid)?.loreEntries || []);

    const { apiMessages: recentMessages } = buildApiMessages(newBranchMessages, settings.contextWindow, speaker.id, settings.contextWindow);

    // Recent message contents for lore keyword scanning (last 5 messages)
    const recentMessageContents = newBranchMessages.slice(-5).map((m) => m.content);

    // Character initial status from stage.characterStatuses
    const initialStatus = stage.characterStatuses?.[speaker.id] || undefined;

    // Use persisted stageSummary for regeneration context
    const currentSummary = stage.stageSummary || '';

    const systemPrompt = assembleSystemPrompt({
      characters, worldLore: worldLore || undefined, speakerId: speaker.id,
      stageSummary: currentSummary,
      lastSpeakerName: newBranchMessages.length > 0 ? newBranchMessages[newBranchMessages.length - 1].senderName : undefined,
      initialStatus,
      loreEntries: loreEntries.length > 0 ? loreEntries : undefined,
      recentMessageContents,
    }, stage.systemPrompt || settings.customPromptTemplate || undefined);

    const config: LLMConfig = {
      apiKey, baseUrl, model: model || 'gpt-4o-mini',
      temperature: settings.temperature, maxTokens: settings.maxTokens,
    };

    try {
      let fullContent = '';
      const stream = streamChat({ systemPrompt, messages: recentMessages, config });
      for await (const chunk of stream) {
        fullContent += chunk;
        set({ streamingContent: fullContent });
      }

      console.log(`[Stage::Regen] Done, ${fullContent.length} chars`);

      const newMsg: ChatMessage = {
        ...targetMsg,
        id: crypto.randomUUID(),
        branchId: newBranchId,
        content: fullContent,
        timestamp: Date.now(),
      };

      const newMessages = [...get().allMessages, newMsg];
      set({ allMessages: newMessages, streamingContent: '', isStreaming: false, currentSpeaker: null });
      saveToStorage({ stage: get().stage, messages: newMessages });
    } catch (e) {
      console.error('[Stage::Regen] API error:', e);
      set({
        isStreaming: false, streamingContent: '', currentSpeaker: null,
        apiError: e instanceof Error ? e.message : String(e),
      });
    }
  },

  deleteMessage: async (msgId: string) => {
    const { allMessages } = get();
    const msg = allMessages.find((m) => m.id === msgId);
    if (!msg) return;
    const newMessages = allMessages.filter((m) => m.id !== msgId);
    set({ allMessages: newMessages });
    saveToStorage({ stage: get().stage, messages: newMessages });
  },

  deleteBranch: async (branchId: string, msgId: string) => {
    const { allMessages } = get();
    const target = allMessages.find((m) => m.id === msgId);
    if (!target) return;

    const msgsToDelete = allMessages.filter(
      (m) => m.branchId === branchId && m.timestamp >= target.timestamp,
    );
    const keepIds = new Set(msgsToDelete.map((m) => m.id));
    const newMessages = allMessages.filter((m) => !keepIds.has(m.id));
    set({ allMessages: newMessages });
    saveToStorage({ stage: get().stage, messages: newMessages });

    const state = get();
    if (state.activeBranchId === branchId) {
      const remaining = [...new Set(state.allMessages.map((m) => m.branchId))];
      set({ activeBranchId: remaining.length > 0 ? remaining[0] : null });
    }
  },

  prepareSwitchBranch: (targetBranchId: string) => {
    const { allMessages, activeBranchId } = get();
    if (!activeBranchId) return;

    const forkIdx = findForkPointIndex(allMessages, activeBranchId, targetBranchId);
    console.log(`[Stage::PrepareSwitch] target=${targetBranchId}, forkIndex=${forkIdx}`);
    set({ pendingSwitch: { targetBranchId, forkIndex: forkIdx } });
  },

  switchBranch: (branchId: string) => {
    const { allMessages, activeBranchId } = get();
    console.log(`[Stage::Branch] Switching from=${activeBranchId} to=${branchId}`);

    const newForkIndex = activeBranchId
      ? findForkPointIndex(allMessages, branchId, activeBranchId)
      : -1;

    set({ activeBranchId: branchId, forkIndex: newForkIndex, pendingSwitch: null });
    console.log(`[Stage::Branch] forkIndex=${newForkIndex}`);
  },

  clearPendingSwitch: () => {
    set({ pendingSwitch: null });
  },

  getBranches: () => {
    const { allMessages } = get();
    if (allMessages.length === 0) return [];

    const allBranchIds = [...new Set(allMessages.map((m) => m.branchId))];
    return allBranchIds.map((bid, idx) => ({
      branchId: bid,
      label: `#${idx + 1}`,
      msgCount: allMessages.filter((m) => m.branchId === bid).length,
    }));
  },
}));
