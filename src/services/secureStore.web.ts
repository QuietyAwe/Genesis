// Web implementation: persist API credentials in localStorage.
// On native, the real secureStore.ts (expo-secure-store) is used.

const KEYS = {
  API_KEY: 'genesis_api_key',
  BASE_URL: 'genesis_base_url',
  MODEL: 'genesis_model',
} as const;

export async function getApiKey(): Promise<string | null> {
  try {
    return localStorage.getItem(KEYS.API_KEY) || null;
  } catch {
    return null;
  }
}

export async function setApiKey(value: string): Promise<void> {
  try {
    localStorage.setItem(KEYS.API_KEY, value);
  } catch (e) {
    console.error('[SecureStore::Web] setApiKey failed:', e);
  }
}

export async function deleteApiKey(): Promise<void> {
  try {
    localStorage.removeItem(KEYS.API_KEY);
  } catch {
    // ignore
  }
}

export async function getBaseUrl(): Promise<string | null> {
  try {
    return localStorage.getItem(KEYS.BASE_URL) || null;
  } catch {
    return null;
  }
}

export async function setBaseUrl(value: string): Promise<void> {
  try {
    localStorage.setItem(KEYS.BASE_URL, value);
  } catch (e) {
    console.error('[SecureStore::Web] setBaseUrl failed:', e);
  }
}

export async function deleteBaseUrl(): Promise<void> {
  try {
    localStorage.removeItem(KEYS.BASE_URL);
  } catch {
    // ignore
  }
}

export async function getModel(): Promise<string | null> {
  try {
    return localStorage.getItem(KEYS.MODEL) || null;
  } catch {
    return null;
  }
}

export async function setModel(value: string): Promise<void> {
  try {
    localStorage.setItem(KEYS.MODEL, value);
  } catch (e) {
    console.error('[SecureStore::Web] setModel failed:', e);
  }
}

export async function deleteModel(): Promise<void> {
  try {
    localStorage.removeItem(KEYS.MODEL);
  } catch {
    // ignore
  }
}
