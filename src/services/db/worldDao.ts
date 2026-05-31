import { LoreEntry, World } from '../../types';
import { getDB } from './index';

interface WorldRow {
  id: string;
  name: string;
  emoji: string | null;
  lore: string | null;
  ambient_color: string | null;
  lore_entries_json: string | null;
  created_at: number;
}

function rowToWorld(row: WorldRow): World {
  let loreEntries: LoreEntry[] | undefined;
  try {
    loreEntries = row.lore_entries_json ? JSON.parse(row.lore_entries_json) : undefined;
  } catch {
    // ignore corrupt data
  }
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji || '',
    lore: row.lore || '',
    ambientColor: row.ambient_color || '',
    loreEntries,
  };
}

export async function getAllWorlds(): Promise<World[]> {
  console.log('[Genesis::DB] getAllWorlds: querying...');
  const db = await getDB();
  const rows = (await db.getAllAsync('SELECT * FROM worlds ORDER BY created_at DESC')) as WorldRow[];
  console.log(`[Genesis::DB] getAllWorlds: got ${rows.length} rows`);
  return rows.map(rowToWorld);
}

export async function getWorldById(id: string): Promise<World | null> {
  const db = await getDB();
  const row = (await db.getFirstAsync('SELECT * FROM worlds WHERE id = ?', id)) as WorldRow | undefined;
  return row ? rowToWorld(row) : null;
}

export async function createWorld(world: World & { id: string }): Promise<void> {
  console.log(`[Genesis::DB] createWorld: ${world.name}`);
  const db = await getDB();
  const now = Date.now();
  await db.runAsync(
    'INSERT INTO worlds (id, name, emoji, lore, ambient_color, lore_entries_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    world.id,
    world.name,
    world.emoji || '',
    world.lore || '',
    world.ambientColor || '',
    world.loreEntries ? JSON.stringify(world.loreEntries) : null,
    now,
  );
}

export async function updateWorld(id: string, updates: Partial<World>): Promise<void> {
  const db = await getDB();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
  if (updates.emoji !== undefined) { fields.push('emoji = ?'); values.push(updates.emoji || ''); }
  if (updates.lore !== undefined) { fields.push('lore = ?'); values.push(updates.lore || ''); }
  if (updates.ambientColor !== undefined) { fields.push('ambient_color = ?'); values.push(updates.ambientColor || ''); }
  if (updates.loreEntries !== undefined) { fields.push('lore_entries_json = ?'); values.push(updates.loreEntries ? JSON.stringify(updates.loreEntries) : null); }

  if (fields.length === 0) return;

  values.push(id);
  await db.runAsync(
    `UPDATE worlds SET ${fields.join(', ')} WHERE id = ?`,
    ...(values as string[]),
  );
}

export async function deleteWorld(id: string): Promise<void> {
  const db = await getDB();
  await db.runAsync('DELETE FROM worlds WHERE id = ?', id);
}
