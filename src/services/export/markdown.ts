// Markdown export utility for stages.
// Generates a clean Markdown document with stage metadata and conversation flow.

import { ChatMessage, Character, Stage, World } from '../../types';

interface ExportData {
  stage: Stage;
  messages: ChatMessage[];
  characters: Character[];
  world?: World;
}

export function exportToMarkdown(data: ExportData): string {
  const { stage, messages, characters, world } = data;
  const lines: string[] = [];

  // Title
  lines.push(`# ${stage.name}`);
  lines.push('');

  // Metadata
  const createdDate = new Date(stage.createdAt).toLocaleDateString('zh-CN');
  lines.push(`- **创建时间：** ${createdDate}`);
  if (world) {
    lines.push(`- **世界观：** ${world.name} ${world.emoji}`);
  }
  lines.push(`- **登场角色：** ${characters.map((c) => `${c.avatar} ${c.name}`).join('、')}`);
  lines.push(`- **消息数量：** ${messages.length}`);
  lines.push('');

  // Separator
  lines.push('---');
  lines.push('');

  // Conversation flow
  for (const msg of messages) {
    if (msg.senderType === 'narrator') {
      // Narrator: italic script format
      lines.push(`*${msg.content}*`);
    } else {
      // Character/User/Guest: name + content
      lines.push(`**${msg.senderName}：** ${msg.content}`);
    }
    lines.push('');
  }

  // Footer
  lines.push('---');
  lines.push('');
  lines.push(`*由 Genesis 导出 · ${new Date().toLocaleDateString('zh-CN')}*`);

  return lines.join('\n');
}

/**
 * Copy Markdown to clipboard.
 * Tries Web API first; returns false on native (caller shows Alert fallback).
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof globalThis.navigator !== 'undefined' && (globalThis.navigator as any).clipboard) {
      await (globalThis.navigator as any).clipboard.writeText(text);
      return true;
    }
  } catch {
    // Clipboard unavailable on native
  }
  return false;
}
