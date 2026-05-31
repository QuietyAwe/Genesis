/**
 * Tests for branch fork-point detection and switchBranch logic.
 * These test the pure helper functions and the branching data model.
 */
import { ChatMessage } from '../types';

// Re-implement the pure helpers here for testing (same logic as in useStageStore.ts)
function filterByBranch(messages: ChatMessage[], branchId: string | null): ChatMessage[] {
  if (!branchId) return messages;
  return messages.filter((m) => m.branchId === branchId);
}

// OLD implementation (buggy) — compares by message ID
function findForkPointId_OLD(allMessages: ChatMessage[], currentBranchId: string, targetBranchId: string): string | null {
  const currentMsgs = filterByBranch(allMessages, currentBranchId);
  const targetMsgs = filterByBranch(allMessages, targetBranchId);

  const minLen = Math.min(currentMsgs.length, targetMsgs.length);
  for (let i = 0; i < minLen; i++) {
    if (currentMsgs[i].id !== targetMsgs[i].id) {
      return targetMsgs[i].id;
    }
  }
  if (targetMsgs.length > currentMsgs.length) {
    return targetMsgs[currentMsgs.length].id;
  }
  return null;
}

// NEW implementation (fixed) — compares by content + senderId to find true divergence
function findForkPointId_NEW(allMessages: ChatMessage[], currentBranchId: string, targetBranchId: string): string | null {
  const currentMsgs = filterByBranch(allMessages, currentBranchId);
  const targetMsgs = filterByBranch(allMessages, targetBranchId);

  const minLen = Math.min(currentMsgs.length, targetMsgs.length);
  for (let i = 0; i < minLen; i++) {
    const isSameContent = currentMsgs[i].content === targetMsgs[i].content
      && currentMsgs[i].senderId === targetMsgs[i].senderId;
    if (!isSameContent) {
      // Fork point found — return the target branch's message at this index
      return targetMsgs[i].id;
    }
  }
  // If target branch is longer, the first extra message is the fork point
  if (targetMsgs.length > currentMsgs.length) {
    return targetMsgs[currentMsgs.length].id;
  }
  return null;
}

// Helper to create a message quickly
function msg(id: string, branchId: string, content: string, senderId: string | null = null): ChatMessage {
  return {
    id,
    stageId: 's1',
    senderType: senderId ? 'character' : 'narrator',
    senderName: senderId ? 'Test' : '',
    senderAvatar: '🎭',
    senderId,
    content,
    branchId,
    isSelected: true,
    timestamp: Date.now(),
  };
}

/**
 * Scenario: User creates a stage, 3 messages on b1, then regenerates msg at index 2.
 *
 * Original branch (b1):
 *   msg-A (b1) — narrator
 *   msg-B (b1) — character c1
 *   msg-C (b1) — character c2  ← user regenerates this
 *
 * After regeneration, new branch (b2) is created:
 *   msg-A' (b2) — COPY of A, new ID
 *   msg-B' (b2) — COPY of B, new ID
 *   msg-C' (b2) — NEW generated content
 *
 * allMessages = [A(b1), B(b1), C(b1), A'(b2), B'(b2), C'(b2)]
 */
describe('findForkPointId — regeneration scenario', () => {
  const allMessages: ChatMessage[] = [
    msg('A', 'b1', '雾气弥漫', null),
    msg('B', 'b1', '你好迦尔纳', 'c1'),
    msg('C', 'b1', '你好西尔维娅', 'c2'),
    // Copies with new IDs (simulating regenerateMessage)
    msg('A2', 'b2', '雾气弥漫', null),
    msg('B2', 'b2', '你好迦尔纳', 'c1'),
    msg('C2', 'b2', '哈哈哈，今天天气真不错！', 'c2'), // regenerated content
  ];

  describe('OLD implementation (buggy — compares by ID)', () => {
    it('incorrectly returns the first copied message (index 0)', () => {
      const result = findForkPointId_OLD(allMessages, 'b1', 'b2');
      // BUG: A.id !== A2.id, so it thinks fork is at index 0
      expect(result).toBe('A2');
    });

    it('does NOT return the actual fork point (C2)', () => {
      const result = findForkPointId_OLD(allMessages, 'b1', 'b2');
      // The actual fork should be at C2, but old impl returns A2
      expect(result).not.toBe('C2');
    });
  });

  describe('NEW implementation (fixed — compares by content+senderId)', () => {
    it('correctly identifies the fork point at the regenerated message', () => {
      const result = findForkPointId_NEW(allMessages, 'b1', 'b2');
      // C and C' have different content → fork at C2
      expect(result).toBe('C2');
    });

    it('returns null when branches have identical content', () => {
      const identical: ChatMessage[] = [
        msg('A', 'b1', 'hello', 'c1'),
        msg('B', 'b1', 'world', 'c2'),
        msg('A2', 'b2', 'hello', 'c1'),
        msg('B2', 'b2', 'world', 'c2'),
      ];
      const result = findForkPointId_NEW(identical, 'b1', 'b2');
      expect(result).toBeNull();
    });

    it('handles target branch longer than current', () => {
      const messages: ChatMessage[] = [
        msg('A', 'b1', 'hello', 'c1'),
        msg('A2', 'b2', 'hello', 'c1'),
        msg('B2', 'b2', 'extra message', 'c2'),
      ];
      const result = findForkPointId_NEW(messages, 'b1', 'b2');
      // b1 has 1 msg, b2 has 2 msgs → fork at the extra message
      expect(result).toBe('B2');
    });

    it('handles empty target branch', () => {
      const messages: ChatMessage[] = [
        msg('A', 'b1', 'hello', 'c1'),
      ];
      const result = findForkPointId_NEW(messages, 'b1', 'b2');
      expect(result).toBeNull();
    });

    it('handles empty current branch', () => {
      const messages: ChatMessage[] = [
        msg('A', 'b2', 'hello', 'c1'),
      ];
      const result = findForkPointId_NEW(messages, 'b1', 'b2');
      expect(result).toBe('A');
    });
  });
});

/**
 * Scenario: Multiple regenerations creating 3+ branches.
 *
 * b1: [A, B, C]
 * b2: [A', B', C'] — regenerated C
 * b3: [A'', B'', C''] — regenerated C again from b1
 */
describe('findForkPointId — multi-branch scenario', () => {
  const allMessages: ChatMessage[] = [
    msg('A', 'b1', '开场白', null),
    msg('B', 'b1', '你好', 'c1'),
    msg('C', 'b1', '回复v1', 'c2'),
    msg('A2', 'b2', '开场白', null),
    msg('B2', 'b2', '你好', 'c1'),
    msg('C2', 'b2', '回复v2', 'c2'),
    msg('A3', 'b3', '开场白', null),
    msg('B3', 'b3', '你好', 'c1'),
    msg('C3', 'b3', '回复v3', 'c2'),
  ];

  it('b1→b2: fork at C2 (content differs)', () => {
    const result = findForkPointId_NEW(allMessages, 'b1', 'b2');
    expect(result).toBe('C2');
  });

  it('b1→b3: fork at C3 (content differs)', () => {
    const result = findForkPointId_NEW(allMessages, 'b1', 'b3');
    expect(result).toBe('C3');
  });

  it('b2→b3: fork at C3 (content differs)', () => {
    const result = findForkPointId_NEW(allMessages, 'b2', 'b3');
    expect(result).toBe('C3');
  });

  it('b2→b1: fork at C (content differs)', () => {
    const result = findForkPointId_NEW(allMessages, 'b2', 'b1');
    expect(result).toBe('C');
  });
});

/**
 * Scenario: Narrator opening + character messages.
 * The opening scene is a narrator message copied to both branches during regeneration.
 */
describe('findForkPointId — opening scene scenario', () => {
  const allMessages: ChatMessage[] = [
    // Opening narrator message on b1
    msg('OPEN', 'b1', '雾港的夜幕降临了', null),
    msg('M1', 'b1', '今晚雾真大', 'c1'),
    msg('M2', 'b1', '是啊', 'c2'),
    // Regenerated branch — opening + M1 are copied ancestors, M2 is regenerated
    msg('OPEN2', 'b2', '雾港的夜幕降临了', null),
    msg('M1A', 'b2', '今晚雾真大', 'c1'),
    msg('M2A', 'b2', '我觉得还好吧', 'c2'),
  ];

  it('finds fork at the first differing content', () => {
    const result = findForkPointId_NEW(allMessages, 'b1', 'b2');
    // OPEN and OPEN2 same, M1 and M1A same, M2 and M2A differ → fork at M2A
    expect(result).toBe('M2A');
  });
});

/**
 * Verify the algorithm handles the "reversed direction" correctly.
 * Switching from b2 back to b1 should find the fork in b1.
 */
describe('findForkPointId — reverse direction', () => {
  const allMessages: ChatMessage[] = [
    msg('A', 'b1', '开场', null),
    msg('B', 'b1', '你好', 'c1'),
    msg('C', 'b1', '回复A', 'c2'),
    msg('A2', 'b2', '开场', null),
    msg('B2', 'b2', '你好', 'c1'),
    msg('C2', 'b2', '回复B', 'c2'),
  ];

  it('b2→b1: returns C (the divergent message in b1)', () => {
    const result = findForkPointId_NEW(allMessages, 'b2', 'b1');
    expect(result).toBe('C');
  });

  it('b1→b2: returns C2 (the divergent message in b2)', () => {
    const result = findForkPointId_NEW(allMessages, 'b1', 'b2');
    expect(result).toBe('C2');
  });
});

// Re-implement findForkPointIndex for testing (same logic as in useStageStore.ts)
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

describe('findForkPointIndex — scroll target', () => {
  const allMessages: ChatMessage[] = [
    msg('A', 'b1', '开场白', null),
    msg('B', 'b1', '你好', 'c1'),
    msg('C', 'b1', '回复v1', 'c2'),
    msg('A2', 'b2', '开场白', null),
    msg('B2', 'b2', '你好', 'c1'),
    msg('C2', 'b2', '回复v2', 'c2'),
  ];

  it('b1→b2: returns index 2 (first divergent message in b1)', () => {
    expect(findForkPointIndex(allMessages, 'b1', 'b2')).toBe(2);
  });

  it('b2→b1: returns index 2 (first divergent message in b2)', () => {
    expect(findForkPointIndex(allMessages, 'b2', 'b1')).toBe(2);
  });

  it('returns 0 when first message differs', () => {
    const msgs: ChatMessage[] = [
      msg('A', 'b1', 'hello', 'c1'),
      msg('A2', 'b2', 'world', 'c1'),
    ];
    expect(findForkPointIndex(msgs, 'b1', 'b2')).toBe(0);
  });

  it('returns message count when branches are identical', () => {
    const msgs: ChatMessage[] = [
      msg('A', 'b1', 'hello', 'c1'),
      msg('A2', 'b2', 'hello', 'c1'),
    ];
    expect(findForkPointIndex(msgs, 'b1', 'b2')).toBe(1);
  });

  it('returns 0 when current branch is empty', () => {
    const msgs: ChatMessage[] = [
      msg('A', 'b2', 'hello', 'c1'),
    ];
    expect(findForkPointIndex(msgs, 'b1', 'b2')).toBe(0);
  });
});
