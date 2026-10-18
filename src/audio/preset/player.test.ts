import { describe, expect, it } from 'vitest';
import type { Preset, PresetRegion } from '../sfz/format';
import type { BufferLike } from '../sampler';
import { createSampleCache } from './cache';
import { FakePresetContext } from './fakes';
import { cacheKey, createPresetPlayer, toVelocity } from './player';

const region = (over: Partial<PresetRegion>): PresetRegion => ({ file: 0, lokey: 0, hikey: 127, center: 60, lovel: 1, hivel: 127, veltrack: 0, ...over });
function preset(regions: PresetRegion[], files = 4): Preset {
  return { version: 1, id: 'p', name: 'P', sampleRate: 44100, credits: [], license: '', files: Array.from({ length: files }, (_, i) => ({ path: `s${i}.m4a`, frames: 44100, channels: 1 as const })), regions };
}
function setup(p: Preset, opts: { maxVoices?: number; failing?: Set<string> } = {}) {
  const ctx = new FakePresetContext();
  const loads: string[] = [];
  let gate: Promise<void> = Promise.resolve();
  const cache = createSampleCache<BufferLike>({
    budgetBytes: 1e9,
    load: async (key) => { loads.push(key); await gate; if (opts.failing?.has(key)) throw new Error('decode failed'); return { duration: 1 }; },
    bytesOf: () => 100,
  });
  const retained: Set<string>[] = [];
  const player = createPresetPlayer({ ctx, output: 'out', preset: p, cache, maxVoices: opts.maxVoices, onRetain: (k) => retained.push(k) });
  return { ctx, loads, cache, player, retained, hold: (g: Promise<void>) => (gate = g) };
}

describe('toVelocity', () => {
  it('maps gain 0..1 to velocity 1..127', () => {
    expect([toVelocity(0), toVelocity(1), toVelocity(96 / 127)]).toEqual([1, 127, 96]);
  });
});

describe('preset player', () => {
  const layered = preset([region({ file: 0, lovel: 1, hivel: 63 }), region({ file: 1, lovel: 64, hivel: 127 })]);

  it('plays the layer for the velocity at the requested time', async () => {
    const t = setup(layered);
    await t.player.prepare([{ midi: 60, velocity: 1 }]);
    await t.player.note(60, 2, 1, 100 / 127);
    expect(t.ctx.sources).toHaveLength(1);
    expect(t.ctx.sources[0]!.started).toBe(2);
    expect(t.loads).toEqual([cacheKey('p', 's1.m4a')]);
    await t.player.note(60, 3, 1, 10 / 127);
    expect(t.loads).toEqual([cacheKey('p', 's1.m4a'), cacheKey('p', 's0.m4a')]);
    expect(t.ctx.sources).toHaveLength(2);
  });

  it('decodes only what a note needs', async () => {
    const t = setup(layered);
    await t.player.note(60, 0, 1, 1);
    expect(t.loads).toEqual([cacheKey('p', 's1.m4a')]);
  });

  it('a sample that is not decoded yet starts late and keeps the note end', async () => {
    const t = setup(layered);
    let release!: () => void;
    t.hold(new Promise<void>((r) => (release = r)));
    const done = t.player.note(60, 1, 2, 1);
    t.ctx.currentTime = 1.5;
    release();
    await done;
    expect(t.ctx.sources[0]!.started).toBe(1.5);
    expect(t.ctx.sources[0]!.stopped).toBeCloseTo(3 + 0.05);
  });

  it('skips a late note that has almost ended', async () => {
    const t = setup(layered);
    let release!: () => void;
    t.hold(new Promise<void>((r) => (release = r)));
    const done = t.player.note(60, 1, 1, 1);
    t.ctx.currentTime = 1.99;
    release();
    await done;
    expect(t.ctx.sources).toHaveLength(0);
  });

  it('is silent and does not throw when a sample cannot be decoded', async () => {
    const t = setup(layered, { failing: new Set([cacheKey('p', 's1.m4a')]) });
    await expect(t.player.note(60, 0, 1, 1)).resolves.toBeUndefined();
    expect(t.ctx.sources).toHaveLength(0);
  });

  it('plays release-trigger regions when the key is released', async () => {
    const p = preset([region({ file: 0 }), region({ file: 1, trigger: 'release', keytrack: 0, rtDecay: 6.0206 })]);
    const t = setup(p);
    await t.player.note(60, 2, 1, 1);
    expect(t.ctx.sources).toHaveLength(2);
    const rel = t.ctx.sources[1]!;
    expect(rel.started).toBe(3);
    expect(rel.playbackRate.value).toBe(1);
    expect(t.ctx.gains[1]!.gain.events[0]!.value).toBeCloseTo(0.5, 2);
  });

  it('steals the oldest voice beyond the cap with a short fade', async () => {
    const t = setup(preset([region({})]), { maxVoices: 2 });
    for (let i = 0; i < 3; i++) { t.ctx.currentTime = i * 0.1; await t.player.note(60 + i, t.ctx.currentTime, 5, 1); }
    expect(t.player.voiceCount).toBe(2);
    expect(t.ctx.sources[0]!.stopped).toBeCloseTo(0.2 + 0.03);
    expect(t.ctx.sources[1]!.stopped).toBeGreaterThan(5);
  });

  it('stop fades every voice and empties the player', async () => {
    const t = setup(preset([region({})]));
    await t.player.note(60, 0, 5, 1);
    await t.player.note(64, 0, 5, 1);
    t.ctx.currentTime = 1;
    t.player.stop(true);
    expect(t.ctx.sources.map((s) => s.stopped)).toEqual([1.005, 1.005]);
    expect(t.player.voiceCount).toBe(0);
  });

  it('tells which files the notes keep decoded', () => {
    const t = setup(layered);
    t.player.retain([{ midi: 60, velocity: 1 }, { midi: 62, velocity: 10 / 127 }]);
    expect([...t.retained[0]!].sort()).toEqual([cacheKey('p', 's0.m4a'), cacheKey('p', 's1.m4a')]);
  });

  it('a disposed player plays nothing', async () => {
    const t = setup(layered);
    t.player.dispose();
    await t.player.note(60, 0, 1, 1);
    expect(t.ctx.sources).toHaveLength(0);
  });
});

 it('stop cancels notes waiting for a decode and fresh notes still play', async () => {
 const t=setup(preset([region({})]));let release!:()=>void;
 t.hold(new Promise<void>(r=>release=r));
 const pending=t.player.note(60,0,2,1);t.player.stop(true);release();await pending;
 expect(t.ctx.sources).toHaveLength(0);
 await t.player.note(64,0,2,1);expect(t.ctx.sources).toHaveLength(1);
 });
