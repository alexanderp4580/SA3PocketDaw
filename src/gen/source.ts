/** Where a clip is generated: on this device or through Stability AI's API. */
export type GenSource = 'device' | 'cloud';

export const SOURCE_STORAGE_KEY = 'sa3daw.genSource';
export const SOURCE_LABELS: Record<GenSource, string> = { device: 'On device', cloud: 'Cloud' };

interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

export function loadSource(storage: StorageLike | null): GenSource {
  try {
    return storage?.getItem(SOURCE_STORAGE_KEY) === 'cloud' ? 'cloud' : 'device';
  } catch {
    return 'device';
  }
}

export function saveSource(storage: StorageLike | null, source: GenSource): void {
  try {
    storage?.setItem(SOURCE_STORAGE_KEY, source);
  } catch {
    /* storage unavailable */
  }
}

/** The stored choice, or on-device when no key is saved. */
export function effectiveSource(stored: GenSource, hasKey: boolean): GenSource {
  return stored === 'cloud' && hasKey ? 'cloud' : 'device';
}

export function cloudBlockedReason(hasKey: boolean): string {
  return hasKey ? '' : 'Save a Stability AI key on the Models screen to use the cloud.';
}
