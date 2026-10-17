import { describe, expect, it } from 'vitest';
import type { Track } from '../../store/projectModel';
import { chordAriaLabel, chordStrip, chordPlacedLabel, placeChord, voiceChord } from './chords';
import { emptyHistory, record, redo, undo } from './history';

const empty = (): Track => ({ id: 't', name: 'T', muted: false, sampleId: null, rootMidi: 60, notes: [] });
const ctx = (track: Track, step = 4, midi = 60, grid = 2, bars = 1) => ({ track, bars: bars as 1, cell: { step, midi }, grid });
const ids = () => {
  let i = 0;
  return () => `c${i++}`;
};
const pcs = (m: number[]) => m.map((x) => x % 12);

describe('chordStrip', () => {
  it('lists the seven diatonic triads of C major', () => {
    const s = chordStrip(0, 'major');
    expect(s.map((c) => c.roman)).toEqual(['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']);
    expect(s.map((c) => c.name)).toEqual(['C', 'Dm', 'Em', 'F', 'G', 'Am', 'B°']);
    expect(s[0]!.offsets).toEqual([0, 4, 7]);
    expect(s[1]!.offsets).toEqual([0, 3, 7]);
    expect(s[6]!.offsets).toEqual([0, 3, 6]);
  });
  it('spells I = C E G, V = G B D, vii° = B D F', () => {
    const s = chordStrip(0, 'major');
    const notes = (i: number) => s[i]!.offsets.map((o) => (s[i]!.rootPc + o) % 12);
    expect(notes(0)).toEqual([0, 4, 7]);
    expect(notes(4)).toEqual([7, 11, 2]);
    expect(notes(6)).toEqual([11, 2, 5]);
  });
  it('uses the natural minor scale that In-key uses', () => {
    const s = chordStrip(9, 'minor');
    expect(s.map((c) => c.roman)).toEqual(['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII']);
    expect(s.map((c) => c.name)).toEqual(['Am', 'B°', 'C', 'Dm', 'Em', 'F', 'G']);
  });
  it('transposes to other keys with sharp names', () => {
    const s = chordStrip(1, 'major');
    expect(s.map((c) => c.name)).toEqual(['C♯', 'D♯m', 'Fm', 'F♯', 'G♯', 'A♯m', 'C°']);
  });
});

describe('chordAriaLabel', () => {
  it('names root, quality and numeral', () => {
    const s = chordStrip(0, 'major');
    expect([0, 1, 6].map((i) => chordAriaLabel(s[i]!))).toEqual([
      'Place C major chord, I',
      'Place D minor chord, ii',
      'Place B diminished chord, vii°',
    ]);
  });
});

describe('voiceChord', () => {
  const [C, , , , G, , B] = chordStrip(0, 'major');
  it('puts the root nearest the cursor and stacks the triad upward', () => {
    expect(voiceChord(C!, 60)).toEqual([60, 64, 67]);
    expect(voiceChord(C!, 65)).toEqual([60, 64, 67]);
    expect(voiceChord(C!, 67)).toEqual([72, 76, 79]);
    expect(voiceChord(G!, 60)).toEqual([55, 59, 62]);
    expect(voiceChord(B!, 60)).toEqual([59, 62, 65]);
  });
  it('shifts down an octave when the top would pass 96', () => {
    expect(voiceChord(C!, 96)).toEqual([84, 88, 91]);
    expect(voiceChord(G!, 96)).toEqual([79, 83, 86]);
    for (const c of chordStrip(0, 'major')) {
      const v = voiceChord(c, 96);
      expect(Math.max(...v)).toBeLessThanOrEqual(96);
      expect(Math.min(...v)).toBeGreaterThanOrEqual(24);
    }
  });
  it('shifts up an octave when the bottom would go below 24', () => {
    expect(voiceChord(B!, 24)).toEqual([35, 38, 41]);
    for (const c of chordStrip(0, 'major')) {
      const v = voiceChord(c, 24);
      expect(Math.min(...v)).toBeGreaterThanOrEqual(24);
      expect(pcs(v)).toEqual(c.offsets.map((o) => (c.rootPc + o) % 12));
    }
  });
});

describe('placeChord', () => {
  const strip = chordStrip(0, 'major');
  it('places the whole chord at the cursor with the given length and velocity', () => {
    const r = placeChord(ctx(empty()), strip[1]!, 4, 80, ids());
    expect(r.track.notes).toEqual([
      { id: 'c0', midi: 62, start: 4, length: 4, velocity: 80 },
      { id: 'c1', midi: 65, start: 4, length: 4, velocity: 80 },
      { id: 'c2', midi: 69, start: 4, length: 4, velocity: 80 },
    ]);
    expect(r.midis).toEqual([62, 65, 69]);
    expect(r.placed).toBe(3);
    expect(chordPlacedLabel(strip[1]!, r.placed)).toBe('Placed Dm · 3 notes');
  });
  it('clips notes at the pattern end', () => {
    const r = placeChord(ctx(empty(), 14, 60, 1), strip[0]!, 8, 96, ids());
    expect(r.track.notes.map((n) => n.length)).toEqual([2, 2, 2]);
  });
  it('creates nothing when the cursor is past the pattern', () => {
    const r = placeChord(ctx(empty(), 16, 60, 1), strip[0]!, 2, 96, ids());
    expect(r.track.notes).toEqual([]);
    expect(r.placed).toBe(0);
  });
  it('skips pitches that already have a note at the cursor, like a single note', () => {
    const t = { ...empty(), notes: [{ id: 'old', midi: 64, start: 4, length: 2, velocity: 50 }] };
    const r = placeChord(ctx(t), strip[0]!, 2, 96, ids());
    expect(r.track.notes.map((n) => n.id)).toEqual(['old', 'c0', 'c1']);
    expect(r.track.notes[0]).toBe(t.notes[0]);
    expect(r.placed).toBe(2);
    expect(r.midis).toEqual([60, 64, 67]);
  });
  it('returns the same track when every pitch is already there', () => {
    const once = placeChord(ctx(empty()), strip[0]!, 2, 96, ids());
    const again = placeChord(ctx(once.track), strip[0]!, 2, 96, ids());
    expect(again.track).toBe(once.track);
    expect(again.placed).toBe(0);
  });
  it('is one undo step: undo removes the chord, redo restores it', () => {
    const before = empty();
    const r = placeChord(ctx(before), strip[4]!, 2, 96, ids());
    let h = record(emptyHistory<Track['notes']>(), before.notes);
    const u = undo(h, r.track.notes)!;
    expect(u.value).toEqual([]);
    expect(undo(u.history, u.value)).toBeNull();
    expect(redo(u.history, u.value)!.value).toEqual(r.track.notes);
  });
});
