/**
 * Sampled-instrument preset (`preset.json` in a pack). Self-contained (no imports) so the pack builder can validate what it writes.
 * Times are seconds of the encoded files; optional fields are omitted when they hold their default.
 */

export interface PresetFile {
  /** Path relative to the preset folder. */
  path: string;
  /** Frames and channels of the encoded file at `Preset.sampleRate`, used to budget decoded memory. */
  frames: number;
  channels: 1 | 2;
}

export interface PresetRegion {
  /** Index into `Preset.files`. */
  file: number;
  lokey: number;
  hikey: number;
  /** MIDI note the file sounds at. */
  center: number;
  lovel: number;
  hivel: number;
  /** Cents. */
  tune?: number;
  /** dB. */
  volume?: number;
  /** -1..1 */
  pan?: number;
  /** Loop points in seconds; present only for a continuously looped region. */
  loopStart?: number;
  loopEnd?: number;
  /** Envelope seconds; sustain 0..1. Defaults: attack 0, hold 0, decay 0, sustain 1, release 0.05. */
  attack?: number;
  hold?: number;
  decay?: number;
  sustain?: number;
  release?: number;
  /** 0..1, default 1. */
  veltrack?: number;
  /** 0 plays every key at the original pitch; default follows the key. */
  keytrack?: 0;
  /** `'release'` plays when the key is released. */
  trigger?: 'release';
  /** dB per second the key was held (release triggers). */
  rtDecay?: number;
  /** Low-pass cutoff in Hz. */
  cutoff?: number;
  /** The note ignores key-off and plays the whole file. */
  oneShot?: true;
}

export interface Preset {
  version: 1;
  id: string;
  name: string;
  sampleRate: number;
  /** Optional musical family, preserved for browser previews. */
  category?: string;
  /** Credit and licence lines shown in the app. */
  credits: string[];
  license: string;
  files: PresetFile[];
  regions: PresetRegion[];
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function opt(r: Record<string, unknown>, key: string, lo: number, hi: number): number | undefined {
  const v = r[key];
  if (v === undefined) return undefined;
  if (!finite(v) || v < lo || v > hi) throw new Error(`region ${key} is out of range`);
  return v;
}

/** Validates parsed JSON and returns the preset; throws on anything the player could not use. */
export function normalizePreset(input: unknown): Preset {
  if (!isObject(input) || input['version'] !== 1) throw new Error('unsupported preset version');
  const { id, name, sampleRate, files, regions } = input;
  if (typeof id !== 'string' || !id || typeof name !== 'string' || !finite(sampleRate) || sampleRate < 8000) throw new Error('preset header is invalid');
  if (!Array.isArray(files) || !Array.isArray(regions) || regions.length === 0) throw new Error('preset has no regions');
  const outFiles: PresetFile[] = files.map((f) => {
    if (!isObject(f) || typeof f['path'] !== 'string' || !f['path'] || f['path'].startsWith('/') || f['path'].includes('..')) throw new Error('preset file path is invalid');
    if (!finite(f['frames']) || f['frames'] < 1 || (f['channels'] !== 1 && f['channels'] !== 2)) throw new Error('preset file size is invalid');
    return { path: f['path'], frames: f['frames'], channels: f['channels'] };
  });
  const outRegions: PresetRegion[] = regions.map((raw) => {
    if (!isObject(raw)) throw new Error('region is invalid');
    const file = raw['file'];
    if (!finite(file) || !Number.isInteger(file) || file < 0 || file >= outFiles.length) throw new Error('region file index is invalid');
    const lokey = opt(raw, 'lokey', 0, 127), hikey = opt(raw, 'hikey', 0, 127), center = opt(raw, 'center', 0, 127);
    const lovel = opt(raw, 'lovel', 1, 127), hivel = opt(raw, 'hivel', 1, 127);
    if (lokey === undefined || hikey === undefined || center === undefined || lovel === undefined || hivel === undefined || lokey > hikey || lovel > hivel) throw new Error('region ranges are invalid');
    const r: PresetRegion = { file, lokey, hikey, center, lovel, hivel };
    const set = <K extends keyof PresetRegion>(k: K, v: PresetRegion[K] | undefined) => { if (v !== undefined) r[k] = v; };
    set('tune', opt(raw, 'tune', -4800, 4800));
    set('volume', opt(raw, 'volume', -144, 48));
    set('pan', opt(raw, 'pan', -1, 1));
    set('loopStart', opt(raw, 'loopStart', 0, 1e5));
    set('loopEnd', opt(raw, 'loopEnd', 0, 1e5));
    if ((r.loopStart === undefined) !== (r.loopEnd === undefined) || (r.loopStart !== undefined && r.loopEnd! <= r.loopStart)) throw new Error('region loop is invalid');
    set('attack', opt(raw, 'attack', 0, 60));
    set('hold', opt(raw, 'hold', 0, 600));
    set('decay', opt(raw, 'decay', 0, 600));
    set('sustain', opt(raw, 'sustain', 0, 1));
    set('release', opt(raw, 'release', 0, 60));
    set('veltrack', opt(raw, 'veltrack', 0, 1));
    set('rtDecay', opt(raw, 'rtDecay', 0, 100));
    set('cutoff', opt(raw, 'cutoff', 20, 22050));
    if (raw['keytrack'] === 0) r.keytrack = 0;
    if (raw['trigger'] === 'release') r.trigger = 'release';
    if (raw['oneShot'] === true) r.oneShot = true;
    return r;
  });
  const credits = Array.isArray(input['credits']) ? input['credits'].filter((c): c is string => typeof c === 'string') : [];
  return { version: 1, id, name, sampleRate, ...(typeof input['category'] === 'string' ? { category: input['category'] } : {}), credits, license: typeof input['license'] === 'string' ? input['license'] : '', files: outFiles, regions: outRegions };
}

/** Bytes of decoded float32 audio for a file, optionally scaled for a context running at another rate. */
export function decodedBytes(file: PresetFile, presetRate: number, contextRate = presetRate): number {
  return Math.ceil((file.frames * contextRate) / presetRate) * file.channels * 4;
}

/** Decoded float32 bytes of every distinct file in a preset. */
export function presetDecodedBytes(preset: Preset, contextRate = preset.sampleRate): number {
  return preset.files.reduce((sum, f) => sum + decodedBytes(f, preset.sampleRate, contextRate), 0);
}
