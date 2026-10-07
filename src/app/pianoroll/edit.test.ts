import { describe, expect, it } from 'vitest';
import type { Track } from '../../store/projectModel';
import { changeLength, changeVelocity, deleteTarget, place, stepLength } from './edit';

const empty = (): Track => ({ id: 't', name: 'T', muted: false, sampleId: null, rootMidi: 60, notes: [] });
const ctx = (track: Track, step = 4, midi = 60, grid = 2) => ({ track, bars: 1 as const, cell: { step, midi }, grid });

describe('edit', () => {
  it('steps lengths', () => {
    expect(stepLength(4, 1)).toBe(8);
    expect(stepLength(16, 1)).toBe(16);
    expect(stepLength(1, -1)).toBe(1);
    expect(stepLength(3, -1)).toBe(2);
  });
  it('place adds a note with the new length and velocity at the cursor', () => {
    const r = place(ctx(empty()), 2, 80, 'n1');
    expect(r.track.notes).toEqual([{ id: 'n1', midi: 60, start: 4, length: 2, velocity: 80 }]);
    expect(r.audition).toEqual({ midi: 60, velocity: 80 });
  });
  it('place on a target plays it without adding a duplicate', () => {
    const t = place(ctx(empty()), 2, 80, 'n1').track;
    const r = place(ctx(t, 4), 2, 100, 'n2');
    expect(r.track).toBe(t);
    expect(r.audition).toEqual({ midi: 60, velocity: 80 });
  });
  it('place clamps to the pattern end', () => {
    const r = place(ctx(empty(), 14, 60, 1), 8, 96, 'n1');
    expect(r.track.notes[0]!.length).toBe(2);
  });
  it('deletes only the target', () => {
    const t = place(ctx(empty()), 2, 80, 'n1').track;
    expect(deleteTarget(ctx(t, 4)).notes).toEqual([]);
    expect(deleteTarget(ctx(t, 8))).toBe(t);
  });
  it('length buttons resize the target, else step the new-note length', () => {
    const t = place(ctx(empty()), 2, 80, 'n1').track;
    const a = changeLength(ctx(t, 4), 2, 1);
    expect(a.track.notes[0]!.length).toBe(4);
    expect(a.newLength).toBe(2);
    const b = changeLength(ctx(t, 8), 2, 1);
    expect(b.track).toBe(t);
    expect(b.newLength).toBe(4);
  });
  it('velocity applies to the target, else the default', () => {
    const t = place(ctx(empty()), 2, 80, 'n1').track;
    const a = changeVelocity(ctx(t, 4), 96, 40);
    expect(a.track.notes[0]!.velocity).toBe(40);
    expect(a.defaultVelocity).toBe(96);
    const b = changeVelocity(ctx(t, 8), 96, 40);
    expect(b.track).toBe(t);
    expect(b.defaultVelocity).toBe(40);
  });
});
