import { MIDI_MAX, MIDI_MIN, STEPS_PER_BAR, noteVelocity, type Note } from '../../store/projectModel';
import { midiToName } from '../../audio/pitch';
import type { Cell } from './geometry';

export const GRIDS = [1, 2, 4, 8, 16] as const;
export type Scale = 'major' | 'minor';

const SCALES: Record<Scale, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
};

export interface KeyFilter {
  keyRoot: number;
  scale: Scale;
}

export function stepsLabel(steps: number): string {
  if (steps === 1) return '1/16';
  if (steps === 2) return '1/8';
  if (steps === 4) return '1/4';
  if (steps === 8) return '1/2';
  if (steps === 16) return '1 bar';
  return `${steps}/16`;
}

export function displayName(midi: number): string {
  return midiToName(midi).replace('#', '♯');
}

export function inKey(midi: number, f: KeyFilter): boolean {
  const pc = (((midi - f.keyRoot) % 12) + 12) % 12;
  return SCALES[f.scale].includes(pc);
}

/** One step up or down; with a filter, skips pitches outside the key. Stays put at the range end. */
export function movePitch(midi: number, dir: 1 | -1, filter?: KeyFilter): number {
  let m = midi + dir;
  while (m >= MIDI_MIN && m <= MIDI_MAX) {
    if (!filter || inKey(m, filter)) return m;
    m += dir;
  }
  return midi;
}

export function snapStep(step: number, grid: number, total: number): number {
  const last = Math.floor((total - 1) / grid) * grid;
  return Math.max(0, Math.min(Math.floor(step / grid) * grid, last));
}

export function moveStep(step: number, dir: 1 | -1, grid: number, total: number): number {
  return snapStep(snapStep(step, grid, total) + dir * grid, grid, total);
}

/** Note at the cursor pitch overlapping the cursor cell; prefers one starting inside the cell. */
export function findTarget(notes: Note[], cell: Cell, grid: number): Note | null {
  const end = cell.step + grid;
  const hits = notes.filter((n) => n.midi === cell.midi && n.start < end && n.start + n.length > cell.step);
  const starting = hits.filter((n) => n.start >= cell.step).sort((a, b) => a.start - b.start);
  if (starting[0]) return starting[0];
  return hits.sort((a, b) => b.start - a.start)[0] ?? null;
}

/** Cell of the previous or next note by start time, relative to the target's start or the cursor step. */
export function jumpNote(notes: Note[], cell: Cell, grid: number, dir: 1 | -1, total: number): Cell | null {
  const target = findTarget(notes, cell, grid);
  const ref = target ? target.start : cell.step;
  const pool = notes.filter((n) => (dir > 0 ? n.start > ref : n.start < ref));
  if (pool.length === 0) return null;
  const edge = dir > 0 ? Math.min(...pool.map((n) => n.start)) : Math.max(...pool.map((n) => n.start));
  const best = pool
    .filter((n) => n.start === edge)
    .sort((a, b) => Math.abs(a.midi - cell.midi) - Math.abs(b.midi - cell.midi))[0]!;
  return { step: snapStep(best.start, grid, total), midi: best.midi };
}

export function positionLabel(step: number): string {
  const bar = Math.floor(step / STEPS_PER_BAR) + 1;
  const inBar = step % STEPS_PER_BAR;
  return `${bar}.${Math.floor(inBar / 4) + 1}.${(inBar % 4) + 1}`;
}

export function infoLine(cell: Cell, target: Note | null, newLength: number, defaultVelocity: number): string {
  const head = `${displayName(cell.midi)} · ${positionLabel(cell.step)}`;
  if (target) return `${head} · ♪${stepsLabel(target.length)} · v${noteVelocity(target)}`;
  return `${head} · + new ♪${stepsLabel(newLength)} · v${defaultVelocity}`;
}

export function velocityFromY(y: number, height: number): number {
  if (height <= 0) return 96;
  const f = 1 - Math.min(1, Math.max(0, y / height));
  return Math.min(127, Math.max(1, Math.round(1 + f * 126)));
}
