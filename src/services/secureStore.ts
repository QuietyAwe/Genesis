import * as SecureStore from 'expo-secure-store';

const SECURE_KEYS = {
  API_KEY: 'genesis_api_key',
  BASE_URL: 'genesis_base_url',
  MODEL: 'genesis_model',
} as const;

export async function getApiKey(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(SECURE_KEYS.API_KEY);
  } catch {
    return null;
  }
}

export async function setApiKey(value: string): Promise<void> {
  await SecureStore.setItemAsync(SECURE_KEYS.API_KEY, value);
}

export async function deleteApiKey(): Promise<void> {
  await SecureStore.deleteItemAsync(SECURE_KEYS.API_KEY);
}

export async function getBaseUrl(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(SECURE_KEYS.BASE_URL);
  } catch {
    return null;
  }
}

export async function setBaseUrl(value: string): Promise<void> {
  await SecureStore.setItemAsync(SECURE_KEYS.BASE_URL, value);
}

export async function deleteBaseUrl(): Promise<void> {
  await SecureStore.deleteItemAsync(SECURE_KEYS.BASE_URL);
}

export async function getModel(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(SECURE_KEYS.MODEL);
  } catch {
    return null;
  }
}

export async function setModel(value: string): Promise<void> {
  await SecureStore.setItemAsync(SECURE_KEYS.MODEL, value);
}

export async function deleteModel(): Promise<void> {
  await SecureStore.deleteItemAsync(SECURE_KEYS.MODEL);
}
