// Web stub: uses localStorage for non-sensitive settings.
// On native, the real localSettings.ts (expo-file-system) is used.

const STORAGE_KEY = 'genesis_local_settings';

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

function readAll(): LocalSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults();
    return { ...defaults(), ...JSON.parse(raw) };
  } catch {
    return defaults();
  }
}

function writeAll(settings: Partial<LocalSettings>): void {
  try {
    const current = readAll();
    const merged = { ...current, ...settings };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch (e) {
    console.error('[LocalSettings::Web] Write failed:', e);
  }
}

export async function getSetting<K extends keyof LocalSettings>(key: K): Promise<LocalSettings[K]> {
  const all = readAll();
  return all[key];
}

export async function setSetting<K extends keyof LocalSettings>(key: K, value: LocalSettings[K]): Promise<void> {
  writeAll({ [key]: value });
}
