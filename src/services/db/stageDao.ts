import { Stage } from '../../types';
import { getDB } from './index';

interface StageRow {
  id: string;
  name: string;
  world_ids: string | null;
  character_ids: string;
  character_snapshots: string | null;
  system_prompt: string | null;
  opening_scene: string | null;
  character_statuses_json: string | null;
  stage_summary: string | null;
  created_at: number;
  updated_at: number;
}

function rowToStage(row: StageRow): Stage {
  let worldIds: string[] = [];
  try {
    worldIds = row.world_ids ? JSON.parse(row.world_ids) : [];
  } catch {
    // Migration: old rows have world_id as string, new rows have world_ids as JSON array
    worldIds = [];
  }
  let snapshots: Record<string, { name: string; avatar: string; coreSetting: string; activityLevel: number; ambientColor: string }> | null = null;
  try {
    snapshots = row.character_snapshots ? JSON.parse(row.character_snapshots) : null;
  } catch {
    // ignore corrupt snapshots
  }
  let characterStatuses: Record<string, string> | undefined;
  try {
    characterStatuses = row.character_statuses_json ? JSON.parse(row.character_statuses_json) : undefined;
  } catch {
    // ignore corrupt data
  }
  return {
    id: row.id,
    name: row.name,
    worldIds,
    characterIds: JSON.parse(row.character_ids || '[]'),
    systemPrompt: row.system_prompt || null,
    characterSnapshots: snapshots,
    openingScene: row.opening_scene || undefined,
    characterStatuses,
    stageSummary: row.stage_summary || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getAllStages(): Promise<Stage[]> {
  const db = await getDB();
  const rows = (await db.getAllAsync('SELECT * FROM stages ORDER BY updated_at DESC')) as StageRow[];
  return rows.map(rowToStage);
}

export async function createStage(stage: Stage): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    'INSERT INTO stages (id, name, world_ids, character_ids, character_snapshots, system_prompt, opening_scene, character_statuses_json, stage_summary, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    stage.id,
    stage.name,
    JSON.stringify(stage.worldIds || []),
    JSON.stringify(stage.characterIds),
    stage.characterSnapshots ? JSON.stringify(stage.characterSnapshots) : null,
    stage.systemPrompt || '',
    stage.openingScene || '',
    stage.characterStatuses ? JSON.stringify(stage.characterStatuses) : null,
    stage.stageSummary || '',
    stage.createdAt,
    stage.updatedAt,
  );
}

export async function updateStage(id: string, updates: Partial<Stage>): Promise<void> {
  const db = await getDB();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
  if (updates.worldIds !== undefined) { fields.push('world_ids = ?'); values.push(JSON.stringify(updates.worldIds)); }
  if (updates.characterIds !== undefined) { fields.push('character_ids = ?'); values.push(JSON.stringify(updates.characterIds)); }
  if (updates.systemPrompt !== undefined) { fields.push('system_prompt = ?'); values.push(updates.systemPrompt); }
  if (updates.openingScene !== undefined) { fields.push('opening_scene = ?'); values.push(updates.openingScene); }
  if (updates.characterStatuses !== undefined) { fields.push('character_statuses_json = ?'); values.push(updates.characterStatuses ? JSON.stringify(updates.characterStatuses) : null); }
  if (updates.stageSummary !== undefined) { fields.push('stage_summary = ?'); values.push(updates.stageSummary); }
  if (updates.updatedAt !== undefined) { fields.push('updated_at = ?'); values.push(updates.updatedAt); }

  if (fields.length === 0) return;

  values.push(id);
  await db.runAsync(`UPDATE stages SET ${fields.join(', ')} WHERE id = ?`, ...values as string[]);
}

export async function deleteStage(id: string): Promise<void> {
  const db = await getDB();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM stages WHERE id = ?', id);
    await db.runAsync('DELETE FROM messages WHERE stage_id = ?', id);
  });
}
