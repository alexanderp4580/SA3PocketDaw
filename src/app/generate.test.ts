import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { applyGeneration, loopNotice, shiftRoot,prepareGeneration,useGeneration,tweakDraft,tweakSampleDraft,trimDraft,mergeTrimmed,InstrumentAnalysisError } from './generate';
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

describe('cloud generations', () => {
  const out = { channels: [tone(440, 2)], sampleRate: 44100, stats: { peak: 0.5, rms: 0.3, nonFinite: 0, dims: [1, 1, 88200] }, timings: [] };
  it('records the cloud source and model in the sample meta', async () => {
    const deps = await setup();
    await applyGeneration({ ...deps, cloud: true }, 't1', params, 'synth lead', out, () => 'c1');
    const meta = (await deps.store.getSample('c1'))!.meta;
    expect(meta.source).toBe('cloud');
    expect(meta.model).toBe('stable-audio-3');
  });
  it('leaves on-device samples without a source', async () => {
    const deps = await setup();
    await applyGeneration(deps, 't1', params, 'synth lead', out, () => 'd1');
    const meta = (await deps.store.getSample('d1'))!.meta;
    expect(meta.source).toBeUndefined();
    expect(meta.model).toBe('small-music');
  });
});

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

it('keeps sample envelope edits in the draft until Use and persists them through reload',async()=>{
 const deps=await setup();const out={channels:[tone(440,1)],sampleRate:44100,stats:{peak:.5,rms:.3,nonFinite:0,dims:[]},timings:[]};
 await applyGeneration(deps,'t1',params,'old',out,()=> 'old');
 const draft=await prepareGeneration(params,'sample',out);const edited=tweakSampleDraft(draft,{attack:.25,release:.7,brightness:.4});
 expect(draft.sampleControls).toBeUndefined();expect(deps.store.get()!.tracks[0]!.sampleControls).toBeUndefined();
 await useGeneration(deps,'t1',edited,()=> 'sample');await deps.store.flush();await deps.store.load();expect(deps.store.get()!.tracks[0]!.sampleControls).toEqual({attack:.25,release:.7,brightness:.4});
 await applyGeneration(deps,'t1',params,'replacement',out,()=> 'next');expect(deps.store.get()!.tracks[0]!.sampleControls).toBeUndefined();
});

it('keeps a sample trim in the draft until Use and persists it',async()=>{
 const deps=await setup();const out={channels:[tone(440,1)],sampleRate:44100,stats:{peak:.5,rms:.3,nonFinite:0,dims:[]},timings:[]};
 const draft=await prepareGeneration(params,'sample',out);const dur=draft.pcm.length/draft.sampleRate;
 const cut=await trimDraft(draft,{start:.1,end:dur-.1});
 expect(cut.trim).toEqual({start:.1,end:dur-.1});expect(cut.pcm).toBe(draft.pcm);expect(deps.store.get()!.tracks[0]!.trim).toBeUndefined();
 await useGeneration(deps,'t1',cut,()=> 's1');await deps.store.flush();await deps.store.load();
 expect(deps.store.get()!.tracks[0]!.trim).toEqual({start:.1,end:dur-.1});
 expect((await deps.store.getSample('s1'))!.pcm.length).toBe(draft.pcm.length);
 expect((await trimDraft(cut,{start:0,end:dur})).trim).toBeUndefined();
 await applyGeneration(deps,'t1',params,'replacement',out,()=> 'next');expect(deps.store.get()!.tracks[0]!.trim).toBeUndefined();
});
it('re-analyses an instrument draft from the cut source on Use',async()=>{
 const deps=await setup();const out={channels:[tone(220,2)],sampleRate:44100,stats:{peak:.5,rms:.3,nonFinite:0,dims:[]},timings:[]};
 const draft=await prepareGeneration({...params,mode:'instrument'},'pad',out,{analyseInstrument:async(pcm,sr,dyn)=>analyse(pcm,sr,dyn)});
 const lengths:number[]=[];
 const cut=await trimDraft(draft,{start:.5,end:1.5},{analyseInstrument:async(pcm,sr,dyn)=>{lengths.push(pcm.length);return analyse(pcm,sr,dyn);}});
 expect(lengths).toEqual([44100]);expect(cut.pcm).toBe(draft.pcm);expect(cut.record.instrument).not.toBe(draft.record.instrument);
 await useGeneration(deps,'t1',cut,()=> 'i1');
 expect(deps.store.get()!.tracks[0]!.trim).toEqual({start:.5,end:1.5});
 expect((await deps.store.getSample('i1'))!.instrument!.pcm.length).toBeLessThanOrEqual(44100);
});

it('merges a finished chop into the current draft and keeps edits made meanwhile',async()=>{
 const out={channels:[tone(220,2)],sampleRate:44100,stats:{peak:.5,rms:.3,nonFinite:0,dims:[]},timings:[]};
 const base=await prepareGeneration({...params,mode:'instrument'},'pad',out,{analyseInstrument:async(pcm,sr,dyn)=>analyse(pcm,sr,dyn)});
 const finished=await trimDraft(base,{start:.5,end:1.5},{analyseInstrument:async(pcm,sr,dyn)=>analyse(pcm,sr,dyn)});
 const edited=tweakDraft({...base,rootMidi:base.rootMidi+2},{release:1.5});
 const merged=mergeTrimmed(edited,base,finished)!;
 expect(merged.trim).toEqual({start:.5,end:1.5});expect(merged.record.instrument).toBe(finished.record.instrument);
 expect(merged.rootMidi).toBe(base.rootMidi+2);expect(merged.instrumentControls).toEqual(edited.instrumentControls);
 const other=await prepareGeneration({...params,mode:'instrument'},'pad',{...out,channels:[tone(330,2)]},{analyseInstrument:async(pcm,sr,dyn)=>analyse(pcm,sr,dyn)});
 expect(mergeTrimmed(other,base,finished)).toBeNull();
 expect(mergeTrimmed(null,base,finished)).toBeNull();
 const full=await trimDraft(finished,{start:0,end:2},{analyseInstrument:async(pcm,sr,dyn)=>analyse(pcm,sr,dyn)});
 expect(mergeTrimmed(finished,finished,full)!.trim).toBeUndefined();
});

describe('looped generation', () => {
  const SR = 44100;
  const harmonic = (hz: number, sec: number) => {
    const n = Math.round(sec * SR), o = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      let v = 0;
      for (let h = 1; h <= 5; h++) v += Math.sin(2 * Math.PI * hz * h * t) / h;
      o[i] = 0.4 * (1 + 2 * Math.exp(-t / 0.05)) * v;
    }
    return o;
  };
  const noise = (sec: number) => { let s = 5; return Float32Array.from({ length: Math.round(sec * SR) }, () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 0xffffffff) * 2 - 1); };
  const outOf = (pcm: Float32Array) => ({ channels: [pcm], sampleRate: SR, stats: { peak: 0.5, rms: 0.3, nonFinite: 0, dims: [] }, timings: [] });
  const loopParams = { ...params, mode: 'loop' as const, seconds: 4, steps: 16 };

  it('finds, bakes and stores a loop, keeping the tail until after the loop', async () => {
    const draft = await prepareGeneration(loopParams, 'warm pad', outOf(harmonic(220, 4)));
    expect(draft.mode).toBe('loop');
    expect(draft.noLoop).toBeFalsy();
    expect(draft.record.meta.mode).toBe('loop');
    const loop = draft.record.loop!;
    expect(loop.start).toBeGreaterThanOrEqual(0.15);
    expect(loop.end).toBeGreaterThan(loop.start);
    expect(draft.rootMidi).toBe(57);
    const pcm = draft.pcm;
    const e = Math.round(loop.end * SR);
    // Audio up to the end of the loop is not faded; the closing fade-out is applied after baking.
    expect(Math.abs(pcm[e - 1]!)).toBeGreaterThan(0.01);
    expect(Math.abs(pcm[pcm.length - 1]!)).toBeLessThan(0.01);
    const s = Math.round(loop.start * SR);
    expect(Math.abs(pcm[e - 1]! - pcm[s]!)).toBeLessThan(0.1);
  });

  it('falls back to a one-shot sample, with the closing fade, when no clean loop exists', async () => {
    const draft = await prepareGeneration(loopParams, 'noisy', outOf(noise(3)));
    expect(draft.mode).toBe('sample');
    expect(draft.noLoop).toBe(true);
    expect(draft.record.loop).toBeUndefined();
    expect(draft.record.meta.mode).toBe('loop');
    expect(Math.abs(draft.pcm[draft.pcm.length - 1]!)).toBeLessThan(0.01);
  });

  it('does not search for loops in the other modes', async () => {
    const draft = await prepareGeneration({ ...params, mode: 'sample' }, 'x', outOf(harmonic(220, 3)));
    expect(draft.record.loop).toBeUndefined();
    expect(draft.noLoop).toBeFalsy();
    expect(draft.mode).toBe('sample');
  });

  it('stores the loop with the sample and tags the track as Looped; a one-shot fallback stays a sample', async () => {
    const deps = await setup();
    const draft = await prepareGeneration(loopParams, 'warm pad', outOf(harmonic(220, 4)));
    await useGeneration(deps, 't1', draft, () => 'l1');
    expect(deps.store.get()!.tracks[0]!.soundType).toBe('loop');
    await deps.store.flush();
    const saved = (await deps.store.getSample('l1'))!;
    expect(saved.loop).toEqual(draft.record.loop);
    expect(saved.meta.mode).toBe('loop');
    const fallback = await prepareGeneration(loopParams, 'noisy', outOf(noise(3)));
    await useGeneration(deps, 't1', fallback, () => 'l2');
    expect(deps.store.get()!.tracks[0]!.soundType).toBe('sample');
    expect((await deps.store.getSample('l2'))!.loop).toBeUndefined();
  });

  it('hands the loop to the engine', async () => {
    const deps = await setup();
    const calls: unknown[] = [];
    const engine = { ...deps.engine, setSample: (...a: unknown[]) => { calls.push(a); }, setProject: () => {}, setInstrument: () => {} } as never;
    const draft = await prepareGeneration(loopParams, 'warm pad', outOf(harmonic(220, 4)));
    await useGeneration({ store: deps.store, engine }, 't1', draft, () => 'l3');
    expect((calls[0] as unknown[])[3]).toEqual(draft.record.loop);
  });

  it('creates a track named Looped when accepted without a target track', async () => {
    const deps = await setup();
    const draft = await prepareGeneration(loopParams, 'warm pad', outOf(harmonic(220, 4)));
    await useGeneration(deps, null, draft, () => 'l4');
    expect(deps.store.get()!.tracks.at(-1)!.name).toMatch(/^Looped /);
  });
});

describe('loop notice', () => {
  const SR2 = 44100;
  const base = { sampleRate: SR2, rootMidi: 60, lowConfidence: false };
  const draft = (over: Record<string, unknown>) => ({ ...base, pcm: new Float32Array(SR2 * 3), mode: 'sample', record: { pcm: new Float32Array(SR2 * 3), sampleRate: SR2, meta: {} }, ...over }) as never;
  it('is empty for samples and instruments', () => {
    expect(loopNotice(draft({}))).toBe('');
  });
  it('shows the loop region', () => {
    const d = draft({ mode: 'loop', record: { pcm: new Float32Array(SR2 * 3), sampleRate: SR2, loop: { start: 1.2, end: 2.85 }, meta: { mode: 'loop' } } });
    expect(loopNotice(d)).toBe('Loop 1.20–2.85 s');
  });
  it('says so when no clean loop was found', () => {
    expect(loopNotice(draft({ noLoop: true }))).toMatch(/No clean loop was found.*one-shot.*Regenerate/);
  });
  it('says so when the chop reaches into the loop', () => {
    const d = draft({ mode: 'loop', trim: { start: 1.5, end: 3 }, record: { pcm: new Float32Array(SR2 * 3), sampleRate: SR2, loop: { start: 1.2, end: 2.85 }, meta: { mode: 'loop' } } });
    expect(loopNotice(d)).toMatch(/chop.*loop.*one-shot/i);
  });
  it('shifts the displayed loop by the chop', () => {
    const d = draft({ mode: 'loop', trim: { start: 0.5, end: 3 }, record: { pcm: new Float32Array(SR2 * 3), sampleRate: SR2, loop: { start: 1.2, end: 2.85 }, meta: { mode: 'loop' } } });
    expect(loopNotice(d)).toBe('Loop 0.70–2.35 s');
  });
});
