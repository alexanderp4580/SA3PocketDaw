import { describe, it, expect } from 'vitest';
import {
  createProject, addTrack, removeTrack, renameTrack, toggleMute, setRoot, setTrackSample,
  addNote, removeNote, moveNote, resizeNote, transposeNote, setBars, setBpm, MIDI_MIN, MIDI_MAX,
  setNoteVelocity, noteVelocity, velocityGain, DEFAULT_VELOCITY,
} from './projectModel';

function withTrack(bars: 1 | 2 | 3 | 4 = 1) {
  let p = createProject({ bars });
  p = addTrack(p, 'Lead');
  return { p, tid: p.tracks[0]!.id };
}

describe('projectModel', () => {
  it('creates a project with defaults', () => {
    const p = createProject();
    expect(p.bpm).toBe(120);
    expect(p.bars).toBe(2);
    expect(p.tracks).toEqual([]);
    expect(p.id).toBeTruthy();
  });

  it('adds, renames, mutes, re-roots and removes tracks immutably', () => {
    const { p, tid } = withTrack();
    expect(p.tracks[0]).toMatchObject({ name: 'Lead', muted: false, sampleId: null, rootMidi: 60, notes: [] });
    const p2 = renameTrack(p, tid, 'Bass');
    expect(p2.tracks[0]!.name).toBe('Bass');
    expect(p.tracks[0]!.name).toBe('Lead');
    expect(toggleMute(p2, tid).tracks[0]!.muted).toBe(true);
    expect(setRoot(p2, tid, 48).tracks[0]!.rootMidi).toBe(48);
    expect(setRoot(p2, tid, 500).tracks[0]!.rootMidi).toBe(MIDI_MAX);
    expect(setTrackSample(p2, tid, 's1').tracks[0]!.sampleId).toBe('s1');
    expect(removeTrack(p2, tid).tracks).toEqual([]);
  });

  it('adds notes snapped to 16ths', () => {
    const { p, tid } = withTrack();
    const p2 = addNote(p, tid, { midi: 60, start: 3.4, length: 1.6 });
    expect(p2.tracks[0]!.notes[0]).toMatchObject({ midi: 60, start: 3, length: 2 });
    expect(p2.tracks[0]!.notes[0]!.id).toBeTruthy();
  });

  it('rejects notes out of range, and duplicates at the same midi+start', () => {
    const { p, tid } = withTrack();
    expect(addNote(p, tid, { midi: MIDI_MIN - 1, start: 0, length: 1 })).toBe(p);
    expect(addNote(p, tid, { midi: MIDI_MAX + 1, start: 0, length: 1 })).toBe(p);
    expect(addNote(p, tid, { midi: 60, start: 16, length: 1 })).toBe(p);
    expect(addNote(p, tid, { midi: 60, start: -1, length: 1 })).toBe(p);
    const p2 = addNote(p, tid, { midi: 60, start: 0, length: 4 });
    expect(addNote(p2, tid, { midi: 60, start: 0, length: 2 })).toBe(p2);
    expect(addNote(p2, tid, { midi: 62, start: 0, length: 2 }).tracks[0]!.notes).toHaveLength(2);
  });

  it('clamps length to the loop end', () => {
    const { p, tid } = withTrack();
    const p2 = addNote(p, tid, { midi: 60, start: 14, length: 8 });
    expect(p2.tracks[0]!.notes[0]!.length).toBe(2);
  });

  it('moves, resizes, transposes and removes notes within bounds', () => {
    const { p, tid } = withTrack();
    const p1 = addNote(p, tid, { midi: 60, start: 0, length: 2 });
    const nid = p1.tracks[0]!.notes[0]!.id;
    expect(moveNote(p1, tid, nid, { midi: 64, start: 5 }).tracks[0]!.notes[0]).toMatchObject({ midi: 64, start: 5, length: 2 });
    expect(moveNote(p1, tid, nid, { midi: 64, start: 15 }).tracks[0]!.notes[0]!.start).toBe(p1.tracks[0]!.notes[0]!.start);
    expect(resizeNote(p1, tid, nid, 20).tracks[0]!.notes[0]!.length).toBe(16);
    expect(resizeNote(p1, tid, nid, 0).tracks[0]!.notes[0]!.length).toBe(1);
    expect(transposeNote(p1, tid, nid, 12).tracks[0]!.notes[0]!.midi).toBe(72);
    expect(transposeNote(p1, tid, nid, 100)).toBe(p1);
    expect(removeNote(p1, tid, nid).tracks[0]!.notes).toEqual([]);
  });

  it('move onto an existing same midi+start note is rejected', () => {
    const { p, tid } = withTrack();
    let q = addNote(p, tid, { midi: 60, start: 0, length: 1 });
    q = addNote(q, tid, { midi: 62, start: 0, length: 1 });
    const id = q.tracks[0]!.notes[1]!.id;
    expect(transposeNote(q, tid, id, -2)).toBe(q);
  });

  it('shrinking bars drops notes past the end and clamps lengths', () => {
    let { p, tid } = withTrack(2);
    p = addNote(p, tid, { midi: 60, start: 20, length: 2 });
    p = addNote(p, tid, { midi: 62, start: 14, length: 8 });
    const q = setBars(p, 1);
    expect(q.tracks[0]!.notes).toHaveLength(1);
    expect(q.tracks[0]!.notes[0]).toMatchObject({ midi: 62, start: 14, length: 2 });
  });

  it('clamps bpm', () => {
    const p = createProject();
    expect(setBpm(p, 1000).bpm).toBe(240);
    expect(setBpm(p, 10).bpm).toBe(40);
  });

  it('stores velocity: default 96, clamped 1..127, settable', () => {
    const { p, tid } = withTrack(1);
    const a = addNote(p, tid, { midi: 60, start: 0, length: 1, id: 'a' });
    expect(a.tracks[0]!.notes[0]!.velocity).toBe(DEFAULT_VELOCITY);
    const b = addNote(a, tid, { midi: 62, start: 0, length: 1, id: 'b', velocity: 500 });
    expect(b.tracks[0]!.notes[1]!.velocity).toBe(127);
    const c = setNoteVelocity(b, tid, 'a', 0);
    expect(c.tracks[0]!.notes[0]!.velocity).toBe(1);
    expect(b.tracks[0]!.notes[0]!.velocity).toBe(DEFAULT_VELOCITY);
    expect(setNoteVelocity(b, tid, 'zz', 5)).toEqual(b);
  });

  it('treats a missing velocity as 96', () => {
    expect(noteVelocity({})).toBe(96);
    expect(velocityGain(undefined)).toBeCloseTo(96 / 127);
    expect(velocityGain(127)).toBe(1);
  });
});
