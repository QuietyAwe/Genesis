// Web stub: expo-sqlite unavailable in browser.
// On native, the real index.ts is used.

export async function openDatabase(): Promise<void> {}

export async function initDatabase(): Promise<void> {
  console.warn('[DB] SQLite unavailable on web — running with empty data');
}

export async function getDB(): Promise<never> {
  throw new Error('SQLite is not available on web');
}

export const isWebStub = true;
