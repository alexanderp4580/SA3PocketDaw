import { describe, expect, it } from 'vitest';
import { createEngine, type EngineContextLike } from './engine';
import { FakeNode, FakePresetContext } from './preset/fakes';
import type { PresetHost } from './preset/host';
import { normalizePreset, type Preset } from './sfz/format';
import { applyPreset } from '../app/presets';
import { previewProject } from '../melody/preview';
import { addNote, addTrack, createProject, setTrackPreset, setTrackSample, toggleMute } from '../store/projectModel';

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

it('prepares slow uncached drum samples before scheduling the short preview notes', async () => {
 class SlowCtx extends Ctx {
  override async decodeAudioData(data: ArrayBuffer) {
   this.currentTime += .5;
   return super.decodeAudioData(data);
  }
 }
 const ctx = new SlowCtx();
 const p = { ...presetOf('drums'), category: 'drums' };
 const h: PresetHost = { load: async () => p, read: async () => new ArrayBuffer(4), invalidate() {} };
 const e = createEngine({ createContext: () => ctx as unknown as EngineContextLike, presets: h });
 expect(await e.previewPreset('drums')).toBe(true);
 expect(ctx.sources).toHaveLength(8);
 expect(ctx.sources[0]!.started).toBeGreaterThanOrEqual(.5);
});


describe('mixed playback while adding sampled instruments', () => {
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('keeps an existing raw drum sample audible after adding and refreshing an SFZ track', async () => {
    const t = setup(['grand', 'bass']);
    let p = project();
    p = setTrackSample(addTrack(p, 'Drum sample', 'drum'), 'drum', 'hit', 60, 'sample');
    p = addNote(p, 'drum', { midi: 60, start: 0, length: 1 });
    t.engine.setProject(p);
    t.engine.setSample('hit', new Float32Array(4410), 44100);
    await t.engine.play();
    await settle();
    const rawBuffer = t.ctx.sources.find((s) => s.buffer?.duration === .1)!.buffer;
    expect(t.ctx.sources).toHaveLength(2);
    t.engine.stop();

    p = applyPreset(p, null, { id: 'bass', name: 'Bass' }, () => 'bass-track').project;
    p = addNote(p, 'bass-track', { midi: 72, start: 0, length: 4 });
    t.engine.setProject(p);
    t.engine.refreshPresets();
    const count = t.ctx.sources.length;
    await t.engine.play();
    await settle();
    expect(t.ctx.sources.slice(count)).toHaveLength(3);
    expect(t.ctx.sources.slice(count).some((s) => s.buffer === rawBuffer)).toBe(true);
    expect(t.inst.reads).toContain('bass/b.m4a');
    t.engine.stop();
  });

  it('restores two SFZ tracks after a generated-bars preview and preset refresh', async () => {
    const t = setup(['grand', 'bass']);
    let p = applyPreset(project(), null, { id: 'bass', name: 'Bass' }, () => 'bass-track').project;
    p = addNote(p, 'bass-track', { midi: 72, start: 0, length: 4 });
    t.engine.setProject(p);
    await t.engine.play();
    await settle();
    expect(t.ctx.sources).toHaveLength(2);
    t.engine.stop();

    t.engine.setProject(previewProject(p, p.tracks[1]!, p.tracks[1]!.notes, 1, 1));
    await t.engine.play();
    await settle();
    expect(t.ctx.sources).toHaveLength(3);
    t.engine.stop();
    t.engine.setProject(p);
    t.engine.refreshPresets();
    await t.engine.play();
    await settle();
    expect(t.ctx.sources).toHaveLength(5);
    expect(t.inst.reads.filter((path) => path === 'grand/b.m4a')).toHaveLength(2);
    expect(t.inst.reads.filter((path) => path === 'bass/b.m4a')).toHaveLength(2);
    t.engine.stop();
  });
});

it('reports current playback sources and track state without copying project names or note contents', async () => {
 const t=setup(['grand']);
 let p=project();
 p=setTrackSample(addTrack(p,'Private drum name','drum'),'drum','hit',60,'sample');
 p=addNote(p,'drum',{midi:36,start:0,length:2});
 p={...p,name:'Private song name',tracks:p.tracks.map(track=>track.id==='drum'?{...track,solo:true}:track)};
 t.engine.setProject(p);
 const unloaded=t.engine.diagnostics();
 expect(unloaded).toMatchObject({audioState:'not-created',playing:false,mode:'pattern'});
 expect(unloaded.tracks.find(track=>track.id==='drum')).toMatchObject({source:'missing-sample',solo:true,muted:false,noteCount:1,midiMin:36,midiMax:36});
 t.engine.setSample('hit',new Float32Array(4410),44100);
 await t.engine.audition('t1',60);
 const loaded=t.engine.diagnostics();
 expect(loaded.audioState).toBe('running');
 expect(loaded.tracks.find(track=>track.id==='drum')?.source).toBe('cached-sample');
 expect(loaded.tracks.find(track=>track.id==='t1')).toMatchObject({source:'preset-player',presetId:'grand'});
 expect(JSON.stringify(loaded)).not.toMatch(/Private|"start"|"length"/);
});
