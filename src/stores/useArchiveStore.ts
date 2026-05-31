import { create } from 'zustand';
import { Character, World } from '../types';
import * as characterDao from '../services/db/characterDao';
import * as worldDao from '../services/db/worldDao';

// Fallback for crypto.randomUUID on older Android
function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

interface ArchiveState {
  characters: Character[];
  worlds: World[];
  loading: boolean;

  load: () => Promise<void>;
  addCharacter: (char: Omit<Character, 'id'>) => Promise<void>;
  updateCharacter: (id: string, updates: Partial<Character>) => Promise<void>;
  deleteCharacter: (id: string) => Promise<void>;
  addWorld: (world: Omit<World, 'id'>) => Promise<void>;
  updateWorld: (id: string, updates: Partial<World>) => Promise<void>;
  deleteWorld: (id: string) => Promise<void>;
}

export const useArchiveStore = create<ArchiveState>((set, get) => ({
  characters: [],
  worlds: [],
  loading: false,

  load: async () => {
    set({ loading: true });
    try {
      const [characters, worlds] = await Promise.all([
        characterDao.getAllCharacters(),
        worldDao.getAllWorlds(),
      ]);
      console.log(`[Genesis::DB] Loaded ${characters.length} characters, ${worlds.length} worlds`);
      set({ characters, worlds, loading: false });
    } catch (e) {
      console.error('[Genesis::DB] Failed to load archive:', e);
      set({ loading: false });
    }
  },

  addCharacter: async (char) => {
    const id = generateId();
    console.log(`[Genesis::DB] Creating character: ${char.name} (id: ${id})`);
    try {
      await characterDao.createCharacter({ ...char, id });
      await get().load();
      console.log(`[Genesis::DB] Character created: ${char.name}`);
    } catch (e) {
      console.error('[Genesis::DB] Failed to create character:', e);
      throw e;
    }
  },

  updateCharacter: async (id, updates) => {
    console.log(`[Genesis::DB] Updating character: ${id}`);
    try {
      await characterDao.updateCharacter(id, updates);
      await get().load();
    } catch (e) {
      console.error('[Genesis::DB] Failed to update character:', e);
      throw e;
    }
  },

  deleteCharacter: async (id) => {
    console.log(`[Genesis::DB] Deleting character: ${id}`);
    try {
      await characterDao.deleteCharacter(id);
      set((state) => ({
        characters: state.characters.filter((c) => c.id !== id),
      }));
    } catch (e) {
      console.error('[Genesis::DB] Failed to delete character:', e);
      throw e;
    }
  },

  addWorld: async (world) => {
    const id = generateId();
    console.log(`[Genesis::DB] Creating world: ${world.name} (id: ${id})`);
    try {
      await worldDao.createWorld({ ...world, id });
      await get().load();
      console.log(`[Genesis::DB] World created: ${world.name}`);
    } catch (e) {
      console.error('[Genesis::DB] Failed to create world:', e);
      throw e;
    }
  },

  updateWorld: async (id, updates) => {
    console.log(`[Genesis::DB] Updating world: ${id}`);
    try {
      await worldDao.updateWorld(id, updates);
      await get().load();
    } catch (e) {
      console.error('[Genesis::DB] Failed to update world:', e);
      throw e;
    }
  },

  deleteWorld: async (id) => {
    console.log(`[Genesis::DB] Deleting world: ${id}`);
    try {
      await worldDao.deleteWorld(id);
      set((state) => ({
        worlds: state.worlds.filter((w) => w.id !== id),
      }));
    } catch (e) {
      console.error('[Genesis::DB] Failed to delete world:', e);
      throw e;
    }
  },
}));
