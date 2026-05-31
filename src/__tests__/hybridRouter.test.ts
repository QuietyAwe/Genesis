import { decideNextSpeaker, decideNextSpeakerWindow } from '../services/scheduler/hybridRouter';
import { Character } from '../types';

const chars: Character[] = [
  { id: 'c1', name: '西尔维娅', avatar: '🦊', coreSetting: '冷静', activityLevel: 8, ambientColor: '#EDEAE5' },
  { id: 'c2', name: '迦尔纳', avatar: '🔥', coreSetting: '豪迈', activityLevel: 7, ambientColor: '#F0EBE3' },
  { id: 'c3', name: '露娜', avatar: '🌙', coreSetting: '神秘', activityLevel: 6, ambientColor: '#E8E4F0' },
];

const asciiChars: Character[] = [
  { id: 'a1', name: 'Alice', avatar: '👩', coreSetting: 'curious', activityLevel: 8, ambientColor: '#FFF' },
  { id: 'a2', name: 'Bob', avatar: '👨', coreSetting: 'brave', activityLevel: 7, ambientColor: '#EEE' },
  { id: 'a3', name: 'Charlie', avatar: '🧑', coreSetting: 'calm', activityLevel: 6, ambientColor: '#DDD' },
];

describe('decideNextSpeaker', () => {
  it('returns none when no characters', () => {
    const result = decideNextSpeaker([]);
    expect(result.reason).toBe('none');
    expect(result.nextSpeakerId).toBeNull();
  });

  it('detects CJK name mention', () => {
    const result = decideNextSpeaker(chars, '你好西尔维娅，今天怎么样？', 'c2');
    expect(result.reason).toBe('mention');
    expect(result.nextSpeakerId).toBe('c1');
  });

  it('detects ASCII @mention', () => {
    const result = decideNextSpeaker(asciiChars, '@Alice what do you think?', 'a2');
    expect(result.reason).toBe('mention');
    expect(result.nextSpeakerId).toBe('a1');
  });

  it('detects ASCII word boundary mention', () => {
    const result = decideNextSpeaker(asciiChars, 'Alice, come here!', 'a2');
    expect(result.reason).toBe('mention');
    expect(result.nextSpeakerId).toBe('a1');
  });

  it('does not self-mention (skips if mentioned char is the sender)', () => {
    const result = decideNextSpeaker(chars, '西尔维娅你好', 'c1');
    // Should NOT be mention since c1 mentioned themselves
    expect(result.reason).not.toBe('mention');
  });

  it('detects question mark and picks non-asker', () => {
    const result = decideNextSpeaker(chars, '这是什么？', 'c1');
    expect(result.reason).toBe('question');
    expect(result.nextSpeakerId).not.toBe('c1');
  });

  it('detects ASCII question mark', () => {
    const result = decideNextSpeaker(asciiChars, 'What is this?', 'a1');
    expect(result.reason).toBe('question');
    expect(result.nextSpeakerId).not.toBe('a1');
  });

  it('falls back to activity-weighted random when no mention/question', () => {
    const result = decideNextSpeaker(chars, '今天天气不错', 'c1');
    expect(result.reason).toBe('activity');
    expect(result.nextSpeakerId).not.toBe('c1'); // should exclude last speaker
    expect(['c2', 'c3']).toContain(result.nextSpeakerId);
  });

  it('respects runtimeActivity overrides', () => {
    const runtime = new Map([['c2', 1], ['c3', 10]]);
    // c2 has activity 1 (below threshold), c3 has 10
    const result = decideNextSpeaker(chars, '你好', 'c1', runtime);
    expect(result.reason).toBe('activity');
    expect(result.nextSpeakerId).toBe('c3');
  });

  it('handles single character on stage', () => {
    const single = [chars[0]];
    const result = decideNextSpeaker(single, '你好', 'c1');
    expect(result.nextSpeakerId).toBe('c1');
    expect(result.reason).toBe('activity');
  });

  it('excludes inactive characters (activity <= 1)', () => {
    const runtime = new Map([['c2', 1], ['c3', 1]]);
    const result = decideNextSpeaker(chars, '你好', 'c1', runtime);
    // Both c2 and c3 are inactive, fallback to c1
    expect(result.nextSpeakerId).toBe('c1');
    expect(result.reason).toBe('activity');
  });
});

describe('decideNextSpeakerWindow', () => {
  it('returns none when no characters', () => {
    const result = decideNextSpeakerWindow([], []);
    expect(result.reason).toBe('none');
    expect(result.nextSpeakerId).toBeNull();
  });

  it('returns opener when no messages', () => {
    const result = decideNextSpeakerWindow(chars, []);
    expect(result.reason).toBe('opener');
    expect(result.nextSpeakerId).toBeTruthy();
  });

  it('detects mention in last message', () => {
    const messages = [
      { content: '今天天气不错', senderId: 'c1' },
      { content: '露娜你觉得呢？', senderId: 'c2' },
    ];
    const result = decideNextSpeakerWindow(chars, messages);
    expect(result.reason).toBe('mention');
    expect(result.nextSpeakerId).toBe('c3');
  });

  it('detects question in last message', () => {
    const messages = [
      { content: '你好', senderId: 'c1' },
      { content: '这是怎么回事？', senderId: 'c2' },
    ];
    const result = decideNextSpeakerWindow(chars, messages);
    expect(result.reason).toBe('question');
    expect(result.nextSpeakerId).not.toBe('c2');
  });

  it('falls back to activity when no mention/question', () => {
    const messages = [
      { content: '你好', senderId: 'c1' },
      { content: '今天不错', senderId: 'c2' },
    ];
    const result = decideNextSpeakerWindow(chars, messages);
    expect(result.reason).toBe('activity');
    expect(result.nextSpeakerId).not.toBe('c2');
  });

  it('prioritizes mention over question', () => {
    const messages = [
      { content: '西尔维娅你好？', senderId: 'c2' },
    ];
    const result = decideNextSpeakerWindow(chars, messages);
    expect(result.reason).toBe('mention');
    expect(result.nextSpeakerId).toBe('c1');
  });

  it('handles messages without senderId', () => {
    const messages = [
      { content: '这是旁白' },
      { content: '你好？' },
    ];
    const result = decideNextSpeakerWindow(chars, messages);
    // Should pick someone to answer the question
    expect(['question', 'activity', 'opener']).toContain(result.reason);
    expect(result.nextSpeakerId).toBeTruthy();
  });
});
