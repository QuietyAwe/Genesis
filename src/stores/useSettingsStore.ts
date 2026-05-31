import { create } from 'zustand';
import * as secureStore from '../services/secureStore';
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
    set({ loading: true });
    try {
      const [apiKey, baseUrl, model, temperature, maxTokens, contextWindow, customPromptTemplate, colorScheme] = await Promise.all([
        secureStore.getApiKey(),
        secureStore.getBaseUrl(),
        secureStore.getModel(),
        localSettings.getSetting('temperature'),
        localSettings.getSetting('maxTokens'),
        localSettings.getSetting('contextWindow'),
        localSettings.getSetting('customPromptTemplate'),
        localSettings.getSetting('colorScheme'),
      ]);
      set({
        apiKey,
        baseUrl,
        model,
        temperature: temperature ?? 0.8,
        maxTokens: maxTokens ?? 1000,
        contextWindow: contextWindow ?? 20,
        customPromptTemplate: customPromptTemplate ?? null,
        colorScheme: colorScheme ?? 'system',
        loading: false,
      });
    } catch (e) {
      console.error('Failed to load settings:', e);
      set({ loading: false });
    }
  },

  setApiKey: async (key: string) => {
    await secureStore.setApiKey(key);
    set({ apiKey: key });
  },

  setBaseUrl: async (url: string) => {
    await secureStore.setBaseUrl(url);
    set({ baseUrl: url });
  },

  setModel: async (model: string) => {
    await secureStore.setModel(model);
    set({ model });
  },

  setTemperature: async (t: number) => {
    await localSettings.setSetting('temperature', t);
    set({ temperature: t });
  },

  setMaxTokens: async (m: number) => {
    await localSettings.setSetting('maxTokens', m);
    set({ maxTokens: m });
  },

  setContextWindow: async (w: number) => {
    await localSettings.setSetting('contextWindow', w);
    set({ contextWindow: w });
  },

  setCustomPromptTemplate: async (t: string | null) => {
    await localSettings.setSetting('customPromptTemplate', t);
    set({ customPromptTemplate: t });
  },

  setColorScheme: async (s: 'light' | 'dark' | 'system') => {
    await localSettings.setSetting('colorScheme', s);
    set({ colorScheme: s });
  },

  fetchModels: async () => {
    const { apiKey, baseUrl } = get();
    if (!apiKey || !baseUrl) {
      console.warn('[Genesis::Settings] fetchModels: missing apiKey or baseUrl');
      return;
    }

    set({ fetchingModels: true });
    try {
      const models = await fetchModels(apiKey, baseUrl);
      set({ availableModels: models });
    } catch (e) {
      console.error(`[Genesis::Settings] fetchModels failed:`, e);
      set({ availableModels: [] });
      throw e; // Re-throw so UI can show the error
    } finally {
      set({ fetchingModels: false });
    }
  },
}));
