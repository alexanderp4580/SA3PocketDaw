export const API_KEY_STORAGE_KEY = 'sa3daw.stabilityKey';

interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

/** The saved Stability AI key, or null when none is saved or storage is unavailable. */
export function loadApiKey(storage: StorageLike | null): string | null {
  try {
    const v = storage?.getItem(API_KEY_STORAGE_KEY)?.trim();
    return v ? v : null;
  } catch {
    return null;
  }
}

/** Saves the trimmed key; false when it is blank or storage refuses it. */
export function saveApiKey(storage: StorageLike | null, key: string): boolean {
  const v = key.trim();
  if (!v) return false;
  try {
    if (!storage) return false;
    storage.setItem(API_KEY_STORAGE_KEY, v);
    return true;
  } catch {
    return false;
  }
}

export function clearApiKey(storage: StorageLike | null): void {
  try {
    storage?.removeItem(API_KEY_STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** The only form in which a key may be shown or logged: the last four characters. */
export function maskKey(key: string): string {
  return key ? `••••${key.length > 4 ? key.slice(-4) : ''}` : '';
}

/** Text with every occurrence of the key replaced by its masked form. */
export function redactKey(text: string, key: string): string {
  return key ? text.split(key).join(maskKey(key)) : text;
}

/** Hooks key removal into the "Clear all app data" registry. */
export function registerKeyClear(addClearHook: (hook: () => Promise<void> | void) => void, storage: StorageLike | null): void {
  addClearHook(() => clearApiKey(storage));
}
