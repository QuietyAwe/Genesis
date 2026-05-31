import {
  assembleSystemPrompt,
  buildApiMessages,
  BATCH_SIZE,
} from '../services/api/promptAssembler';
import { Character, ChatMessage, LoreEntry } from '../types';

const chars: Character[] = [
  { id: 'c1', name: '西尔维娅', avatar: '🦊', coreSetting: '冷静、敏锐、言辞锋利', activityLevel: 8, ambientColor: '#EDEAE5' },
  { id: 'c2', name: '迦尔纳', avatar: '🔥', coreSetting: '豪迈、冲动、重义气', activityLevel: 7, ambientColor: '#F0EBE3' },
  { id: 'c3', name: '露娜', avatar: '🌙', coreSetting: '温柔、神秘', activityLevel: 6, ambientColor: '#E8E4F0' },
];

function makeMsg(overrides: Partial<ChatMessage> & { content: string }): ChatMessage {
  return {
    id: `msg_${Date.now()}_${Math.random()}`,
    stageId: 'stage1',
    senderType: 'character',
    senderName: 'Test',
    senderAvatar: '🎭',
    senderId: null,
    branchId: 'branch1',
    isSelected: true,
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('assembleSystemPrompt', () => {
  it('replaces all template variables', () => {
    const result = assembleSystemPrompt({
      characters: chars,
      speakerId: 'c1',
      worldLore: '雾港被永雾笼罩',
      stageSummary: '角色们正在酒馆',
      lastSpeakerName: '迦尔纳',
      initialStatus: '受了轻伤',
    });

    expect(result).toContain('西尔维娅');
    expect(result).toContain('冷静、敏锐、言辞锋利');
    expect(result).toContain('雾港被永雾笼罩');
    expect(result).toContain('角色们正在酒馆');
    expect(result).toContain('迦尔纳');
    expect(result).toContain('受了轻伤');
    expect(result).toContain('西尔维娅、迦尔纳、露娜');
  });

  it('uses custom template when provided', () => {
    const custom = '我是{{speaker_name}}，设定：{{speaker_setting}}';
    const result = assembleSystemPrompt({
      characters: chars,
      speakerId: 'c1',
    }, custom);

    expect(result).toBe('我是西尔维娅，设定：冷静、敏锐、言辞锋利');
  });

  it('handles missing speaker gracefully', () => {
    const result = assembleSystemPrompt({
      characters: chars,
      speakerId: undefined,
    });

    expect(result).toContain('西尔维娅、迦尔纳、露娜');
    // speaker_name should be empty
    expect(result).not.toContain('{{speaker_name}}');
  });

  it('injects global lore entries into dynamic_lore', () => {
    const loreEntries: LoreEntry[] = [
      { id: 'le1', isGlobal: true, keywords: [], content: '雾港是港口城市' },
      { id: 'le2', isGlobal: false, keywords: ['酒馆'], content: '破晓酒馆位于码头区' },
    ];

    const result = assembleSystemPrompt({
      characters: chars,
      speakerId: 'c1',
      loreEntries,
      recentMessageContents: ['我们去酒馆吧'],
    });

    expect(result).toContain('雾港是港口城市');
    expect(result).toContain('破晓酒馆位于码头区');
  });

  it('does not inject non-global lore without keyword match', () => {
    const loreEntries: LoreEntry[] = [
      { id: 'le1', isGlobal: false, keywords: ['酒馆'], content: '破晓酒馆位于码头区' },
    ];

    const result = assembleSystemPrompt({
      characters: chars,
      speakerId: 'c1',
      loreEntries,
      recentMessageContents: ['今天天气不错'],
    });

    expect(result).not.toContain('破晓酒馆位于码头区');
  });

  it('does not crash when loreEntries is undefined', () => {
    const result = assembleSystemPrompt({
      characters: chars,
      speakerId: 'c1',
      loreEntries: undefined,
      recentMessageContents: ['你好'],
    });

    expect(result).toBeTruthy();
    expect(result).not.toContain('{{dynamic_lore}}');
  });
});

describe('buildApiMessages', () => {
  it('returns messages within threshold without compression', () => {
    const messages = Array.from({ length: 10 }, (_, i) =>
      makeMsg({ content: `msg ${i}`, senderId: i % 2 === 0 ? 'c1' : 'c2', senderName: i % 2 === 0 ? '西尔维娅' : '迦尔纳' }),
    );

    const result = buildApiMessages(messages, 20, 'c1', 20);
    expect(result.needsCompression).toBe(false);
    expect(result.staleMessages).toHaveLength(0);
    expect(result.apiMessages.length).toBe(10);
  });

  it('triggers compression when exceeding contextWindow + BATCH_SIZE', () => {
    const contextWindow = 15;
    const threshold = contextWindow + BATCH_SIZE; // 25
    const messages = Array.from({ length: threshold + 5 }, (_, i) =>
      makeMsg({ content: `msg ${i}`, senderId: i % 2 === 0 ? 'c1' : 'c2', senderName: i % 2 === 0 ? '西尔维娅' : '迦尔纳' }),
    );

    const result = buildApiMessages(messages, 20, 'c1', contextWindow);
    expect(result.needsCompression).toBe(true);
    expect(result.staleMessages.length).toBeGreaterThan(0);
    // Active messages should equal contextWindow
    expect(result.apiMessages.length).toBe(contextWindow);
  });

  it('respects different contextWindow values', () => {
    // Small contextWindow = 5
    const messages20 = Array.from({ length: 20 }, (_, i) =>
      makeMsg({ content: `msg ${i}`, senderId: 'c1', senderName: '西尔维娅' }),
    );

    const resultSmall = buildApiMessages(messages20, 20, 'c1', 5);
    // threshold = 5 + 10 = 15, 20 > 15 so compression triggers
    expect(resultSmall.needsCompression).toBe(true);
    expect(resultSmall.apiMessages.length).toBe(5);

    // Large contextWindow = 25
    const resultLarge = buildApiMessages(messages20, 20, 'c1', 25);
    // threshold = 25 + 10 = 35, 20 < 35 so no compression
    expect(resultLarge.needsCompression).toBe(false);
    // No compression: returns up to maxTurns messages
    expect(resultLarge.apiMessages.length).toBe(20);
  });

  it('uses default contextWindow=20 when not specified', () => {
    const messages = Array.from({ length: 35 }, (_, i) =>
      makeMsg({ content: `msg ${i}`, senderId: 'c1', senderName: '西尔维娅' }),
    );

    const result = buildApiMessages(messages, 20, 'c1');
    // Default contextWindow=20, threshold=30, 35>30 so compression triggers
    expect(result.needsCompression).toBe(true);
    expect(result.apiMessages.length).toBe(20); // retainCount = contextWindow = 20
  });

  it('applies World-vs-Me role mapping', () => {
    const messages = [
      makeMsg({ content: '你好', senderId: 'c1', senderType: 'character', senderName: '西尔维娅' }),
      makeMsg({ content: '你好呀', senderId: 'c2', senderType: 'character', senderName: '迦尔纳' }),
      makeMsg({ content: '今天如何？', senderId: 'c1', senderType: 'character', senderName: '西尔维娅' }),
    ];

    const result = buildApiMessages(messages, 20, 'c1', 20);

    // c1's messages → assistant role (Me)
    const c1Msgs = result.apiMessages.filter((m) => m.role === 'assistant');
    expect(c1Msgs.length).toBe(2);

    // c2's messages → user role with name (World)
    const c2Msgs = result.apiMessages.filter((m) => m.role === 'user' && m.name);
    expect(c2Msgs.length).toBe(1);
    expect(c2Msgs[0].name).toBeTruthy();
  });

  it('maps narrator messages to user role', () => {
    const messages = [
      makeMsg({ content: '雾气弥漫', senderType: 'narrator', senderName: '', senderId: null }),
    ];

    const result = buildApiMessages(messages, 20, 'c1', 20);
    expect(result.apiMessages[0].role).toBe('user');
    expect(result.apiMessages[0].name).toBe('narrator');
  });

  it('maps guest messages to user role with sanitized name', () => {
    const messages = [
      makeMsg({ content: '你好', senderType: 'guest', senderName: '旅行者', senderId: null }),
    ];

    const result = buildApiMessages(messages, 20, 'c1', 20);
    expect(result.apiMessages[0].role).toBe('user');
    expect(result.apiMessages[0].name).toBeTruthy();
  });

  it('respects maxTurns window', () => {
    const messages = Array.from({ length: 15 }, (_, i) =>
      makeMsg({ content: `msg ${i}`, senderId: 'c1', senderName: '西尔维娅' }),
    );

    const result = buildApiMessages(messages, 5, 'c1', 20);
    expect(result.apiMessages.length).toBe(5);
  });

  it('handles empty messages', () => {
    const result = buildApiMessages([], 20, 'c1', 20);
    expect(result.apiMessages).toHaveLength(0);
    expect(result.needsCompression).toBe(false);
  });

  it('stale count = messages.length - contextWindow when compressing', () => {
    const contextWindow = 10;
    const totalMessages = contextWindow + BATCH_SIZE + 5; // 25
    const messages = Array.from({ length: totalMessages }, (_, i) =>
      makeMsg({ content: `msg ${i}`, senderId: 'c1', senderName: '西尔维娅' }),
    );

    const result = buildApiMessages(messages, 20, 'c1', contextWindow);
    expect(result.needsCompression).toBe(true);
    // stale = totalMessages - contextWindow = 25 - 10 = 15
    expect(result.staleMessages.length).toBe(totalMessages - contextWindow);
    // active = contextWindow = 10
    expect(result.apiMessages.length).toBe(contextWindow);
  });
});

describe('BATCH_SIZE constant', () => {
  it('BATCH_SIZE is 10', () => {
    expect(BATCH_SIZE).toBe(10);
  });
});
