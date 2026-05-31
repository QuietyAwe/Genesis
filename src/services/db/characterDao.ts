import { Character } from '../../types';
import { getDB } from './index';

interface CharacterRow {
  id: string;
  name: string;
  avatar: string | null;
  core_setting: string | null;
  activity_level: number | null;
  world_id: string | null;
  ambient_color: string | null;
  created_at: number;
  updated_at: number;
}

function rowToCharacter(row: CharacterRow): Character {
  return {
    id: row.id,
    name: row.name,
    avatar: row.avatar || '',
    coreSetting: row.core_setting || '',
    activityLevel: row.activity_level ?? 5,
    ambientColor: row.ambient_color || '',
  };
}

export async function getAllCharacters(): Promise<Character[]> {
  console.log('[Genesis::DB] getAllCharacters: querying...');
  const db = await getDB();
  const rows = (await db.getAllAsync('SELECT * FROM characters ORDER BY created_at DESC')) as CharacterRow[];
  console.log(`[Genesis::DB] getAllCharacters: got ${rows.length} rows`);
  return rows.map(rowToCharacter);
}

export async function getCharacterById(id: string): Promise<Character | null> {
  const db = await getDB();
  const row = (await db.getFirstAsync('SELECT * FROM characters WHERE id = ?', id)) as CharacterRow | undefined;
  console.log(`[Genesis::DB] getCharacterById(${id}): ${row ? 'found' : 'not found'}`);
  return row ? rowToCharacter(row) : null;
}

export async function createCharacter(char: Character & { id: string }): Promise<void> {
  console.log(`[Genesis::DB] createCharacter: ${char.name} (id: ${char.id})`);
  const db = await getDB();
  const now = Date.now();
  // On Android, expo-sqlite runAsync rejects JS null — use empty string for nullable TEXT columns
  await db.runAsync(
    `INSERT INTO characters (id, name, avatar, core_setting, activity_level, world_id, ambient_color, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    char.id,
    char.name,
    char.avatar || '',
    char.coreSetting || '',
    char.activityLevel ?? 5,
    '',
    char.ambientColor || '',
    now,
    now,
  );
  console.log(`[Genesis::DB] createCharacter: inserted ${char.name}`);
}

export async function updateCharacter(id: string, updates: Partial<Character>): Promise<void> {
  console.log(`[Genesis::DB] updateCharacter: ${id}`);
  const db = await getDB();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
  if (updates.avatar !== undefined) { fields.push('avatar = ?'); values.push(updates.avatar || ''); }
  if (updates.coreSetting !== undefined) { fields.push('core_setting = ?'); values.push(updates.coreSetting || ''); }
  if (updates.activityLevel !== undefined) { fields.push('activity_level = ?'); values.push(updates.activityLevel ?? 5); }
  if (updates.ambientColor !== undefined) { fields.push('ambient_color = ?'); values.push(updates.ambientColor || ''); }

  if (fields.length === 0) return;

  values.push(id);
  await db.runAsync(
    `UPDATE characters SET ${fields.join(', ')} WHERE id = ?`,
    ...(values as string[]),
  );
}

export async function deleteCharacter(id: string): Promise<void> {
  console.log(`[Genesis::DB] deleteCharacter: ${id}`);
  const db = await getDB();
  await db.runAsync('DELETE FROM characters WHERE id = ?', id);
}
