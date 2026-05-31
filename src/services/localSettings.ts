// File-based settings storage for non-sensitive config.
// Uses expo-file-system to persist temperature, maxTokens, contextWindow,
// customPromptTemplate, and colorScheme.
// On web, the localSettings.web.ts stub uses localStorage.

import { File, Paths } from 'expo-file-system';

const SETTINGS_FILE = new File(Paths.document, 'localSettings.json');

interface LocalSettings {
  temperature: number | null;
  maxTokens: number | null;
  contextWindow: number | null;
  customPromptTemplate: string | null;
  colorScheme: 'light' | 'dark' | 'system' | null;
}

function defaults(): LocalSettings {
  return {
    temperature: null,
    maxTokens: null,
    contextWindow: null,
    customPromptTemplate: null,
    colorScheme: null,
  };
}

function readAllSync(): LocalSettings {
  try {
    if (!SETTINGS_FILE.exists) return defaults();
    const content = SETTINGS_FILE.textSync();
    return { ...defaults(), ...JSON.parse(content) };
  } catch {
    return defaults();
  }
}

function writeAll(settings: Partial<LocalSettings>): void {
  try {
    const current = readAllSync();
    const merged = { ...current, ...settings };
    SETTINGS_FILE.write(JSON.stringify(merged));
  } catch (e) {
    console.error('[LocalSettings] Write failed:', e);
  }
}

export async function getSetting<K extends keyof LocalSettings>(key: K): Promise<LocalSettings[K]> {
  const all = readAllSync();
  return all[key];
}

export async function setSetting<K extends keyof LocalSettings>(key: K, value: LocalSettings[K]): Promise<void> {
  writeAll({ [key]: value });
}
