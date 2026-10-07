import {
  addNote,
  newId,
  noteVelocity,
  removeNote,
  resizeNote,
  setNoteVelocity,
  type Bars,
  type Project,
  type Track,
} from '../../store/projectModel';
import { findTarget } from './cursor';
import type { Cell } from './geometry';

export const LENGTHS = [1, 2, 4, 8, 16] as const;

export function stepLength(current: number, dir: 1 | -1): number {
  if (dir > 0) return LENGTHS.find((l) => l > current) ?? LENGTHS[LENGTHS.length - 1]!;
  return [...LENGTHS].reverse().find((l) => l < current) ?? LENGTHS[0]!;
}

function stub(track: Track, bars: Bars): Project {
  return { id: 'roll', name: 'roll', bpm: 120, key: 'C', bars, tracks: [track] };
}

function run(track: Track, bars: Bars, fn: (p: Project) => Project): Track {
  return fn(stub(track, bars)).tracks[0]!;
}

export interface EditContext {
  track: Track;
  bars: Bars;
  cell: Cell;
  grid: number;
}

/** Place a note at the cursor, or play the target when one is there. */
export function place(c: EditContext, length: number, velocity: number, id?: string): { track: Track; audition: { midi: number; velocity: number } } {
  const target = findTarget(c.track.notes, c.cell, c.grid);
  if (target) return { track: c.track, audition: { midi: target.midi, velocity: noteVelocity(target) } };
  const next = run(c.track, c.bars, (p) =>
    addNote(p, c.track.id, { midi: c.cell.midi, start: c.cell.step, length, velocity, id: id ?? newId('n') }),
  );
  return { track: next, audition: { midi: c.cell.midi, velocity } };
}

export function deleteTarget(c: EditContext): Track {
  const target = findTarget(c.track.notes, c.cell, c.grid);
  if (!target) return c.track;
  return run(c.track, c.bars, (p) => removeNote(p, c.track.id, target.id));
}

/** Resizes the target; without one, steps the length of the next new note. */
export function changeLength(c: EditContext, newLength: number, dir: 1 | -1): { track: Track; newLength: number } {
  const target = findTarget(c.track.notes, c.cell, c.grid);
  if (!target) return { track: c.track, newLength: stepLength(newLength, dir) };
  const length = stepLength(target.length, dir);
  return { track: run(c.track, c.bars, (p) => resizeNote(p, c.track.id, target.id, length)), newLength };
}

/** Sets the target's velocity; without one, sets the default for new notes. */
export function changeVelocity(c: EditContext, defaultVelocity: number, velocity: number): { track: Track; defaultVelocity: number } {
  const target = findTarget(c.track.notes, c.cell, c.grid);
  if (!target) return { track: c.track, defaultVelocity: velocity };
  return { track: run(c.track, c.bars, (p) => setNoteVelocity(p, c.track.id, target.id, velocity)), defaultVelocity };
}

/** Clear this roll while preserving its source sound and track settings. */
export function clearTrackNotes(track:Track):Track {
 return track.notes.length ? {...track,notes:[]} : track;
}
