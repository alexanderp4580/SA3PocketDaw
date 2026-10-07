import type { ModelId } from './protocol';

export const MIN_SECONDS = 0.5;
export const SECONDS_STEP = 0.25;
export const DEFAULT_SECONDS = 2;
export const STORAGE_KEY = 'sa3daw.genSeconds';

/**
 * Longest clip offered per model. 10 s is the length the PoC ran on every model (Small user-reported on a Pixel, Medium measured on the Deck);
 * the SA3 seconds conditioner accepts up to 384 s but longer clips are untested here.
 */
export const MAX_SECONDS: Record<ModelId, number> = {
  'small-music': 10,
  'small-sfx': 10,
  medium: 10,
};

/** Parses a typed seconds value (dot or comma decimal); null when it is not a non-negative finite number. */
export function parseSeconds(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(t)) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

export function clampSeconds(v: number, model: ModelId): number {
  if (!Number.isFinite(v)) return DEFAULT_SECONDS;
  return round2(Math.min(MAX_SECONDS[model], Math.max(MIN_SECONDS, v)));
}

export function stepSeconds(v: number, dir: 1 | -1, model: ModelId): number {
  return clampSeconds(v + dir * SECONDS_STEP, model);
}

/** Exact decoded frame count for a (possibly fractional) duration, limited to what the decoder produced. */
export function outputFrames(seconds: number, sampleRate: number, available: number): number {
  return Math.min(Math.round(seconds * sampleRate), available);
}

interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

export function loadSeconds(storage: StorageLike | null, model: ModelId): number {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    const v = raw == null ? null : parseSeconds(raw);
    return v === null ? DEFAULT_SECONDS : clampSeconds(v, model);
  } catch {
    return DEFAULT_SECONDS;
  }
}

export function saveSeconds(storage: StorageLike | null, seconds: number): void {
  try {
    storage?.setItem(STORAGE_KEY, String(seconds));
  } catch {
    /* storage unavailable */
  }
}
