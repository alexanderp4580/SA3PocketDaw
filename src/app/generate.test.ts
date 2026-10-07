import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { applyGeneration, shiftRoot,prepareGeneration,useGeneration,tweakDraft,InstrumentAnalysisError } from './generate';
import { createProjectStore } from '../store/projectStore';
import { addTrack, createProject } from '../store/projectModel';
import { createEngine } from '../audio/engine';
import { analyse } from '../audio/instrument/analysis';

function tone(hz: number, sec: number, rate = 44100): Float32Array {
  const n = Math.floor(sec * rate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = 0.5 * Math.sin((2 * Math.PI * hz * i) / rate);
  return out;
}

async function setup() {
  const store = createProjectStore({ idb: new IDBFactory(), setTimer: () => 0, clearTimer: () => {} });
  const engine = createEngine({ createContext: () => { throw new Error('no audio'); } });
  store.set(addTrack(createProject(), 'Lead', 't1'));
  return { store, engine };
}
const params = { model: 'small-music' as const, prompt: 'x', seconds: 2, steps: 8, seed: 1 };

describe('applyGeneration', () => {
  it('stores an instrument profile and preserves it through reload',async()=>{
    const deps=await setup();const out={channels:[tone(219,1)],sampleRate:44100,stats:{peak:.5,rms:.3,nonFinite:0,dims:[]},timings:[]};
    deps.store.update(p=>({...p,tracks:p.tracks.map(t=>({...t,instrumentControls:{behavior:'sustain',release:1}}))}));
    const r=await applyGeneration({...deps,analyseInstrument:async(pcm,sr,dynamics)=>analyse(pcm,sr,dynamics)},'t1',{...params,mode:'instrument'},'piano',out,()=> 'i1');
    expect(deps.store.get()!.tracks[0]!.instrumentControls).toBeUndefined();expect(r.mode).toBe('instrument');expect(deps.store.get()!.tracks[0]!.soundType).toBe('instrument');expect((await deps.store.getSample('i1'))!.instrument!.hz).toBeCloseTo(219,0);expect(deps.engine.hasSample('i1')).toBe(true);
    await deps.store.flush();await deps.store.load();expect((await deps.store.getSample('i1'))!.instrument!.dynamics).toBe('decay');
  });
  it('a rejected instrument leaves the previous track sound intact',async()=>{
    const deps=await setup();const out={channels:[tone(440,1)],sampleRate:44100,stats:{peak:.5,rms:.3,nonFinite:0,dims:[]},timings:[]};
    await applyGeneration(deps,'t1',params,'kick',out,()=> 'old');
    await expect(applyGeneration({...deps,analyseInstrument:async()=>{throw new Error('Not a single note');}},'t1',{...params,mode:'instrument'},'piano',out)).rejects.toThrow('single note');
    expect(deps.store.get()!.tracks[0]!.sampleId).toBe('old');
  });
  it('stores the sample, detects the root and updates the track', async () => {
    const deps = await setup();
    const out = { channels: [tone(440, 2)], sampleRate: 44100, stats: { peak: 0.5, rms: 0.3, nonFinite: 0, dims: [1, 1, 88200] }, timings: [] };
    const r = await applyGeneration(deps, 't1', params, 'synth lead', out, () => 's1');
    expect(r.rootMidi).toBe(69);
    expect(r.lowConfidence).toBe(false);
    const t = deps.store.get()!.tracks[0]!;
    expect(t.sampleId).toBe('s1');
    expect(t.rootMidi).toBe(69);
    expect((await deps.store.getSample('s1'))!.meta.prompt).toBe('synth lead');
    expect(deps.engine.hasSample('s1')).toBe(true);
  });
  it('rejects silence', async () => {
    const deps = await setup();
    const out = { channels: [new Float32Array(44100)], sampleRate: 44100, stats: { peak: 0, rms: 0, nonFinite: 0, dims: [] }, timings: [] };
    await expect(applyGeneration(deps, 't1', params, 'x', out)).rejects.toThrow(/silence/);
  });
  it('shifts the root by a semitone', async () => {
    const deps = await setup();
    shiftRoot(deps, 't1', 1);
    expect(deps.store.get()!.tracks[0]!.rootMidi).toBe(61);
  });
});

describe('two tracks, two generations', () => {
  it('each track keeps its own sample and playback buffer', async () => {
    const buffers: Array<{ id: number; data: Float32Array }> = [];
    const fakeCtx = {
      currentTime: 0, destination: {}, state: 'running',
      createBuffer: (_c: number, len: number) => { const b = { duration: 1, data: new Float32Array(len), copyToChannel(s: Float32Array) { this.data.set(s); } }; buffers.push(b as never); return b; },
      createGain: () => ({ gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {} }),
      createBufferSource: () => ({ buffer: null as unknown, playbackRate: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {} }, onended: null, connect() {}, start() {}, stop() {} }),
    };
    const store = createProjectStore({ idb: new IDBFactory(), setTimer: () => 0, clearTimer: () => {} });
    const engine = createEngine({ createContext: () => fakeCtx as never });
    store.set(addTrack(addTrack(createProject(), 'Lead', 't1'), 'Kick', 't2'));
    const deps = { store, engine };
    const mk = (hz: number) => ({ channels: [tone(hz, 1)], sampleRate: 44100, stats: { peak: 0.5, rms: 0.3, nonFinite: 0, dims: [] }, timings: [] });
    const a = await applyGeneration(deps, 't1', params, 'synth', mk(440));
    const b = await applyGeneration(deps, 't2', params, 'kick', mk(110));
    const [t1, t2] = store.get()!.tracks;
    expect(t1!.sampleId).toBe(a.sampleId);
    expect(t2!.sampleId).toBe(b.sampleId);
    expect(a.sampleId).not.toBe(b.sampleId);
    expect(t1!.rootMidi).toBe(69);
    expect(t2!.rootMidi).toBe(45);
    expect((await store.getSample(a.sampleId))!.meta.prompt).toBe('synth');
    expect((await store.getSample(b.sampleId))!.meta.prompt).toBe('kick');
    await engine.audition('t1', 69);
    await engine.audition('t2', 45);
    expect(buffers.length).toBe(2);
    expect(buffers[0]!.data).not.toEqual(buffers[1]!.data);
  });
});

it('previews a generated draft without replacing the track until Use',async()=>{
 const deps=await setup(),out={channels:[tone(440,1)],sampleRate:44100,stats:{peak:.5,rms:.3,nonFinite:0,dims:[]},timings:[]};
 await applyGeneration(deps,'t1',params,'old',out,()=> 'old');
 const draft=await prepareGeneration(params,'new',out);expect(deps.store.get()!.tracks[0]!.sampleId).toBe('old');expect(await deps.store.listSampleIds()).toEqual(['old']);
 await useGeneration(deps,'t1',draft,()=> 'new');expect(deps.store.get()!.tracks[0]!.sampleId).toBe('new');expect((await deps.store.getSample('new'))!.meta.prompt).toBe('new');
});

it('creates a new track only when a draft is accepted',async()=>{
 const deps=await setup();deps.store.set(createProject());const out={channels:[tone(440,1)],sampleRate:44100,stats:{peak:.5,rms:.3,nonFinite:0,dims:[]},timings:[]};
 const draft=await prepareGeneration(params,'new',out);expect(deps.store.get()!.tracks).toHaveLength(0);
 const used=await useGeneration(deps,null,draft,()=> 'new-sound');const track=deps.store.get()!.tracks[0]!;expect(track.sampleId).toBe('new-sound');expect(used.trackId).toBe(track.id);expect(track.notes).toEqual([]);
});

it('keeps draft tweaks separate until Use and persists the accepted instrument controls',async()=>{
 const deps=await setup(),out={channels:[tone(220,1)],sampleRate:44100,stats:{peak:.5,rms:.3,nonFinite:0,dims:[]},timings:[]};
 await applyGeneration(deps,'t1',params,'old sample',out,()=> 'old');deps.store.update(p=>({...p,tracks:p.tracks.map(t=>({...t,instrumentControls:{brightness:.8}}))}));
 const draft=await prepareGeneration({...params,mode:'instrument'},'piano',out,{analyseInstrument:async(pcm,sr,dynamics)=>analyse(pcm,sr,dynamics)});
 const edited=tweakDraft(draft,{brightness:.35,attack:.2,release:.6,behavior:'sustain'});
 expect(draft.instrumentControls).toBeUndefined();expect(deps.store.get()!.tracks[0]!.sampleId).toBe('old');expect(deps.store.get()!.tracks[0]!.instrumentControls?.brightness).toBe(.8);
 await useGeneration(deps,'t1',edited,()=> 'edited');await deps.store.flush();await deps.store.load();expect(deps.store.get()!.tracks[0]!.instrumentControls).toEqual({brightness:.35,attack:.2,release:.6,behavior:'sustain'});
 const next=await prepareGeneration({...params,mode:'instrument'},'piano',out,{analyseInstrument:async(pcm,sr,dynamics)=>analyse(pcm,sr,dynamics)});expect(next.instrumentControls).toBeUndefined();
});

describe('instrument rejection after a successful generation', () => {
  function noise(sec: number, rate = 44100): Float32Array {
    let s = 12345;
    return Float32Array.from({ length: Math.floor(sec * rate) }, () => { s = (s * 1664525 + 1013904223) >>> 0; return 0.5 * (s / 0x80000000 - 1); });
  }
  it('reports the analysis failure as a typed error while the same audio still works as a sample', async () => {
    const deps = await setup();
    const out = { channels: [noise(1)], sampleRate: 44100, stats: { peak: .5, rms: .3, nonFinite: 0, dims: [] }, timings: [] };
    const err = await prepareGeneration({ ...params, mode: 'instrument' }, 'pad', out, { analyseInstrument: async (pcm, sr, dyn) => analyse(pcm, sr, dyn) }).catch((e) => e);
    expect(err).toBeInstanceOf(InstrumentAnalysisError);
    expect((err as InstrumentAnalysisError).code).toBe('instrument-rejected');
    const draft = await prepareGeneration({ ...params, mode: 'sample' }, 'pad', out);
    const used = await useGeneration(deps, 't1', draft, () => 's1');
    expect(used.mode).toBe('sample');
    expect(deps.store.get()!.tracks[0]!.sampleId).toBe('s1');
  });
  it('keeps the cancelled code when the analysis is cancelled', async () => {
    const out = { channels: [tone(220, 1)], sampleRate: 44100, stats: { peak: .5, rms: .3, nonFinite: 0, dims: [] }, timings: [] };
    const err = await prepareGeneration({ ...params, mode: 'instrument' }, 'pad', out, { analyseInstrument: async () => { throw Object.assign(new Error('Cancelled'), { code: 'cancelled' }); } }).catch((e) => e);
    expect((err as { code?: string }).code).toBe('cancelled');
  });
});
