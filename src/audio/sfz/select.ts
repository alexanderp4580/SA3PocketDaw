import type { Preset, PresetRegion } from './format';

export const DEFAULT_RELEASE_SEC = 0.05;
/** Shortest attack and release, so a note never starts or ends with a step. */
export const MIN_ATTACK_SEC = 0.002;
export const MIN_RELEASE_SEC = 0.015;

export interface Envelope {
  attack: number;
  hold: number;
  decay: number;
  /** 0..1 */
  sustain: number;
  release: number;
}

export interface RegionPlay {
  region: PresetRegion;
  /** Playback rate of the file. */
  rate: number;
  /** Linear gain from volume, velocity and (for release triggers) the hold time. */
  gain: number;
  envelope: Envelope;
}

const db = (x: number) => Math.pow(10, x / 20);

/** Regions that sound for a key and velocity (1..127). `trigger` picks note-on or key-off regions. */
export function selectRegions(preset: Preset, key: number, velocity: number, trigger: 'attack' | 'release' = 'attack'): PresetRegion[] {
  const out: PresetRegion[] = [];
  for (const r of preset.regions) {
    if ((r.trigger === 'release') !== (trigger === 'release')) continue;
    if (key < r.lokey || key > r.hikey || velocity < r.lovel || velocity > r.hivel) continue;
    out.push(r);
  }
  return out;
}

/** `(1 - t) + t * (v / 127)^2` for velocity tracking `t`. */
export function velocityGain(velocity: number, veltrack = 1): number {
  const x = Math.min(127, Math.max(0, velocity)) / 127;
  return 1 - veltrack + veltrack * x * x;
}

export function regionRate(r: PresetRegion, key: number): number {
  const semis = r.keytrack === 0 ? 0 : key - r.center;
  return Math.pow(2, semis / 12 + (r.tune ?? 0) / 1200);
}

export function regionEnvelope(r: PresetRegion): Envelope {
  return { attack: r.attack ?? 0, hold: r.hold ?? 0, decay: r.decay ?? 0, sustain: r.sustain ?? 1, release: r.release ?? DEFAULT_RELEASE_SEC };
}

/** Playback numbers for one region. `heldSec` is the time the key was held (release triggers). */
export function regionPlay(r: PresetRegion, key: number, velocity: number, heldSec = 0): RegionPlay {
  const decayGain = r.trigger === 'release' && r.rtDecay ? db(-r.rtDecay * Math.max(0, heldSec)) : 1;
  return { region: r, rate: regionRate(r, key), gain: db(r.volume ?? 0) * velocityGain(velocity, r.veltrack) * decayGain, envelope: regionEnvelope(r) };
}

export function regionsToPlay(preset: Preset, key: number, velocity: number, trigger: 'attack' | 'release' = 'attack', heldSec = 0): RegionPlay[] {
  return selectRegions(preset, key, velocity, trigger).map((r) => regionPlay(r, key, velocity, heldSec));
}

/** Envelope level (0..1) `t` seconds after note-on while the key is held. */
export function heldLevel(env: Envelope, t: number): number {
  const attack = Math.max(env.attack, MIN_ATTACK_SEC);
  if (t < attack) return Math.max(0, t) / attack;
  if (t < attack + env.hold) return 1;
  if (env.decay <= 0) return env.sustain;
  const d = (t - attack - env.hold) / env.decay;
  return d >= 1 ? env.sustain : 1 - (1 - env.sustain) * d;
}

/** Seconds from note-on until the sound has fully released for a note of `duration`. */
export function voiceSeconds(env: Envelope, duration: number): number {
  return Math.max(duration, MIN_ATTACK_SEC) + Math.max(env.release, MIN_RELEASE_SEC);
}
