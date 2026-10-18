import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { BEGIN_NOTE, PAD_SECONDS, notesFromHeads, type Heads } from './notes';

const C = 88;
function empty(frames: number): Heads {
  return { onset: new Float32Array(frames * C), offset: new Float32Array(frames * C), frame: new Float32Array(frames * C), velocity: new Float32Array(frames * C) };
}
const set = (a: Float32Array, frame: number, key: number, v: number) => (a[frame * C + key] = Math.fround(v));

describe('notesFromHeads', () => {
  it('returns nothing for silence', () => {
    expect(notesFromHeads(empty(300), 300)).toEqual([]);
  });

  it('detects a note from an onset peak, frame activity and an offset peak, shifted back by the 1 s pad', () => {
    const T = 400;
    const h = empty(T);
    const key = 39; // MIDI 60
    for (const [f, v] of [[198, 0.1], [199, 0.4], [200, 0.8], [201, 0.4], [202, 0.1]] as const) set(h.onset, f, key, v);
    for (let f = 200; f < 260; f++) set(h.frame, f, key, 0.9);
    for (const [f, v] of [[256, 0.05], [257, 0.1], [258, 0.2], [259, 0.35], [260, 0.7], [261, 0.35], [262, 0.2], [263, 0.1], [264, 0.05]] as const) set(h.offset, f, key, v);
    set(h.velocity, 200, key, 0.5);
    const notes = notesFromHeads(h, T);
    expect(notes).toHaveLength(1);
    const n = notes[0]!;
    expect(n.pitch).toBe(60);
    expect(n.velocity).toBe(64);
    expect(n.onset).toBeCloseTo(2.0 - PAD_SECONDS, 3);
    expect(n.offset).toBeCloseTo(2.6 - PAD_SECONDS, 2);
  });

  it('drops notes that end inside the front pad and clamps onsets at zero', () => {
    const T = 300;
    const h = empty(T);
    const key = 10;
    for (const [f, v] of [[48, 0.1], [49, 0.4], [50, 0.8], [51, 0.4], [52, 0.1]] as const) set(h.onset, f, key, v);
    for (let f = 50; f < 70; f++) set(h.frame, f, key, 0.9); // ends at frame 70 = 0.7 s, inside the pad
    expect(notesFromHeads(h, T)).toEqual([]);
    const k2 = 20;
    for (const [f, v] of [[98, 0.1], [99, 0.4], [100, 0.8], [101, 0.4], [102, 0.1]] as const) set(h.onset, f, k2, v);
    for (let f = 98; f < 130; f++) set(h.frame, f, k2, 0.9);
    const kept = notesFromHeads(h, T);
    expect(kept).toHaveLength(1);
    expect(kept[0]!.pitch).toBe(k2 + BEGIN_NOTE);
    expect(kept[0]!.onset).toBeGreaterThanOrEqual(0);
  });

  it('returns notes sorted by onset then pitch', () => {
    const T = 500;
    const h = empty(T);
    for (const [key, at] of [[50, 300], [10, 200], [5, 200]] as const) {
      for (const [d, v] of [[-2, 0.1], [-1, 0.4], [0, 0.8], [1, 0.4], [2, 0.1]] as const) set(h.onset, at + d, key, v);
      for (let f = at; f < at + 40; f++) set(h.frame, f, key, 0.9);
    }
    const notes = notesFromHeads(h, T);
    expect(notes.map((n) => n.pitch)).toEqual([5 + BEGIN_NOTE, 10 + BEGIN_NOTE, 50 + BEGIN_NOTE]);
  });
});

describe('reference take 1', () => {
  interface Fixture {
    scale: number;
    frames: number;
    heads: Record<'onset' | 'offset' | 'frame' | 'velocity', number[]>;
    expectedPadded: Array<{ onset: number; offset: number; pitch: number; velocity: number }>;
  }
  const fx = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/take1.heads.json.gz', import.meta.url))).toString()) as Fixture;
  const build = (pairs: number[]) => {
    const a = new Float32Array(fx.frames * C);
    for (let i = 0; i < pairs.length; i += 2) a[pairs[i]!] = Math.fround(pairs[i + 1]! / fx.scale);
    return a;
  };

  it('reproduces the 25 notes the Python package computes from the same head arrays', () => {
    const heads: Heads = { onset: build(fx.heads.onset), offset: build(fx.heads.offset), frame: build(fx.heads.frame), velocity: build(fx.heads.velocity) };
    const got = notesFromHeads(heads, fx.frames);
    const want = fx.expectedPadded
      .map((n) => ({ ...n, onset: Math.max(0, n.onset - PAD_SECONDS), offset: n.offset - PAD_SECONDS }))
      .filter((n) => n.offset > 0)
      .sort((a, b) => a.onset - b.onset || a.pitch - b.pitch);
    expect(want).toHaveLength(25);
    expect(got).toHaveLength(25);
    got.forEach((n, i) => {
      const w = want[i]!;
      expect(n.pitch).toBe(w.pitch);
      expect(n.velocity).toBe(w.velocity);
      expect(Math.abs(n.onset - w.onset)).toBeLessThan(1e-4);
      expect(Math.abs(n.offset - w.offset)).toBeLessThan(1e-4);
    });
  });
});
