/** Stocare în browser (localStorage). Pe telefon se folosește storage.ts (SecureStore). */
export async function getItem(key: string): Promise<string | null> {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function setItem(key: string, value: string): Promise<void> {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // mod privat sau storage plin: sesiunea rămâne doar în memorie
  }
}

export async function removeItem(key: string): Promise<void> {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignorăm
  }
}
