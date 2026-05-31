// Web stub — no-op DAOs for browser.
// On native, the real characterDao.ts is used.

import { Character } from '../../types';

export async function getAllCharacters(): Promise<Character[]> {
  return [];
}

export async function getCharacterById(_id: string): Promise<Character | null> {
  return null;
}

export async function createCharacter(_char: Character & { id: string }): Promise<void> {
  console.warn('[DAO] createCharacter unavailable on web');
}

export async function updateCharacter(_id: string, _updates: Partial<Character>): Promise<void> {
  console.warn('[DAO] updateCharacter unavailable on web');
}

export async function deleteCharacter(_id: string): Promise<void> {
  console.warn('[DAO] deleteCharacter unavailable on web');
}
