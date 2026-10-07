import { describe, it, expect } from 'vitest';
import { createScheduler, START_DELAY_SEC, type NoteEvent, type Pattern } from './scheduler';

function harness(pattern: Pattern, bpm = 120) {
  let t = 0;
  const timers: Array<{ at: number; fn: () => void; id: number }> = [];
  let nextId = 1;
  const events: NoteEvent[] = [];
  const s = createScheduler({
    now: () => t,
    setTimer: (fn, ms) => { const id = nextId++; timers.push({ at: t + ms / 1000, fn, id }); return id; },
    clearTimer: (h) => { const i = timers.findIndex((x) => x.id === h); if (i >= 0) timers.splice(i, 1); },
    onNote: (e) => events.push(e),
  });
  s.setPattern(pattern);
  s.setBpm(bpm);
  const advance = (sec: number) => {
    const end = t + sec;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const next = timers[0];
      if (!next || next.at > end) break;
      timers.shift();
      t = next.at;
      next.fn();
    }
    t = end;
  };
  return { s, events, advance, setTime: (x: number) => { t = x; }, timers };
}

const note = (id: string, midi: number, start: number, length = 1) => ({ id, midi, start, length });
// 120 bpm: 1 step = 0.125 s; 1 bar = 2 s

describe('scheduler', () => {
  it('schedules a note at step 0 at the start time', () => {
    const h = harness({ bars: 1, tracks: [{ id: 't', muted: false, notes: [note('a', 60, 0)] }] });
    h.s.play();
    h.advance(0.5);
    expect(h.events).toHaveLength(1);
    expect(h.events[0]!.when).toBeCloseTo(START_DELAY_SEC);
    expect(h.events[0]!.duration).toBeCloseTo(0.125);
  });

  it('passes note velocity as linear gain, defaulting to 96', () => {
    const h = harness({ bars: 1, tracks: [{ id: 't', muted: false, notes: [{ ...note('a', 60, 0), velocity: 127 }, note('b', 62, 1), { ...note('c', 64, 2), velocity: 1 }] }] });
    h.s.play();
    h.advance(0.5);
    const byId = Object.fromEntries(h.events.map((e) => [e.noteId, e.velocity]));
    expect(byId.a).toBeCloseTo(1);
    expect(byId.b).toBeCloseTo(96 / 127);
    expect(byId.c).toBeCloseTo(1 / 127);
  });

  it('loops without double-scheduling or dropping notes', () => {
    const h = harness({ bars: 1, tracks: [{ id: 't', muted: false, notes: [note('a', 60, 0), note('b', 62, 8), note('c', 64, 15)] }] });
    h.s.play();
    h.advance(6.1); // 3 loops of 2 s
    const times = h.events.map((e) => [e.noteId, Math.round((e.when - START_DELAY_SEC) * 1000) / 1000]);
    const expected = [0, 2, 4].flatMap((o) => [['a', o], ['b', o + 1], ['c', o + 1.875]]);
    const got = times.filter(([, w]) => (w as number) <= 5.9);
    expect(got).toEqual(expected);
    // unique (note,time)
    expect(new Set(h.events.map((e) => `${e.noteId}@${e.when.toFixed(4)}`)).size).toBe(h.events.length);
  });

  it('schedules ahead of the clock only by the look-ahead', () => {
    const h = harness({ bars: 1, tracks: [{ id: 't', muted: false, notes: [note('b', 62, 8)] }] });
    h.s.play();
    h.advance(0.5);
    expect(h.events).toHaveLength(0); // step 8 is at 1.05 s
    h.advance(0.5);
    expect(h.events).toHaveLength(1);
  });

  it('respects mute, including toggling while playing', () => {
    const track = { id: 't', muted: true, notes: [note('a', 60, 0)] };
    const h = harness({ bars: 1, tracks: [track] });
    h.s.play();
    h.advance(2.5);
    expect(h.events).toHaveLength(0);
    h.s.setPattern({ bars: 1, tracks: [{ ...track, muted: false }] });
    h.advance(2);
    expect(h.events.length).toBeGreaterThan(0);
  });

  it('changes tempo while playing without gaps or duplicates', () => {
    const h = harness({ bars: 1, tracks: [{ id: 't', muted: false, notes: [note('a', 60, 0), note('b', 62, 8)] }] });
    h.s.play();
    h.advance(1.0); // 120bpm: step ~7.6 at t=1.0
    h.s.setBpm(240);
    h.advance(3);
    const ids = h.events.map((e) => e.noteId);
    expect(ids.slice(0, 3)).toEqual(['a', 'b', 'a']);
    // step 8 occurs at 1.05; after the change the second loop's step 0 is at step 16
    const second = h.events.find((e, i) => e.noteId === 'a' && i > 0)!;
    // at t=1.0 step = 7.6; remaining 8.4 steps at 16 steps/s = 0.525 s -> t=1.525
    expect(second.when).toBeCloseTo(1.525, 2);
    expect(h.events[1]!.duration).toBeGreaterThan(0);
  });

  it('reports the playhead fractionally and wraps', () => {
    const h = harness({ bars: 1, tracks: [] });
    expect(h.s.position()).toBe(0);
    h.s.play();
    h.advance(START_DELAY_SEC + 0.5);
    expect(h.s.position()).toBeCloseTo(4, 3);
    h.advance(2);
    expect(h.s.position()).toBeCloseTo(4, 3);
  });

  it('stop halts timers and resets position; play restarts at step 0', () => {
    const h = harness({ bars: 1, tracks: [{ id: 't', muted: false, notes: [note('a', 60, 0)] }] });
    h.s.play();
    h.advance(1);
    h.s.stop();
    expect(h.timers).toHaveLength(0);
    expect(h.s.isPlaying).toBe(false);
    expect(h.s.position()).toBe(0);
    const n = h.events.length;
    h.advance(3);
    expect(h.events.length).toBe(n);
    h.s.play();
    h.advance(0.3);
    expect(h.events.length).toBe(n + 1);
  });

  it('clamps note length to the loop end', () => {
    const h = harness({ bars: 1, tracks: [{ id: 't', muted: false, notes: [note('a', 60, 14, 8)] }] });
    h.s.play();
    h.advance(2);
    expect(h.events[0]!.duration).toBeCloseTo(0.25);
  });
});

describe('track lengths, shared range and pause',()=>{
 it('repeats short tracks inside a shared range while other tracks keep bar context',()=>{
  const h=harness({bars:4,loop:{startBar:2,endBar:3},tracks:[{id:'short',bars:1,muted:false,notes:[note('kick',36,0)]},{id:'long',bars:4,muted:false,notes:[note('outside',60,0),note('bar2',62,16),note('bar3',64,32)]}]});
  h.s.play();h.advance(4.1);expect(h.events.filter(e=>e.trackId==='long').map(e=>e.noteId)).toEqual(['bar2','bar3','bar2']);expect(h.events.filter(e=>e.trackId==='short').map(e=>e.when)).toEqual([.05,2.05,4.05]);
 });
 it('solo filters other tracks; muted solo still does not play',()=>{
  const h=harness({bars:1,tracks:[{id:'a',solo:true,muted:false,notes:[note('a',60,0)]},{id:'b',muted:false,notes:[note('b',62,0)]},{id:'c',solo:true,muted:true,notes:[note('c',64,0)]}]});h.s.play();expect(h.events.map(e=>e.trackId)).toEqual(['a']);
 });
 it('pause freezes position and resumes remaining held notes',()=>{
  const h=harness({bars:2,tracks:[{id:'a',muted:false,notes:[note('held',60,0,12),note('later',62,12)]}]});h.s.play();h.advance(.55);h.s.pause();const pos=h.s.position();h.advance(2);expect(h.s.position()).toBe(pos);const before=h.events.length;h.s.play();expect(h.s.position()).toBe(pos);expect(h.events.length).toBe(before+1);expect(h.events.at(-1)!.noteId).toBe('held');expect(h.events.at(-1)!.duration).toBeCloseTo(1);h.advance(1.2);expect(h.events.at(-1)!.noteId).toBe('later');h.s.stop();expect(h.s.position()).toBe(0);
 });
});

it('plays notes overlapping the selected range at every repeat boundary',()=>{const h=harness({bars:4,loop:{startBar:2,endBar:2},tracks:[{id:'pad',bars:4,muted:false,notes:[note('held',60,12,12)]}]});h.s.play();h.advance(2.1);expect(h.events.map(e=>e.when)).toEqual([.05,2.05]);expect(h.events[0]!.duration).toBe(1);});

it('resuming before initial start emits one overlapping range-entry note',()=>{const h=harness({bars:4,loop:{startBar:2,endBar:2},tracks:[{id:'pad',bars:4,muted:false,notes:[note('held',60,12,12)]}]});h.s.play();h.s.pause();const count=h.events.length;h.s.play();expect(h.events.length-count).toBe(1);});
