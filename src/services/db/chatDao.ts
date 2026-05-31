import { ChatMessage } from '../../types';
import { getDB } from './index';

interface MessageRow {
  id: string;
  stage_id: string;
  sender_type: string;
  sender_name: string;
  sender_avatar: string | null;
  sender_id: string | null;
  content: string;
  branch_id: string;
  is_selected: number;
  created_at: number;
}

function rowToMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    stageId: row.stage_id,
    senderType: row.sender_type as ChatMessage['senderType'],
    senderName: row.sender_name,
    senderAvatar: row.sender_avatar || '',
    senderId: row.sender_id,
    content: row.content,
    branchId: row.branch_id,
    isSelected: row.is_selected === 1,
    timestamp: row.created_at,
  };
}

export async function getMessagesByStage(stageId: string): Promise<ChatMessage[]> {
  const db = await getDB();
  const rows = (await db.getAllAsync(
    'SELECT * FROM messages WHERE stage_id = ? AND is_selected = 1 ORDER BY created_at ASC',
    stageId,
  )) as MessageRow[];
  return rows.map(rowToMessage);
}

export async function getMessagesByBranch(branchId: string): Promise<ChatMessage[]> {
  const db = await getDB();
  const rows = (await db.getAllAsync(
    'SELECT * FROM messages WHERE branch_id = ? ORDER BY created_at ASC',
    branchId,
  )) as MessageRow[];
  return rows.map(rowToMessage);
}

export async function createMessage(msg: ChatMessage): Promise<void> {
  console.log(`[Genesis::DB] createMessage: ${msg.senderName} (${msg.id})`);
  const db = await getDB();
  // On Android, expo-sqlite rejects JS null — use empty strings for nullable TEXT
  await db.runAsync(
    'INSERT INTO messages (id, stage_id, sender_type, sender_name, sender_avatar, sender_id, content, branch_id, is_selected, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    msg.id,
    msg.stageId,
    msg.senderType,
    msg.senderName,
    msg.senderAvatar || '',
    msg.senderId || '',
    msg.content,
    msg.branchId,
    msg.isSelected ? 1 : 0,
    msg.timestamp,
  );
}

export async function deleteAllMessages(stageId: string): Promise<void> {
  const db = await getDB();
  await db.runAsync('DELETE FROM messages WHERE stage_id = ?', stageId);
}

export async function updateMessageContent(id: string, content: string): Promise<void> {
  console.log(`[Genesis::DB] updateMessageContent: ${id}`);
  const db = await getDB();
  await db.runAsync('UPDATE messages SET content = ? WHERE id = ?', content, id);
}

export async function deleteMessage(id: string): Promise<void> {
  console.log(`[Genesis::DB] deleteMessage: ${id}`);
  const db = await getDB();
  await db.runAsync('DELETE FROM messages WHERE id = ?', id);
}

export async function deleteMessagesByBranch(branchId: string): Promise<void> {
  console.log(`[Genesis::DB] deleteMessagesByBranch: ${branchId}`);
  const db = await getDB();
  await db.runAsync('DELETE FROM messages WHERE branch_id = ?', branchId);
}

export async function updateMessageBranchId(id: string, newBranchId: string): Promise<void> {
  const db = await getDB();
  await db.runAsync('UPDATE messages SET branch_id = ? WHERE id = ?', newBranchId, id);
}
