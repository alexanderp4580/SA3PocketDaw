import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS module
import { planBudget, selectRegions } from './build.mjs';

const attack = (lovel: number, hivel: number, c: number) => ({ sample: `s${lovel}_${c}`, trigger: 'attack', lovel, hivel, lokey: c - 1, hikey: c + 1, pitchKeycenter: c });
const release = (key: number) => ({ sample: `r${key}`, trigger: 'release', lovel: 0, hivel: 127, lokey: key, hikey: key, pitchKeycenter: key });

describe('selectRegions', () => {
  const layers: Array<[number, number]> = [[1, 40], [41, 80], [81, 127]];
  const parsed = { regions: [...layers.flatMap(([a, b]) => [30, 33, 36, 39].map((c) => attack(a, b, c))), release(30), release(33)] };

  it('keeps the requested layers with contiguous velocity ranges and all release regions', () => {
    const r = selectRegions(parsed, { layers: 2 });
    expect(r.layers).toBe(2);
    const att = r.regions.filter((x: any) => x.trigger === 'attack');
    expect(att).toHaveLength(8);
    const ranges = [...new Set(att.map((x: any) => `${x.lovel}-${x.hivel}`))].sort();
    expect(ranges).toHaveLength(2);
    expect(r.regions.filter((x: any) => x.trigger === 'release')).toHaveLength(2);
  });

  it('thins the keys of every layer and drops release regions', () => {
    const r = selectRegions(parsed, { layers: 1, keyStep: 2 });
    expect(r.regions.every((x: any) => x.trigger === 'attack')).toBe(true);
    expect(r.regions.map((x: any) => x.pitchKeycenter)).toEqual([30, 36, 39]);
  });

  it('leaves out excluded samples', () => {
    const r = selectRegions({ regions: [attack(1, 127, 40), { ...release(40), sample: 'harmLA0' }] }, { layers: 9, excludeSample: /harm/ });
    expect(r.regions).toHaveLength(1);
  });
});

describe('planBudget', () => {
  const file = (channels: number, seconds: number, center = 60) => ({ info: { rate: 44100, channels, seconds }, offset: 0, end: undefined, centers: [center], loopEnd: null, regions: [{ trigger: 'attack' }] });
  const cfg = { tails: [{ upTo: 127, sec: 10 }] };

  it('keeps stereo when it fits, otherwise falls back to mono', () => {
    const files = [file(2, 5), file(2, 5)];
    expect(planBudget(files, cfg, 'auto', 10 * 44100 * 2 * 4).channels).toBe(2);
    expect(planBudget(files, cfg, 'auto', 10 * 44100 * 4).channels).toBe(1);
    expect(planBudget(files, cfg, 'mono', 1e9).channels).toBe(1);
  });

  it('shortens the tails until the decoded size fits', () => {
    const files = [file(1, 20), file(1, 20)];
    const plan = planBudget(files, cfg, 'mono', 12 * 44100 * 4);
    expect(plan.scale).toBeLessThan(1);
    expect(plan.bytes).toBeLessThanOrEqual(12 * 44100 * 4);
    expect(plan.bytes).toBeGreaterThan(10 * 44100 * 4);
  });

  it('fails when even the shortest tails do not fit', () => {
    expect(() => planBudget([file(1, 20)], cfg, 'mono', 1000)).toThrow(/budget/);
  });

  it('a looped file keeps its loop plus the pad regardless of the tail', () => {
    const looped = { ...file(1, 20), loopEnd: 15 };
    const plan = planBudget([looped], cfg, 'mono', 1e9);
    expect(plan.bytes).toBe((Math.round(15 * 44100) + 4096) * 4);
  });
});

it('preserves per-key velocity coverage when a mapping mixes full-range and layered notes', () => {
 const parsed = { regions: [attack(0, 62, 60), attack(63, 127, 60), attack(0, 127, 72)] };
 const r = selectRegions(parsed, { layers: 99 });
 for (const key of [60, 72]) for (let velocity = 1; velocity <= 127; velocity++) {
  expect(r.regions.some((x: any) => key >= x.lokey && key <= x.hikey && velocity >= x.lovel && velocity <= x.hivel)).toBe(true);
 }
});

it('keeps soft finger-bass notes audible with its uneven source velocity ranges', async () => {
 const { PACKS } = await import('./packs.mjs');
 const ranges: Array<[number, number]> = [[1,25],[26,50],[51,75],[76,100],[101,127]];
 const parsed = { regions: [
  ...ranges.map(([a,b]) => attack(a,b,36)),
  ...ranges.map(([a,b],i) => attack(i === 1 ? 25 : a,b,54)),
 ] };
 const r = selectRegions(parsed, PACKS['bass-finger']);
 for (const key of [36,54]) for(let velocity=1;velocity<=127;velocity++) {
  expect(r.regions.some((x: any) => key>=x.lokey && key<=x.hikey && velocity>=x.lovel && velocity<=x.hivel)).toBe(true);
 }
});
