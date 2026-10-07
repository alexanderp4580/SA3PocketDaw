import { describe, it, expect } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { createProjectStore, type StoredSample } from './projectStore';
import { createProject, addTrack, removeTrack, setTrackSample, renameProject, noteVelocity } from './projectModel';

const sample = (n = 100): StoredSample => ({
  pcm: Float32Array.from({ length: n }, (_, i) => i / n),
  sampleRate: 44100,
  meta: { prompt: 'lead', model: 'small-music', seed: 1, steps: 8, seconds: 2, generatedAt: 123, detectedMidi: 60, confidence: 0.9 },
});

function setup() {
  const idb = new IDBFactory();
  const timers: Array<{ fn: () => void; id: number }> = [];
  let n = 0;
  const mk = () =>
    createProjectStore({
      idb,
      setTimer: (fn) => { timers.push({ fn, id: ++n }); return n; },
      clearTimer: (h) => { const i = timers.findIndex((t) => t.id === h); if (i >= 0) timers.splice(i, 1); },
    });
  return { idb, mk, timers };
}

describe('projectStore', () => {
  it('load returns null on empty db', async () => {
    const { mk } = setup();
    expect(await mk().load()).toBeNull();
  });

  it('debounces saves: one pending timer, flush writes the latest', async () => {
    const { mk, timers } = setup();
    const s = mk();
    let p = createProject({ name: 'one' });
    s.set(p);
    s.set(renameProject(p, 'two'));
    expect(timers).toHaveLength(1);
    await s.flush();
    expect(timers).toHaveLength(0);
    const again = mk();
    expect((await again.load())!.name).toBe('two');
  });

  it('timer firing saves', async () => {
    const { mk, timers } = setup();
    const s = mk();
    s.set(createProject({ name: 'x' }));
    timers[0]!.fn();
    await s.flush();
    expect((await mk().load())!.name).toBe('x');
  });

  it('round-trips project and samples across a new store instance', async () => {
    const { mk } = setup();
    const a = mk();
    let p = addTrack(createProject({ name: 'rt' }), 'Lead', 't1');
    await a.putSample('s1', sample());
    p = setTrackSample(p, 't1', 's1', 62);
    a.set(p);
    await a.flush();
    const b = mk();
    const loaded = await b.load();
    expect(loaded).toEqual(p);
    const got = await b.getSample('s1');
    expect(got!.sampleRate).toBe(44100);
    expect(got!.meta.detectedMidi).toBe(60);
    expect(got!.pcm).toBeInstanceOf(Float32Array);
    expect(Array.from(got!.pcm)).toEqual(Array.from(sample().pcm));
  });

  it('loads notes saved without a velocity', async () => {
    const { mk } = setup();
    const a = mk();
    let p = addTrack(createProject(), 'Lead', 't1');
    p = { ...p, tracks: [{ ...p.tracks[0]!, notes: [{ id: 'n1', midi: 60, start: 0, length: 2 }] }] };
    a.set(p);
    await a.flush();
    const loaded = await mk().load();
    expect(loaded!.tracks[0]!.notes[0]).toEqual({ id: 'n1', midi: 60, start: 0, length: 2 });
    expect(noteVelocity(loaded!.tracks[0]!.notes[0]!)).toBe(96);
  });

  it('subscribe emits current immediately and on change, until unsubscribed', async () => {
    const { mk } = setup();
    const s = mk();
    const seen: Array<string | null> = [];
    const off = s.subscribe((p) => seen.push(p?.name ?? null));
    s.set(createProject({ name: 'a' }));
    off();
    s.set(createProject({ name: 'b' }));
    expect(seen).toEqual([null, 'a']);
  });

  it('removing a track deletes its orphaned sample', async () => {
    const { mk } = setup();
    const s = mk();
    let p = addTrack(addTrack(createProject(), 'A', 'ta'), 'B', 'tb');
    await s.putSample('sa', sample());
    await s.putSample('sb', sample());
    p = setTrackSample(setTrackSample(p, 'ta', 'sa'), 'tb', 'sb');
    s.set(p);
    s.set(removeTrack(p, 'ta'));
    await s.flush();
    await new Promise((r) => setTimeout(r, 20));
    expect(await s.listSampleIds()).toEqual(['sb']);
  });

  it('replacing a track sample deletes the old one', async () => {
    const { mk } = setup();
    const s = mk();
    let p = addTrack(createProject(), 'A', 'ta');
    await s.putSample('old', sample());
    p = setTrackSample(p, 'ta', 'old');
    s.set(p);
    await s.putSample('new', sample());
    s.set(setTrackSample(p, 'ta', 'new'));
    await new Promise((r) => setTimeout(r, 20));
    expect(await s.listSampleIds()).toEqual(['new']);
  });

  it('load removes samples that no track references', async () => {
    const { mk } = setup();
    const a = mk();
    a.set(createProject());
    await a.flush();
    await a.putSample('stray', sample());
    const b = mk();
    await b.load();
    expect(await b.listSampleIds()).toEqual([]);
  });

  it('deleteProject removes project and samples', async () => {
    const { mk } = setup();
    const s = mk();
    s.set(createProject());
    await s.flush();
    await s.putSample('x', sample());
    await s.deleteProject();
    expect(s.get()).toBeNull();
    expect(await mk().load()).toBeNull();
    expect(await s.listSampleIds()).toEqual([]);
  });

  it('deleteProject cancels a pending save', async () => {
    const { mk, timers } = setup();
    const s = mk();
    s.set(createProject());
    await s.deleteProject();
    expect(timers).toHaveLength(0);
    await s.flush();
    expect(await mk().load()).toBeNull();
  });

  it('clearAll empties both stores and registerClear hooks it up', async () => {
    const { mk } = setup();
    const s = mk();
    s.set(createProject());
    await s.flush();
    await s.putSample('x', sample());
    const hooks: Array<() => Promise<void> | void> = [];
    s.registerClear((h) => hooks.push(h));
    expect(hooks).toHaveLength(1);
    await hooks[0]!();
    expect(await mk().load()).toBeNull();
    expect(await s.listSampleIds()).toEqual([]);
  });

  it('putSample/getSample/deleteSample', async () => {
    const { mk } = setup();
    const s = mk();
    expect(await s.getSample('nope')).toBeNull();
    await s.putSample('a', sample());
    expect(await s.getSample('a')).not.toBeNull();
    await s.deleteSample('a');
    expect(await s.getSample('a')).toBeNull();
  });
});
