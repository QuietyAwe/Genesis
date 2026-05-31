// Web in-memory implementation of the Archive store.
// Persists to localStorage for cross-session survival.
import { create } from 'zustand';
import { Character, World } from '../types';

const STORAGE_KEY = 'genesis_archive';

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

interface PersistedData {
  characters: Character[];
  worlds: World[];
}

function loadFromStorage(): PersistedData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { characters: [], worlds: [] };
    return JSON.parse(raw) as PersistedData;
  } catch {
    return { characters: [], worlds: [] };
  }
}

function saveToStorage(data: PersistedData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    console.warn('[Archive] localStorage write failed');
  }
}

export const useArchiveStore = create<ArchiveState>((set, _get) => ({
  characters: [],
  worlds: [],
  loading: false,

  load: async () => {
    set({ loading: true });
    const data = loadFromStorage();
    set({ characters: data.characters, worlds: data.worlds, loading: false });
  },

  addCharacter: async (char) => {
    const id = crypto.randomUUID();
    const newChar: Character = { ...char, id };
    set((state) => {
      const chars = [...state.characters, newChar];
      saveToStorage({ characters: chars, worlds: state.worlds });
      return { characters: chars };
    });
  },

  updateCharacter: async (id, updates) => {
    set((state) => {
      const chars = state.characters.map((c) =>
        c.id === id ? { ...c, ...updates } : c,
      );
      saveToStorage({ characters: chars, worlds: state.worlds });
      return { characters: chars };
    });
  },

  deleteCharacter: async (id) => {
    set((state) => {
      const chars = state.characters.filter((c) => c.id !== id);
      saveToStorage({ characters: chars, worlds: state.worlds });
      return { characters: chars };
    });
  },

  addWorld: async (world) => {
    const id = crypto.randomUUID();
    const newWorld: World = { ...world, id };
    set((state) => {
      const worlds = [...state.worlds, newWorld];
      saveToStorage({ characters: state.characters, worlds });
      return { worlds };
    });
  },

  updateWorld: async (id, updates) => {
    set((state) => {
      const worlds = state.worlds.map((w) =>
        w.id === id ? { ...w, ...updates } : w,
      );
      saveToStorage({ characters: state.characters, worlds });
      return { worlds };
    });
  },

  deleteWorld: async (id) => {
    set((state) => {
      const worlds = state.worlds.filter((w) => w.id !== id);
      saveToStorage({ characters: state.characters, worlds });
      return { worlds };
    });
  },
}));
