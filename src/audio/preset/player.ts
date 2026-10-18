import { log } from '../../log';
import type { BufferLike } from '../sampler';
import type { Preset } from '../sfz/format';
import { regionsToPlay, type RegionPlay } from '../sfz/select';
import type { SampleCache } from './cache';
import { startRegionVoice, type PresetContext, type RegionVoice } from './voice';

const scope = log.scope('audio.preset');

export const MAX_PRESET_VOICES = 32;
/** Fade of a voice that is stolen for a new note. */
export const STEAL_FADE_SEC = 0.03;
/** A late note keeps its end; one with less than this left is skipped. */
export const MIN_NOTE_SEC = 0.03;

export interface PlayerNote { midi: number; /** Gain 0..1, velocity / 127. */ velocity: number }

export interface PresetPlayerOptions {
  ctx: PresetContext;
  output: unknown;
  preset: Preset;
  /** Decoded files, keyed by `cacheKey(file path)`. */
  cache: SampleCache<BufferLike>;
  maxVoices?: number;
  /** Called with the cache keys the player's notes need, so they stay decoded. */
  onRetain?: (keys: Set<string>) => void;
}

export const toVelocity = (gain: number): number => Math.min(127, Math.max(1, Math.round(gain * 127)));
export const cacheKey = (presetId: string, path: string) => `${presetId}/${path}`;

export function createPresetPlayer(o: PresetPlayerOptions) {
  const { ctx, preset, cache } = o;
  const maxVoices = o.maxVoices ?? MAX_PRESET_VOICES;
  const voices: RegionVoice[] = [];
  const failed = new Set<string>();
  let disposed = false;
  let epoch = 0;

  const keyOf = (play: RegionPlay) => cacheKey(preset.id, preset.files[play.region.file]!.path);

  async function buffer(play: RegionPlay): Promise<BufferLike | null> {
    const key = keyOf(play);
    const hit = cache.peek(key);
    if (hit) return hit;
    try {
      return await cache.get(key);
    } catch (e) {
      if (!failed.has(key)) {
        failed.add(key);
        scope.error('preset sample could not be loaded', { preset: preset.id, key, error: String(e) });
      }
      return null;
    }
  }

  function makeRoom() {
    const now = ctx.currentTime;
    for (let i = voices.length - 1; i >= 0; i--) if (voices[i]!.endTime <= now) voices.splice(i, 1);
    while (voices.length >= maxVoices) {
      let oldest = 0;
      voices.forEach((v, i) => { if (v.startTime < voices[oldest]!.startTime) oldest = i; });
      voices.splice(oldest, 1)[0]!.stop(now, STEAL_FADE_SEC);
    }
  }

  /** Starts `play` at `at`; a sample that was not decoded yet starts late with what is left of the note. */
  async function start(play: RegionPlay, at: number, noteEnd: number, release: boolean, token: number) {
    const buf = await buffer(play);
    if (!buf || disposed || token !== epoch) return;
    const when = Math.max(at, ctx.currentTime);
    const duration = release ? 0 : noteEnd - when;
    if (!release && duration < MIN_NOTE_SEC) return;
    makeRoom();
    voices.push(startRegionVoice(ctx, { play, buffer: buf, when, duration, output: o.output }));
  }

  const keysFor = (notes: PlayerNote[]): Set<string> => {
    const keys = new Set<string>();
    for (const n of notes) {
      const vel = toVelocity(n.velocity);
      for (const trigger of ['attack', 'release'] as const) for (const p of regionsToPlay(preset, n.midi, vel, trigger)) keys.add(keyOf(p));
    }
    return keys;
  };

  return {
    /** Plays a note (velocity as gain 0..1) starting at context time `when` for `duration` seconds. */
    async note(midi: number, when: number, duration: number, velocity: number): Promise<void> {
      if (disposed) return;
      const token = epoch;
      const vel = toVelocity(velocity);
      const noteEnd = when + duration;
      const jobs = regionsToPlay(preset, midi, vel).map((p) => start(p, when, noteEnd, false, token));
      for (const p of regionsToPlay(preset, midi, vel, 'release', duration)) jobs.push(start(p, noteEnd, noteEnd, true, token));
      await Promise.all(jobs);
    },
    /** Decodes everything the notes need. */
    async prepare(notes: PlayerNote[]): Promise<void> {
      const keys = keysFor(notes);
      await Promise.all([...keys].map((k) => cache.get(k).catch((e) => { if (!failed.has(k)) { failed.add(k); scope.error('preset sample could not be loaded', { preset: preset.id, key: k, error: String(e) }); } })));
    },
    /** Keeps the files these notes need decoded. */
    retain(notes: PlayerNote[]) {
      o.onRetain?.(keysFor(notes));
    },
    stop(immediate = false) {
      epoch++;
      const now = ctx.currentTime;
      for (const v of voices) v.stop(now, immediate ? 0.005 : 0.12);
      voices.length = 0;
    },
    dispose() {
      this.stop(true);
      o.onRetain?.(new Set());
      disposed = true;
    },
    get voiceCount() {
      const now = ctx.currentTime;
      return voices.filter((v) => v.endTime > now).length;
    },
  };
}

export type PresetPlayer = ReturnType<typeof createPresetPlayer>;
