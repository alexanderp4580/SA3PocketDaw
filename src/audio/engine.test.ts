import { describe, it, expect } from 'vitest';
import { createEngine, type EngineContextLike } from './engine';
import { createProject, addTrack, addNote, setTrackSample, setRoot } from '../store/projectModel';

function fakeCtx() {
  const started: Array<{ rate: number; when: number; buffer: unknown }> = [];
  const buffers: Array<{ ch: number; len: number; sr: number; data: Float32Array | null }> = [];
  const state = { time: 0, resumed: 0, current: 'suspended', created: 0 };
  const mk = (): EngineContextLike => ({
    get currentTime() { return state.time; },
    get state() { return state.current; },
    destination: 'dest',
    async resume() { state.resumed++; state.current = 'running'; },
    createBuffer(ch, len, sr) {
      const rec = { ch, len, sr, data: null as Float32Array | null };
      buffers.push(rec);
      return { duration: len / sr, copyToChannel(d: Float32Array) { rec.data = d; } };
    },
    createGain() {
      return { gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {} };
    },
    createBufferSource() {
      const rec = { rate: 1, when: -1, buffer: null as unknown };
      started.push(rec);
      return {
        get buffer() { return rec.buffer as never; }, set buffer(b) { rec.buffer = b; },
        playbackRate: { get value() { return rec.rate; }, set value(v: number) { rec.rate = v; }, setValueAtTime() {}, linearRampToValueAtTime() {} },
        onended: null, connect() {}, start(w?: number) { rec.when = w ?? 0; }, stop() {},
      };
    },
  });
  return { mk, started, buffers, state };
}

function proj() {
  let p = createProject({ bars: 1, bpm: 120 });
  p = addTrack(p, 'A', 't1');
  p = setTrackSample(setRoot(p, 't1', 60), 't1', 's1');
  p = addNote(p, 't1', { midi: 72, start: 0, length: 2 });
  return p;
}

describe('engine', () => {
  it('previews the original source without repitching',async()=>{const f=fakeCtx(),e=createEngine({createContext:f.mk});await e.previewSource(new Float32Array(4410),44100);expect(f.started[0]!.rate).toBe(1);expect(f.buffers[0]!.len).toBe(4410);});
  it('creates and resumes the context only on unlock, once', async () => {
    const f = fakeCtx();
    let created = 0;
    const e = createEngine({ createContext: () => { created++; return f.mk(); } });
    expect(created).toBe(0);
    await e.unlock();
    await e.unlock();
    expect(created).toBe(1);
    expect(f.state.resumed).toBe(1);
  });

  it('audition plays at the right rate from a cached buffer', async () => {
    const f = fakeCtx();
    const e = createEngine({ createContext: f.mk });
    e.setProject(proj());
    e.setSample('s1', new Float32Array(4410), 44100);
    await e.audition('t1', 72);
    expect(f.started).toHaveLength(1);
    expect(f.started[0]!.rate).toBeCloseTo(2);
    expect(f.buffers).toHaveLength(1);
    expect(f.buffers[0]).toMatchObject({ ch: 1, len: 4410, sr: 44100 });
    await e.audition('t1', 60);
    expect(f.buffers).toHaveLength(1); // cached
  });

  it('does nothing for tracks without a sample', async () => {
    const f = fakeCtx();
    const e = createEngine({ createContext: f.mk });
    e.setProject(addTrack(createProject(), 'x', 'tx'));
    await e.audition('tx', 60);
    expect(f.started).toHaveLength(0);
  });

  it('plays the pattern through the scheduler and stops', async () => {
    const f = fakeCtx();
    const timers: Array<() => void> = [];
    const e = createEngine({ createContext: f.mk, setTimer: (fn) => { timers.push(fn); return timers.length; }, clearTimer: () => timers.splice(0) });
    e.setProject(proj());
    e.setSample('s1', new Float32Array(44100), 44100);
    await e.play();
    expect(e.isPlaying).toBe(true);
    expect(f.started).toHaveLength(1);
    expect(f.started[0]!.rate).toBeCloseTo(2);
    f.state.time = 0.3;
    expect(e.playhead()).toBeCloseTo(2, 3);
    e.stop();
    expect(e.isPlaying).toBe(false);
    expect(e.playhead()).toBe(0);
  });

  it('replacing a sample invalidates its buffer', async () => {
    const f = fakeCtx();
    const e = createEngine({ createContext: f.mk });
    e.setProject(proj());
    e.setSample('s1', new Float32Array(100), 44100);
    await e.audition('t1', 60);
    e.setSample('s1', new Float32Array(200), 44100);
    await e.audition('t1', 60);
    expect(f.buffers.map((b) => b.len)).toEqual([100, 200]);
  });
});
