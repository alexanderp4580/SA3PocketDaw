import { describe, expect, it } from 'vitest';
import { createEngine, type EngineContextLike } from './engine';
import { FakeNode, FakePresetContext } from './preset/fakes';
import type { PresetHost } from './preset/host';
import { normalizePreset, type Preset } from './sfz/format';
import { addNote, addTrack, createProject, setTrackPreset, toggleMute } from '../store/projectModel';

class Ctx extends FakePresetContext {
  override destination = new FakeNode();
  state = 'suspended';
  async resume() { this.state = 'running'; }
  createBuffer(ch: number, len: number, sr: number) { return { duration: len / sr, length: len, numberOfChannels: ch, copyToChannel() {} }; }
  async decodeAudioData(_d: ArrayBuffer) { return { duration: 4, length: 4 * 44100, numberOfChannels: 1 }; }
}

const presetOf = (id: string): Preset => normalizePreset({
  version: 1, id, name: id, sampleRate: 44100, credits: [], license: '',
  files: [{ path: 'a.m4a', frames: 1000, channels: 1 }, { path: 'b.m4a', frames: 1000, channels: 1 }],
  regions: [{ file: 0, lokey: 0, hikey: 63, center: 48, lovel: 1, hivel: 127, veltrack: 0 }, { file: 1, lokey: 64, hikey: 127, center: 72, lovel: 1, hivel: 127, veltrack: 0 }],
});

function host(installed: Set<string>) {
  const reads: string[] = [];
  const h: PresetHost = {
    load: async (id) => (installed.has(id) ? presetOf(id) : null),
    read: async (id, path) => { reads.push(`${id}/${path}`); return new ArrayBuffer(4); },
    invalidate: () => {},
  };
  return { h, reads };
}

function setup(installed: string[]) {
  const ctx = new Ctx();
  const timers: Array<() => void> = [];
  const inst = host(new Set(installed));
  const engine = createEngine({ createContext: () => ctx as unknown as EngineContextLike, setTimer: (fn) => { timers.push(fn); return timers.length; }, clearTimer: () => timers.splice(0), presets: inst.h, presetBudgetBytes: 1e9 });
  return { ctx, engine, timers, inst };
}

function project(presetId = 'grand') {
  let p = createProject({ bars: 1, bpm: 120 });
  p = addTrack(p, 'Keys', 't1');
  p = setTrackPreset(p, 't1', presetId);
  p = addNote(p, 't1', { midi: 72, start: 0, length: 4 });
  p = addNote(p, 't1', { midi: 50, start: 8, length: 4 });
  return p;
}

describe('engine with sampled-instrument presets', () => {
  it('decodes the files the pattern needs before playing and plays notes at the region rate', async () => {
    const t = setup(['grand']);
    t.engine.setProject(project());
    await t.engine.play();
    expect(t.inst.reads.sort()).toEqual(['grand/a.m4a', 'grand/b.m4a']);
    await new Promise((r) => setTimeout(r, 0));
    expect(t.ctx.sources).toHaveLength(1);
    expect(t.ctx.sources[0]!.playbackRate.value).toBeCloseTo(1);
    t.ctx.currentTime = 1.1;
    t.timers.splice(0).forEach((fn) => fn());
    await new Promise((r) => setTimeout(r, 0));
    expect(t.ctx.sources).toHaveLength(2);
    expect(t.ctx.sources[1]!.playbackRate.value).toBeCloseTo(2 ** (2 / 12));
    expect(t.inst.reads).toHaveLength(2);
  });

  it('is silent and error-free for a preset that is not installed', async () => {
    const t = setup([]);
    t.engine.setProject(project());
    await t.engine.play();
    await new Promise((r) => setTimeout(r, 0));
    expect(t.engine.isPlaying).toBe(true);
    expect(t.ctx.sources).toHaveLength(0);
    t.engine.stop();
  });

  it('refreshPresets makes a preset that was installed afterwards audible', async () => {
    const ctx = new Ctx();
    const installed = new Set<string>();
    const h: PresetHost = { load: async (id) => (installed.has(id) ? presetOf(id) : null), read: async () => new ArrayBuffer(4), invalidate: () => {} };
    const e = createEngine({ createContext: () => ctx as unknown as EngineContextLike, presets: h, presetBudgetBytes: 1e9 });
    e.setProject(project());
    await e.audition('t1', 72);
    expect(ctx.sources).toHaveLength(0);
    installed.add('grand');
    e.refreshPresets();
    await e.audition('t1', 72);
    expect(ctx.sources).toHaveLength(1);
  });

  it('auditions a key with the preset', async () => {
    const t = setup(['grand']);
    t.engine.setProject(project());
    await t.engine.audition('t1', 50, 1);
    expect(t.ctx.sources).toHaveLength(1);
    expect(t.ctx.sources[0]!.playbackRate.value).toBeCloseTo(2 ** (2 / 12));
  });

  it('switching the preset of a track uses the new preset', async () => {
    const t = setup(['grand', 'upright']);
    t.engine.setProject(project('grand'));
    await t.engine.audition('t1', 72);
    t.engine.setProject(project('upright'));
    await t.engine.audition('t1', 72);
    expect(t.inst.reads).toEqual(['grand/b.m4a', 'upright/b.m4a']);
  });

  it('setPreset prepares the player and reports whether the preset is installed', async () => {
    const t = setup(['grand']);
    t.engine.setProject(project('grand'));
    expect(await t.engine.setPreset('t1', 'grand')).toBe(true);
    expect(await t.engine.setPreset('t1', 'gone')).toBe(false);
    expect(await t.engine.setPreset('nope', 'grand')).toBe(false);
  });

  it('stop silences sounding preset voices', async () => {
    const t = setup(['grand']);
    t.engine.setProject(project());
    await t.engine.audition('t1', 72, 1, 5);
    t.ctx.currentTime = 0.5;
    t.engine.stop();
    await new Promise((r) => setTimeout(r, 0));
    expect(t.ctx.sources[0]!.stopped).toBeCloseTo(0.505);
  });

  it('a muted preset track plays nothing', async () => {
    const t = setup(['grand']);
    t.engine.setProject(toggleMute(project(), 't1'));
    await t.engine.play();
    await new Promise((r) => setTimeout(r, 0));
    expect(t.ctx.sources).toHaveLength(0);
  });

  it('previews a preset chord and reports a missing preset', async () => {
    const t = setup(['grand']);
    expect(await t.engine.previewPreset('grand', [60, 72])).toBe(true);
    expect(t.ctx.sources).toHaveLength(2);
    expect(await t.engine.previewPreset('nope')).toBe(false);
  });

  it('works without a preset host', async () => {
    const ctx = new Ctx();
    const e = createEngine({ createContext: () => ctx as unknown as EngineContextLike });
    e.setProject(project());
    await e.audition('t1', 72);
    await e.play();
    expect(ctx.sources).toHaveLength(0);
  });
});
