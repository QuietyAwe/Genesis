import { exportToMarkdown } from '../services/export/markdown';
import { ChatMessage, Character, Stage, World } from '../types';

const stage: Stage = {
  id: 's1',
  name: '雾港之夜',
  worldIds: ['w1'],
  characterIds: ['c1', 'c2'],
  systemPrompt: null,
  characterSnapshots: null,
  createdAt: new Date('2026-05-29').getTime(),
  updatedAt: new Date('2026-05-29').getTime(),
};

const characters: Character[] = [
  { id: 'c1', name: '西尔维娅', avatar: '🦊', coreSetting: '冷静', activityLevel: 8, ambientColor: '#EDEAE5' },
  { id: 'c2', name: '迦尔纳', avatar: '🔥', coreSetting: '豪迈', activityLevel: 7, ambientColor: '#F0EBE3' },
];

const world: World = {
  id: 'w1',
  name: '雾港',
  emoji: '🌫️',
  lore: '被永雾笼罩的港口城市',
  ambientColor: '#EDEAE5',
};

const messages: ChatMessage[] = [
  {
    id: 'm1', stageId: 's1', senderType: 'narrator', senderName: '', senderAvatar: '',
    senderId: null, content: '雾气弥漫在码头上', branchId: 'b1', isSelected: true, timestamp: 1000,
  },
  {
    id: 'm2', stageId: 's1', senderType: 'character', senderName: '西尔维娅', senderAvatar: '🦊',
    senderId: 'c1', content: '今晚的雾比平时更浓', branchId: 'b1', isSelected: true, timestamp: 2000,
  },
  {
    id: 'm3', stageId: 's1', senderType: 'character', senderName: '迦尔纳', senderAvatar: '🔥',
    senderId: 'c2', content: '哈哈，正好适合喝酒！', branchId: 'b1', isSelected: true, timestamp: 3000,
  },
  {
    id: 'm4', stageId: 's1', senderType: 'user', senderName: '玩家', senderAvatar: '',
    senderId: null, content: '你们在聊什么？', branchId: 'b1', isSelected: true, timestamp: 4000,
  },
];

describe('exportToMarkdown', () => {
  it('generates title from stage name', () => {
    const md = exportToMarkdown({ stage, messages: [], characters });
    expect(md).toContain('# 雾港之夜');
  });

  it('includes world info when provided', () => {
    const md = exportToMarkdown({ stage, messages: [], characters, world });
    expect(md).toContain('雾港');
    expect(md).toContain('🌫️');
  });

  it('omits world line when not provided', () => {
    const md = exportToMarkdown({ stage, messages: [], characters });
    expect(md).not.toContain('世界观：');
  });

  it('lists all characters', () => {
    const md = exportToMarkdown({ stage, messages: [], characters });
    expect(md).toContain('🦊 西尔维娅');
    expect(md).toContain('🔥 迦尔纳');
  });

  it('includes message count', () => {
    const md = exportToMarkdown({ stage, messages, characters });
    expect(md).toContain('4'); // 4 messages
  });

  it('formats narrator messages as italic', () => {
    const md = exportToMarkdown({ stage, messages, characters });
    expect(md).toContain('*雾气弥漫在码头上*');
  });

  it('formats character messages with name prefix', () => {
    const md = exportToMarkdown({ stage, messages, characters });
    expect(md).toContain('**西尔维娅：** 今晚的雾比平时更浓');
    expect(md).toContain('**迦尔纳：** 哈哈，正好适合喝酒！');
  });

  it('formats user messages with name prefix', () => {
    const md = exportToMarkdown({ stage, messages, characters });
    expect(md).toContain('**玩家：** 你们在聊什么？');
  });

  it('includes separator lines', () => {
    const md = exportToMarkdown({ stage, messages, characters });
    expect(md).toContain('---');
  });

  it('includes footer', () => {
    const md = exportToMarkdown({ stage, messages, characters });
    expect(md).toContain('由 Genesis 导出');
  });

  it('handles empty messages', () => {
    const md = exportToMarkdown({ stage, messages: [], characters });
    expect(md).toContain('# 雾港之夜');
    expect(md).toContain('---');
    // Should not crash
  });
});
