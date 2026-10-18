import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS module
import { bakeCrossfade, chooseLayers, distinctLayers, keptSeconds, loopSeconds, pickBitrate, respanKeys, respanLayers, tailSeconds, thinKeys } from './lib.mjs';

const reg = (lovel: number, hivel: number, c: number, lokey = c, hikey = c) => ({ lovel, hivel, pitchKeycenter: c, lokey, hikey });

describe('velocity layers', () => {
  const sixteen = [[1, 26], [27, 34], [35, 36], [37, 43], [44, 46], [47, 50], [51, 56], [57, 64], [65, 72], [73, 80], [81, 88], [89, 96], [97, 104], [105, 112], [113, 120], [121, 127]];
  const layers = distinctLayers(sixteen.map(([a, b]) => reg(a!, b!, 60)));
  it('lists distinct ranges in order', () => {
    expect(layers).toHaveLength(16);
    expect(distinctLayers([reg(1, 5, 1), reg(1, 5, 2), reg(6, 9, 1)])).toEqual([{ lovel: 1, hivel: 5 }, { lovel: 6, hivel: 9 }]);
  });
  it('spreads the chosen layers over the velocity range, each original once', () => {
    const c = chooseLayers(layers, 5);
    expect(c).toHaveLength(5);
    expect(new Set(c.map((l: any) => l.lovel)).size).toBe(5);
    expect(c[0].lovel).toBeLessThan(40);
    expect(c[4].hivel).toBeGreaterThan(100);
    expect(chooseLayers(layers, 20)).toHaveLength(16);
    expect(chooseLayers(layers, 1)).toHaveLength(1);
  });
  it('covers 1..127 without gaps or overlaps after dropping layers', () => {
    const chosen = chooseLayers(layers, 4);
    const map = respanLayers(chosen);
    const ranges = [...map.values()].sort((a: any, b: any) => a.lovel - b.lovel);
    expect(ranges[0].lovel).toBe(1);
    expect(ranges.at(-1).hivel).toBe(127);
    for (let i = 1; i < ranges.length; i++) expect(ranges[i].lovel).toBe(ranges[i - 1].hivel + 1);
  });
  it('a single layer covers every velocity', () => {
    expect([...respanLayers([{ lovel: 50, hivel: 60 }]).values()]).toEqual([{ lovel: 1, hivel: 127 }]);
  });
});

describe('key ranges', () => {
  const regions = [21, 24, 27, 30, 33, 36].map((c) => reg(1, 127, c, c - 1, c + 1));
  it('splits halfway between centres and keeps the outer reach', () => {
    const r = respanKeys([reg(1, 127, 24, 23, 25), reg(1, 127, 30, 29, 31), reg(1, 127, 40, 39, 42)]);
    expect(r.map((x: any) => [x.lokey, x.hikey])).toEqual([[23, 27], [28, 35], [36, 42]]);
  });
  it('thinning keeps every nth plus the last and leaves no gap', () => {
    const r = thinKeys(regions, 2);
    expect(r.map((x: any) => x.pitchKeycenter)).toEqual([21, 27, 33, 36]);
    for (let i = 1; i < r.length; i++) expect(r[i].lokey).toBe(r[i - 1].hikey + 1);
    expect(r[0].lokey).toBe(20);
    expect(r.at(-1).hikey).toBe(37);
  });
  it('step 1 changes nothing', () => {
    expect(thinKeys(regions, 1)).toBe(regions);
  });
});

describe('tails and loops', () => {
  const schedule = [{ upTo: 47, sec: 8 }, { upTo: 71, sec: 5 }, { upTo: 127, sec: 3 }];
  it('picks the tail by register and scales it', () => {
    expect(tailSeconds(30, schedule)).toBe(8);
    expect(tailSeconds(47, schedule)).toBe(8);
    expect(tailSeconds(48, schedule)).toBe(5);
    expect(tailSeconds(100, schedule, 0.5)).toBe(1.5);
  });
  it('looped files end at the loop, others at the tail limit', () => {
    expect(keptSeconds({ available: 10, loopEnd: 6, tail: 3 })).toEqual({ seconds: 6, truncated: false });
    expect(keptSeconds({ available: 10, tail: 3 })).toEqual({ seconds: 3, truncated: true });
    expect(keptSeconds({ available: 2, tail: 3 })).toEqual({ seconds: 2, truncated: false });
  });
  it('converts inclusive SFZ loop frames to seconds', () => {
    const l = loopSeconds({ loopMode: 'loop_continuous', loopStart: 44100, loopEnd: 88199, offset: 0 }, 44100);
    expect(l).toEqual({ start: 1, end: 2 });
    expect(loopSeconds({ loopMode: 'no_loop', loopStart: 1, loopEnd: 2, offset: 0 }, 44100)).toBeNull();
    expect(loopSeconds({ loopMode: 'loop_continuous', loopStart: 1100, loopEnd: 2199, offset: 100 }, 1000)).toEqual({ start: 1, end: 2.1 });
  });
  it('bakes the loop tail towards the material before the start', () => {
    const pcm = new Float32Array(100).fill(0);
    for (let i = 0; i < 40; i++) pcm[i] = 1;
    for (let i = 60; i < 100; i++) pcm[i] = -1;
    const n = bakeCrossfade(pcm, 40, 100, 10);
    expect(n).toBe(10);
    expect(pcm[99]).toBeGreaterThan(0.8);
    expect(pcm[90]).toBeLessThan(-0.8);
    expect(pcm[89]).toBe(-1);
    expect(pcm[40]).toBe(0);
  });
});

describe('bitrate', () => {
  it('takes the highest ladder entry that fits the budget', () => {
    expect(pickBitrate(1000, 20e6, [32, 64, 96, 128])).toBe(128);
    expect(pickBitrate(1000, 8e6, [32, 64, 96, 128])).toBe(64);
    expect(pickBitrate(1000, 1, [32, 64])).toBe(32);
  });
});
