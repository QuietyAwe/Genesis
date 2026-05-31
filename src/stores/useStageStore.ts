import { create } from 'zustand';
import { Character, ChatMessage, Stage } from '../types';
import * as stageDao from '../services/db/stageDao';
import * as chatDao from '../services/db/chatDao';
import * as characterDao from '../services/db/characterDao';
import * as secureStore from '../services/secureStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { streamChat, LLMConfig } from '../services/api/client';
import { assembleSystemPrompt, buildApiMessages, summarizeStage } from '../services/api/promptAssembler';
import { decideNextSpeakerWindow } from '../services/scheduler/hybridRouter';
import * as worldDao from '../services/db/worldDao';

// Fallback for crypto.randomUUID on older Android / React Native environments
function generateId(): string {
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}

interface StageState {
  stage: Stage | null;
  /** ALL messages for the current stage (all branches). The source of truth for branch enumeration. */
  allMessages: ChatMessage[];
  characters: Character[];
  isStreaming: boolean;
  streamingContent: string;
  currentSpeaker: string | null;
  activeBranchId: string | null;
  apiError: string | null;
  /** Runtime activity levels, reset on each stage entry. Pure in-memory, never persisted. */
  runtimeActivity: Map<string, number>;
  /** Generated stage summary — visible to both LLM and player UI. */
  stageSummary: string;
  /** Last sent LLM prompt — for debugging/inspection. */
  lastPrompt: { system: string; messages: string } | null;
  /** Pending branch switch — triggers scroll-first transition in UI. */
  pendingSwitch: { targetBranchId: string; forkIndex: number } | null;
  /** Index of first divergent message AFTER switch completes (for fade-in animation). */
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

/** Filter messages by branchId. If branchId is null, returns all messages. */
function filterByBranch(messages: ChatMessage[], branchId: string | null): ChatMessage[] {
  if (!branchId) return messages;
  return messages.filter((m) => m.branchId === branchId);
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
  // If target is longer, divergence starts at the end of current branch
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

  createStage: async (name: string, characterIds: string[], worldIds?: string[], openingScene?: string, characterStatuses?: Record<string, string>) => {
    console.log(`[Stage::DB] createStage: "${name}" with ${characterIds.length} characters`);
    const id = generateId();
    const now = Date.now();

    const allChars = await characterDao.getAllCharacters();
    const chars = allChars.filter((c) => characterIds.includes(c.id));
    const snapshots: Record<string, { name: string; avatar: string; coreSetting: string; activityLevel: number; ambientColor: string }> = {};
    for (const c of chars) {
      snapshots[c.id] = { name: c.name, avatar: c.avatar, coreSetting: c.coreSetting, activityLevel: c.activityLevel ?? 5, ambientColor: c.ambientColor };
    }

    const stage: Stage = {
      id,
      name,
      worldIds: worldIds || [],
      characterIds,
      systemPrompt: null,
      characterSnapshots: snapshots,
      openingScene: openingScene || undefined,
      characterStatuses: characterStatuses || undefined,
      createdAt: now,
      updatedAt: now,
    };

    await stageDao.createStage(stage);
    console.log(`[Stage::DB] createStage: saved ${Object.keys(snapshots).length} character snapshots, openingScene=${!!openingScene}`);

    const runtimeActivity = new Map(chars.map((c) => [c.id, c.activityLevel ?? 5]));
    set({ stage, allMessages: [], characters: chars, activeBranchId: null, runtimeActivity });
  },

  selectStage: async (stageId: string) => {
    console.log(`[Stage::DB] selectStage: ${stageId}`);
    await get().loadStage(stageId);
  },

  /**
   * Load a stage and populate allMessages from DB.
   * activeBranchId defaults to the last message's branchId (most recent timeline).
   * If opening_scene exists and messages are empty, auto-create a narrator message.
   */
  loadStage: async (stageId: string) => {
    const stages = await stageDao.getAllStages();
    const stage = stages.find((s) => s.id === stageId);
    if (!stage) return;

    // STRICT: load ALL messages for this stage from DB
    let allMessages = await chatDao.getMessagesByStage(stageId);

    // Determine activeBranchId: default to the last message's branch
    let activeBranch: string | null = null;
    if (allMessages.length > 0) {
      activeBranch = allMessages[allMessages.length - 1].branchId;
    }

    // Resolve characters: prefer live, fall back to snapshots
    const allChars = await characterDao.getAllCharacters();
    const liveChars = allChars.filter((c) => stage.characterIds.includes(c.id));
    const liveIds = new Set(liveChars.map((c) => c.id));
    const restoredFromSnapshot: Character[] = [];
    if (stage.characterSnapshots) {
      for (const charId of stage.characterIds) {
        if (!liveIds.has(charId) && stage.characterSnapshots[charId]) {
          const snap = stage.characterSnapshots[charId];
          console.log(`[Stage::DB] loadStage: ${charId} deleted from archive, restoring from snapshot`);
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
    const runtimeActivity = new Map(chars.map((c) => [c.id, c.activityLevel ?? 5]));

    // Auto-inject opening scene as narrator message if messages are empty
    if (allMessages.length === 0 && stage.openingScene) {
      const openingBranchId = generateId();
      const openingMsg: ChatMessage = {
        id: generateId(),
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
      await chatDao.createMessage(openingMsg);
      allMessages = [openingMsg];
      activeBranch = openingBranchId;
      console.log(`[Stage::DB] loadStage: injected opening scene narrator message, branch=${openingBranchId}`);
    }

    set({
      stage,
      allMessages,
      characters: chars,
      activeBranchId: activeBranch,
      runtimeActivity,
      stageSummary: stage.stageSummary || '',
    });
    console.log(`[Stage::DB] loadStage: ${chars.length} chars, ${allMessages.length} total msgs, activeBranch=${activeBranch}, summary=${(stage.stageSummary || '').length} chars`);
  },

  /**
   * Send a message on the current active branch.
   * Inherits branchId from activeBranchId (or creates a new root branch).
   */
  sendMessage: (content, senderType, senderName, senderAvatar, senderId) => {
    const { stage, allMessages, activeBranchId } = get();
    if (!stage) return;

    const branchId = activeBranchId || generateId();

    const msg: ChatMessage = {
      id: generateId(),
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

    chatDao.createMessage(msg).catch((e) =>
      console.error('[Stage::DB] sendMessage createMessage failed:', e),
    );
    set((s) => ({
      allMessages: [...s.allMessages, msg],
      activeBranchId: branchId,
    }));

    if (senderType !== 'character') {
      get().triggerAutoReply();
    }
  },

  /**
   * Auto-reply chain. Uses the current active branch's messages as context.
   * New replies are appended to the same active branch.
   */
  triggerAutoReply: async () => {
    const state = get();
    const { stage, allMessages, characters, runtimeActivity, activeBranchId } = state;
    if (!stage) {
      console.warn('[Stage::AutoReply] No stage loaded, aborting');
      return;
    }
    if (characters.length === 0) {
      console.warn('[Stage::AutoReply] No characters on stage, aborting');
      return;
    }

    // STRICT: only use messages from the active branch
    const branchMessages = filterByBranch(allMessages, activeBranchId);
    console.log(`[Stage::AutoReply] branch=${activeBranchId}, chars=${characters.length}, msgs=${branchMessages.length}`);

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
      runtimeActivity,
    );
    console.log(`[Stage::Scheduler] Reason: ${reason}, nextSpeakerId: ${nextSpeakerId}`);

    const speaker = nextSpeakerId
      ? characters.find((c) => c.id === nextSpeakerId)
      : null;

    if (!speaker) return;

    const worldLore = (await Promise.all(
      stage.worldIds.map((wid) => worldDao.getWorldById(wid)),
    ))
      .filter(Boolean)
      .map((w) => w!.lore)
      .filter(Boolean)
      .join('\n\n');

    // Gather lore entries from associated worlds
    const worlds = (await Promise.all(
      stage.worldIds.map((wid) => worldDao.getWorldById(wid)),
    )).filter(Boolean);
    const loreEntries = worlds.flatMap((w) => w!.loreEntries || []);

    const { apiMessages: recentMessages, needsCompression, staleMessages } = buildApiMessages(branchMessages, settings.contextWindow, speaker.id, settings.contextWindow);

    // Use persisted stageSummary as the current summary for this turn
    const currentSummary = stage.stageSummary || '';

    // Fire off async compression in the background (non-blocking)
    if (needsCompression && staleMessages.length > 0) {
      const oldSummary = stage.stageSummary || '';
      console.log(`[Stage::Compression] Triggering async compression: ${staleMessages.length} stale messages, oldSummary=${oldSummary.length} chars`);

      // Background compression — do NOT await
      const compressConfig: LLMConfig = {
        apiKey,
        baseUrl,
        model: model || 'gpt-4o-mini',
        temperature: 0.2,
        maxTokens: 200,
      };
      summarizeStage(staleMessages, oldSummary, compressConfig)
        .then(async (newSummary) => {
          if (newSummary) {
            console.log(`[Stage::Compression] Async compression done: ${newSummary.length} chars`);
            // Persist to DB
            await stageDao.updateStage(stage.id, { stageSummary: newSummary }).catch((e) =>
              console.error('[Stage::DB] Failed to persist stage summary:', e),
            );
            // Update store
            set((s) => ({
              stageSummary: newSummary,
              stage: s.stage ? { ...s.stage, stageSummary: newSummary } : null,
            }));
          }
        })
        .catch((e) => console.error('[Stage::Compression] Async compression failed:', e));
    }

    // Recent message contents for lore keyword scanning (last 5 messages)
    const recentMessageContents = branchMessages.slice(-5).map((m) => m.content);

    // Character initial status from stage.characterStatuses
    const initialStatus = stage.characterStatuses?.[speaker.id] || undefined;

    const systemPrompt = assembleSystemPrompt({
      characters,
      worldLore: worldLore || undefined,
      speakerId: speaker.id,
      stageSummary: currentSummary,
      lastSpeakerName: lastMsg?.senderName,
      initialStatus,
      loreEntries: loreEntries.length > 0 ? loreEntries : undefined,
      recentMessageContents,
    }, stage.systemPrompt || settings.customPromptTemplate || undefined);

    const config: LLMConfig = {
      apiKey,
      baseUrl,
      model: model || 'gpt-4o-mini',
      temperature: settings.temperature,
      maxTokens: settings.maxTokens,
    };

    const formattedMessages = recentMessages
      .map((m) => `[${m.role}]${m.name ? ` ${m.name}` : ''}: ${m.content}`)
      .join('\n\n');
    set({ lastPrompt: { system: systemPrompt, messages: formattedMessages } });

    set({ isStreaming: true, streamingContent: '…', currentSpeaker: speaker.name });

    try {
      let fullContent = '';
      const stream = streamChat({ systemPrompt, messages: recentMessages, config });

      for await (const chunk of stream) {
        fullContent += chunk;
        set({ streamingContent: fullContent });
      }

      // CRITICAL: append to the SAME active branch
      const replyBranchId = activeBranchId || generateId();

      const replyMsg: ChatMessage = {
        id: generateId(),
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

      await chatDao.createMessage(replyMsg);

      const newRuntimeActivity = new Map(state.runtimeActivity);
      const speakerLevel = newRuntimeActivity.get(speaker.id) ?? speaker.activityLevel ?? 5;
      newRuntimeActivity.set(speaker.id, Math.max(0, speakerLevel - 2));
      const others = characters.filter((c) => c.id !== speaker.id);
      const lucky: typeof characters = [];
      const othersCopy = [...others];
      for (let i = 0; i < Math.min(2, othersCopy.length); i++) {
        const idx = Math.floor(Math.random() * othersCopy.length);
        lucky.push(othersCopy.splice(idx, 1)[0]);
      }
      for (const c of lucky) {
        const level = newRuntimeActivity.get(c.id) ?? c.activityLevel ?? 5;
        newRuntimeActivity.set(c.id, level + 1);
      }
      const luckyStr = lucky.map((c) => `${c.name} +1`).join(', ');
      console.log(`[Stage::Activity] ${speaker.name} -2 → ${Math.max(0, speakerLevel - 2)}${luckyStr ? `, ${luckyStr}` : ''}`);

      set((s) => ({
        allMessages: [...s.allMessages, replyMsg],
        streamingContent: '',
        isStreaming: false,
        currentSpeaker: null,
        runtimeActivity: newRuntimeActivity,
        stageSummary: s.stageSummary, // keep existing — async compression will update it
      }));
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      console.error('[Stage] API error:', errMsg);
      set({ isStreaming: false, streamingContent: '', currentSpeaker: null, apiError: errMsg });
    }
  },

  clearStage: async () => {
    const { stage } = get();
    if (!stage) return;
    await chatDao.deleteAllMessages(stage.id);
    set({ allMessages: [], streamingContent: '', isStreaming: false, currentSpeaker: null, activeBranchId: null });
  },

  clearApiError: () => {
    set({ apiError: null });
  },

  /**
   * Regenerate a character message by forking a new parallel branch.
   *
   * STRICT TRANSACTION (5 steps):
   * 1. Abort — interrupt any in-progress streaming
   * 2. Fork — find target index, extract ancestor tree (prefix before target)
   * 3. New World — generate newBranchId, copy ancestor tree into new branch in DB
   * 4. Switch — set activeBranchId to newBranchId
   * 5. Stream & Persist — LLM streams content, final message saved with newBranchId
   *
   * Each branch is physically isolated by branchId in both DB and store.
   * Old branch messages are NEVER modified — they remain queryable for branch switching.
   */
  regenerateMessage: async (msgId: string) => {
    const state = get();
    const { stage, allMessages, characters, activeBranchId, isStreaming } = state;
    if (!stage || characters.length === 0) return;

    // === Step 1: Abort — interrupt any in-progress streaming ===
    if (isStreaming) {
      console.warn('[Stage::Regen] Aborting in-progress stream before forking');
      set({ isStreaming: false, streamingContent: '', currentSpeaker: null });
    }

    // Get messages for the current active branch only
    const branchMessages = filterByBranch(allMessages, activeBranchId);
    const msgIdx = branchMessages.findIndex((m) => m.id === msgId);
    if (msgIdx < 0) return;

    const targetMsg = branchMessages[msgIdx];
    if (targetMsg.senderType !== 'character') return;

    // === Step 2: Fork — extract ancestor tree ===
    const ancestorMessages = branchMessages.slice(0, msgIdx); // shared prefix
    const newBranchId = `branch-${Date.now()}`;

    console.log(`[Stage::Regen] Forking at index ${msgIdx}, ancestorCount=${ancestorMessages.length}, oldBranch=${targetMsg.branchId}, newBranch=${newBranchId}`);

    // Capture speaker — bypass hybridRouter entirely
    const speaker = characters.find((c) => c.id === targetMsg.senderId);
    if (!speaker) return;

    const settings = useSettingsStore.getState();
    const apiKey = await secureStore.getApiKey();
    const baseUrl = await secureStore.getBaseUrl();
    const model = await secureStore.getModel();
    if (!apiKey || !baseUrl) return;

    // === Step 3: New World — copy ancestor tree into new branch in DB ===
    for (const ancestor of ancestorMessages) {
      const copiedMsg: ChatMessage = {
        ...ancestor,
        id: generateId(),
        branchId: newBranchId,
      };
      await chatDao.createMessage(copiedMsg);
    }
    console.log(`[Stage::DB] Copied ${ancestorMessages.length} ancestors to branch=${newBranchId}`);

    // Build in-memory messages for the new branch (will be appended to allMessages)
    const newBranchMessages: ChatMessage[] = ancestorMessages.map((m) => ({
      ...m,
      id: generateId(),
      branchId: newBranchId,
    }));

    // === Step 4: Switch — set activeBranchId to newBranchId immediately ===
    set({
      allMessages: [...allMessages, ...newBranchMessages],
      isStreaming: true,
      streamingContent: '…',
      currentSpeaker: speaker.name,
      activeBranchId: newBranchId,
    });

    // === Step 5: Stream & Persist — assemble payload, stream, save with newBranchId ===
    const worldLore = (await Promise.all(
      stage.worldIds.map((wid) => worldDao.getWorldById(wid)),
    ))
      .filter(Boolean)
      .map((w) => w!.lore)
      .filter(Boolean)
      .join('\n\n');

    // Gather lore entries from associated worlds
    const worlds = (await Promise.all(
      stage.worldIds.map((wid) => worldDao.getWorldById(wid)),
    )).filter(Boolean);
    const loreEntries = worlds.flatMap((w) => w!.loreEntries || []);

    const { apiMessages: recentMessages } = buildApiMessages(newBranchMessages, settings.contextWindow, speaker.id, settings.contextWindow);

    // Recent message contents for lore keyword scanning (last 5 messages)
    const recentMessageContents = newBranchMessages.slice(-5).map((m) => m.content);

    // Character initial status from stage.characterStatuses
    const initialStatus = stage.characterStatuses?.[speaker.id] || undefined;

    // Use persisted stageSummary for regeneration context
    const currentSummary = stage.stageSummary || '';

    const systemPrompt = assembleSystemPrompt({
      characters,
      worldLore: worldLore || undefined,
      speakerId: speaker.id,
      stageSummary: currentSummary,
      lastSpeakerName: newBranchMessages.length > 0 ? newBranchMessages[newBranchMessages.length - 1].senderName : undefined,
      initialStatus,
      loreEntries: loreEntries.length > 0 ? loreEntries : undefined,
      recentMessageContents,
    }, stage.systemPrompt || settings.customPromptTemplate || undefined);

    const config: LLMConfig = {
      apiKey,
      baseUrl,
      model: model || 'gpt-4o-mini',
      temperature: settings.temperature,
      maxTokens: settings.maxTokens,
    };

    try {
      let fullContent = '';
      const stream = streamChat({ systemPrompt, messages: recentMessages, config });
      for await (const chunk of stream) {
        fullContent += chunk;
        set({ streamingContent: fullContent });
      }

      console.log(`[Stage::Regen] Done, ${fullContent.length} chars`);

      // CRITICAL: the new message MUST use newBranchId — never mix old branchId
      const newMsg: ChatMessage = {
        ...targetMsg,
        id: generateId(),
        branchId: newBranchId,
        content: fullContent,
        timestamp: Date.now(),
      };

      await chatDao.createMessage(newMsg);

      set((s) => ({
        allMessages: [...s.allMessages, newMsg],
        streamingContent: '',
        isStreaming: false,
        currentSpeaker: null,
      }));
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      console.error('[Stage::Regen] API error:', errMsg);
      set({
        isStreaming: false,
        streamingContent: '',
        currentSpeaker: null,
        apiError: errMsg,
      });
    }
  },

  deleteMessage: async (msgId: string) => {
    const { allMessages } = get();
    const msg = allMessages.find((m) => m.id === msgId);
    if (!msg) return;
    const newMessages = allMessages.filter((m) => m.id !== msgId);
    set({ allMessages: newMessages });
    await chatDao.deleteMessage(msgId);
    console.log(`[Stage::Delete] Deleted message ${msgId}`);
  },

  deleteBranch: async (branchId: string, msgId: string) => {
    const { allMessages } = get();
    const target = allMessages.find((m) => m.id === msgId);
    if (!target) return;

    const msgsToDelete = allMessages.filter(
      (m) => m.branchId === branchId && m.timestamp >= target.timestamp,
    );
    console.log(`[Stage::Delete] Truncating branch ${branchId} from message ${msgId} (${msgsToDelete.length} messages)`);

    const keepIds = new Set(msgsToDelete.map((m) => m.id));
    const newMessages = allMessages.filter((m) => !keepIds.has(m.id));
    set({ allMessages: newMessages });

    for (const dm of msgsToDelete) {
      await chatDao.deleteMessage(dm.id).catch((e) =>
        console.error('[Stage::DB] deleteBranch deleteMessage failed:', e),
      );
    }

    const state = get();
    if (state.activeBranchId === branchId) {
      const remainingBranches = [...new Set(state.allMessages.map((m) => m.branchId))];
      const newActive = remainingBranches.length > 0 ? remainingBranches[0] : null;
      set({ activeBranchId: newActive });
      console.log(`[Stage::Delete] Switched active branch to ${newActive}`);
    }
  },

  /**
   * Prepare a branch switch — computes fork point index for scroll target.
   * Does NOT change activeBranchId. UI will call switchBranch after scrolling.
   */
  prepareSwitchBranch: (targetBranchId: string) => {
    const { allMessages, activeBranchId } = get();
    if (!activeBranchId) return;

    const forkIdx = findForkPointIndex(allMessages, activeBranchId, targetBranchId);
    console.log(`[Stage::PrepareSwitch] target=${targetBranchId}, forkIndex=${forkIdx}`);
    set({ pendingSwitch: { targetBranchId, forkIndex: forkIdx } });
  },

  /**
   * Actually switch to a different branch (called after scroll completes).
   * Also computes forkIndex in the NEW branch for fade-in animation.
   * STRICT: re-fetch all messages from DB if target branch not in store.
   */
  switchBranch: async (branchId: string) => {
    const { stage, allMessages, activeBranchId } = get();
    if (!stage) return;

    console.log(`[Stage::SwitchBranch] Switching from=${activeBranchId} to=${branchId}`);

    // Compute fork index in the NEW branch (for fade-in animation)
    const newForkIndex = activeBranchId
      ? findForkPointIndex(allMessages, branchId, activeBranchId)
      : -1;

    // Check if we already have this branch in store
    const hasBranch = allMessages.some((m) => m.branchId === branchId);
    if (hasBranch) {
      set({ activeBranchId: branchId, forkIndex: newForkIndex, pendingSwitch: null });
      console.log(`[Stage::SwitchBranch] Branch in store, forkIndex=${newForkIndex}`);
      return;
    }

    // Not in store — re-fetch from DB (e.g., after app restart)
    const freshMessages = await chatDao.getMessagesByStage(stage.id);
    const freshForkIndex = activeBranchId
      ? findForkPointIndex(freshMessages, branchId, activeBranchId)
      : -1;

    console.log(`[Stage::SwitchBranch] Loaded from DB, forkIndex=${freshForkIndex}`);

    set({
      allMessages: freshMessages,
      activeBranchId: branchId,
      forkIndex: freshForkIndex,
      pendingSwitch: null,
      streamingContent: '',
      isStreaming: false,
      currentSpeaker: null,
    });
  },

  clearPendingSwitch: () => {
    set({ pendingSwitch: null });
  },

  /**
   * Enumerate all branches for the current stage.
   * Uses allMessages (which contains ALL branches) for accurate enumeration.
   */
  getBranches: () => {
    const { allMessages } = get();
    if (allMessages.length === 0) return [];

    const allBranchIds = [...new Set(allMessages.map((m) => m.branchId))];

    const branches: Array<{ branchId: string; label: string; msgCount: number }> = [];
    for (let idx = 0; idx < allBranchIds.length; idx++) {
      const bid = allBranchIds[idx];
      const branchMsgs = allMessages.filter((m) => m.branchId === bid);
      branches.push({
        branchId: bid,
        label: `#${idx + 1}`,
        msgCount: branchMsgs.length,
      });
    }
    return branches;
  },
}));
