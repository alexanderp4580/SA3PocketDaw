import { describe, expect, it } from 'vitest';
import { bakeLoop, crossfadeFrames, findLoop, loopHoldSeconds, formatLoop, normalizeLoop, seamStats, trimmedLoop, LOOP_MIN_START_SEC } from './loopPoints';

const SR = 44100;

function noise(n: number, seed = 1): Float32Array {
  let s = seed >>> 0;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    out[i] = (s / 0xffffffff) * 2 - 1;
  }
  return out;
}
/** Harmonic tone: amplitude(t) shapes the level, phase accumulates from the (possibly modulated) frequency. */
function tone(f0: number, sec: number, amp: (t: number) => number, vibrato?: { depth: number; hz: number }): Float32Array {
  const n = Math.round(sec * SR);
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = f0 * (1 + (vibrato ? vibrato.depth * Math.sin(2 * Math.PI * vibrato.hz * t) : 0));
    phase += (2 * Math.PI * f) / SR;
    let v = 0;
    for (let h = 1; h <= 5; h++) v += Math.sin(h * phase) / h;
    out[i] = 0.4 * amp(t) * v;
  }
  return out;
}
const sustained = (t: number) => 1 + 2 * Math.exp(-t / 0.05);

describe('findLoop', () => {
  it('finds a loop in the sustained part of a harmonic tone, a whole number of periods long', () => {
    const f0 = 220;
    const pcm = tone(f0, 3, sustained);
    const loop = findLoop(pcm, SR)!;
    expect(loop).not.toBeNull();
    expect(loop.start).toBeGreaterThanOrEqual(LOOP_MIN_START_SEC);
    expect(loop.end).toBeLessThanOrEqual(3);
    const periods = (loop.end - loop.start) * f0;
    expect(Math.abs(periods - Math.round(periods))).toBeLessThan(0.02);
    expect(loop.end - loop.start).toBeGreaterThan(0.1);
  });

  it('bakes a loop whose wrapped seam is no larger than a typical step', () => {
    const pcm = tone(220, 3, sustained);
    const loop = findLoop(pcm, SR)!;
    const baked = bakeLoop(pcm, SR, loop);
    const s = seamStats(baked, SR, loop);
    expect(s.jump).toBeLessThanOrEqual(s.maxStep);
    expect(s.jump).toBeLessThanOrEqual(s.typicalStep * 2);
  });

  it('finds a loop for a tone with slow vibrato and amplitude wobble', () => {
    const pcm = tone(196, 4, (t) => sustained(t) * (1 + 0.1 * Math.sin(2 * Math.PI * 3 * t)), { depth: 0.003, hz: 5 });
    const loop = findLoop(pcm, SR)!;
    expect(loop).not.toBeNull();
    expect(loop.start).toBeGreaterThanOrEqual(LOOP_MIN_START_SEC);
    const baked = bakeLoop(pcm, SR, loop);
    const s = seamStats(baked, SR, loop);
    expect(s.jump).toBeLessThanOrEqual(s.maxStep);
  });

  it('returns null for noise', () => {
    expect(findLoop(noise(3 * SR), SR)).toBeNull();
  });

  it('returns null for a fast-decaying pluck', () => {
    expect(findLoop(tone(220, 3, (t) => Math.exp(-t / 0.08)), SR)).toBeNull();
  });

  it('returns null for input that is too short, silent or empty', () => {
    expect(findLoop(tone(220, 0.3, () => 1), SR)).toBeNull();
    expect(findLoop(new Float32Array(3 * SR), SR)).toBeNull();
    expect(findLoop(new Float32Array(0), SR)).toBeNull();
  });

  it('keeps the loop out of a fade-out tail', () => {
    const pcm = tone(220, 3, (t) => sustained(t) * (t > 2.4 ? Math.max(0, 1 - (t - 2.4) / 0.4) : 1));
    const loop = findLoop(pcm, SR)!;
    expect(loop).not.toBeNull();
    expect(loop.end).toBeLessThanOrEqual(2.5);
  });
});

describe('bakeLoop', () => {
  it('uses a crossfade of at most 30 ms and a third of the loop', () => {
    expect(crossfadeFrames(SR, SR)).toBe(Math.round(0.03 * SR));
    expect(crossfadeFrames(SR, 3000)).toBe(1000);
  });

  it('leaves audio outside the crossfaded tail untouched and does not modify the input', () => {
    const pcm = tone(220, 3, sustained);
    const copy = pcm.slice();
    const loop = findLoop(pcm, SR)!;
    const baked = bakeLoop(pcm, SR, loop);
    const x = crossfadeFrames(SR, Math.round((loop.end - loop.start) * SR));
    const e = Math.round(loop.end * SR);
    expect(pcm).toEqual(copy);
    expect(baked.length).toBe(pcm.length);
    for (let i = 0; i < e - x; i++) expect(baked[i]).toBe(pcm[i]);
    for (let i = e; i < pcm.length; i++) expect(baked[i]).toBe(pcm[i]);
  });

  it('keeps the level through the crossfade for a coherent signal', () => {
    const pcm = tone(220, 3, () => 1);
    const loop = findLoop(pcm, SR)!;
    const baked = bakeLoop(pcm, SR, loop);
    const e = Math.round(loop.end * SR);
    const x = crossfadeFrames(SR, Math.round((loop.end - loop.start) * SR));
    const rms = (a: Float32Array) => Math.sqrt(a.reduce((p, v) => p + v * v, 0) / a.length);
    const mid = baked.subarray(e - Math.round(x * 0.6), e - Math.round(x * 0.4));
    const ref = pcm.subarray(e - x - 2000, e - x);
    expect(rms(mid) / rms(ref)).toBeGreaterThan(0.85);
    expect(rms(mid) / rms(ref)).toBeLessThan(1.15);
  });

  it('crossfades an incoherent tail toward the material before the start, wrapping without a jump', () => {
    const pcm = noise(SR, 7);
    const loop = { start: 0.3, end: 0.8 };
    const baked = bakeLoop(pcm, SR, loop);
    const s = Math.round(0.3 * SR), e = Math.round(0.8 * SR);
    expect(baked[e - 1]).toBeCloseTo(pcm[s - 1]!, 6);
    expect(Math.abs(baked[e - 1]! - baked[s]!)).toBe(Math.abs(pcm[s - 1]! - pcm[s]!));
  });

  it('returns the input unchanged for a loop that cannot be crossfaded', () => {
    const pcm = noise(SR, 3);
    expect(bakeLoop(pcm, SR, { start: 0, end: 0.5 })).toEqual(pcm);
  });
});

describe('loop helpers', () => {
  it('shifts the loop by the chop start and keeps it while the chop leaves it whole', () => {
    const len = 3 * SR;
    expect(trimmedLoop({ start: 1, end: 2 }, undefined, len, SR)).toEqual({ start: 1, end: 2 });
    const t = trimmedLoop({ start: 1, end: 2 }, { start: 0.5, end: 2.5 }, len, SR)!;
    expect(t.start).toBeCloseTo(0.5, 5);
    expect(t.end).toBeCloseTo(1.5, 5);
  });

  it('drops the loop when a chop edge, with its fade, reaches into it', () => {
    const len = 3 * SR;
    expect(trimmedLoop({ start: 1, end: 2 }, { start: 1.2, end: 3 }, len, SR)).toBeNull();
    expect(trimmedLoop({ start: 1, end: 2 }, { start: 0, end: 1.5 }, len, SR)).toBeNull();
    expect(trimmedLoop({ start: 1, end: 2 }, { start: 0, end: 2.001 }, len, SR)).toBeNull();
    expect(trimmedLoop(undefined, { start: 0.5, end: 2 }, len, SR)).toBeNull();
  });

  it('validates persisted loops', () => {
    expect(normalizeLoop({ start: 1, end: 2 })).toEqual({ start: 1, end: 2 });
    expect(normalizeLoop({ start: 2, end: 1 })).toBeUndefined();
    expect(normalizeLoop({ start: -1, end: 1 })).toBeUndefined();
    expect(normalizeLoop({ start: 'a', end: 1 })).toBeUndefined();
    expect(normalizeLoop(undefined)).toBeUndefined();
    expect(normalizeLoop({ start: 0.5, end: 3 }, 2)).toBeUndefined();
  });

  it('formats a loop for display', () => {
    expect(formatLoop({ start: 1.2, end: 2.849 })).toBe('Loop 1.20–2.85 s');
  });

  it('holds a preview note past the loop start', () => {
    expect(loopHoldSeconds({ start: 0.2, end: 0.7 })).toBeGreaterThan(0.7);
  });
});
