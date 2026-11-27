import * as SecureStore from 'expo-secure-store';

/** Stocare persistentă pe telefon: Keychain (iOS) / Keystore (Android). Pe web se folosește storage.web.ts. */
export async function getItem(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function setItem(key: string, value: string): Promise<void> {
  await SecureStore.setItemAsync(key, value);
}

export async function removeItem(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // cheia nu exista
  }
}
