// Web in-memory implementation of the Settings store.
// Persists sensitive settings (apiKey, baseUrl, model) to localStorage.
// Non-sensitive settings go through localSettings (also localStorage-backed).
import { create } from 'zustand';
import * as localSettings from '../services/localSettings';
import { fetchModels } from '../services/api/client';

import type { ColorScheme } from '../hooks/useTheme';

interface SettingsState {
  apiKey: string | null;
  baseUrl: string | null;
  model: string | null;
  temperature: number;
  maxTokens: number;
  contextWindow: number;
  customPromptTemplate: string | null;
  colorScheme: ColorScheme | 'system';
  availableModels: string[];
  loading: boolean;
  fetchingModels: boolean;
  load: () => Promise<void>;
  setApiKey: (key: string) => Promise<void>;
  setBaseUrl: (url: string) => Promise<void>;
  setModel: (model: string) => Promise<void>;
  setTemperature: (t: number) => Promise<void>;
  setMaxTokens: (m: number) => Promise<void>;
  setContextWindow: (w: number) => Promise<void>;
  setCustomPromptTemplate: (t: string | null) => Promise<void>;
  setColorScheme: (s: ColorScheme | 'system') => Promise<void>;
  fetchModels: () => Promise<void>;
}

const SENSITIVE_KEY = 'genesis_settings';

interface SensitiveSettings {
  apiKey: string | null;
  baseUrl: string | null;
  model: string | null;
}

function loadSensitive(): SensitiveSettings {
  try {
    const raw = localStorage.getItem(SENSITIVE_KEY);
    if (!raw) return { apiKey: null, baseUrl: null, model: null };
    const parsed = JSON.parse(raw);
    return {
      apiKey: parsed.apiKey ?? null,
      baseUrl: parsed.baseUrl ?? null,
      model: parsed.model ?? null,
    };
  } catch {
    return { apiKey: null, baseUrl: null, model: null };
  }
}

function saveSensitive(state: SensitiveSettings): void {
  try {
    localStorage.setItem(SENSITIVE_KEY, JSON.stringify(state));
  } catch {
    console.warn('[Settings::Web] saveSensitive failed');
  }
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  apiKey: null,
  baseUrl: null,
  model: null,
  temperature: 0.8,
  maxTokens: 1000,
  contextWindow: 20,
  customPromptTemplate: null,
  colorScheme: 'system',
  availableModels: [],
  loading: false,
  fetchingModels: false,

  load: async () => {
    const sensitive = loadSensitive();
    const [temperature, maxTokens, contextWindow, customPromptTemplate, colorScheme] = await Promise.all([
      localSettings.getSetting('temperature'),
      localSettings.getSetting('maxTokens'),
      localSettings.getSetting('contextWindow'),
      localSettings.getSetting('customPromptTemplate'),
      localSettings.getSetting('colorScheme'),
    ]);
    set({
      ...sensitive,
      temperature: temperature ?? 0.8,
      maxTokens: maxTokens ?? 1000,
      contextWindow: contextWindow ?? 20,
      customPromptTemplate: customPromptTemplate ?? null,
      colorScheme: colorScheme ?? 'system',
      loading: false,
    });
  },

  setApiKey: async (key) => {
    set((state) => {
      saveSensitive({ ...state, apiKey: key });
      return { apiKey: key };
    });
  },

  setBaseUrl: async (url) => {
    set((state) => {
      saveSensitive({ ...state, baseUrl: url });
      return { baseUrl: url };
    });
  },

  setModel: async (model) => {
    set((state) => {
      saveSensitive({ ...state, model });
      return { model };
    });
  },

  setTemperature: async (t) => {
    await localSettings.setSetting('temperature', t);
    set({ temperature: t });
  },

  setMaxTokens: async (m) => {
    await localSettings.setSetting('maxTokens', m);
    set({ maxTokens: m });
  },

  setContextWindow: async (w) => {
    await localSettings.setSetting('contextWindow', w);
    set({ contextWindow: w });
  },

  setCustomPromptTemplate: async (t) => {
    await localSettings.setSetting('customPromptTemplate', t);
    set({ customPromptTemplate: t });
  },

  setColorScheme: async (s) => {
    await localSettings.setSetting('colorScheme', s);
    set({ colorScheme: s });
  },

  fetchModels: async () => {
    const { apiKey, baseUrl } = get();
    if (!apiKey || !baseUrl) return;
    set({ fetchingModels: true });
    try {
      const models = await fetchModels(apiKey, baseUrl);
      set({ availableModels: models, fetchingModels: false });
    } catch {
      set({ fetchingModels: false });
    }
  },
}));
