import { MIDI_MAX, MIDI_MIN, STEPS_PER_BAR } from '../../store/projectModel';

export const ROW_H = 30;
export const CELL_W = 21;
export const KEY_W = 64;
export const RULER_H = 22;

const BLACK = new Set([1, 3, 6, 8, 10]);

export function isBlackKey(midi: number): boolean {
  return BLACK.has(((midi % 12) + 12) % 12);
}

/** Midi values from the top row (highest) to the bottom row. */
export function rowMidis(): number[] {
  const rows: number[] = [];
  for (let m = MIDI_MAX; m >= MIDI_MIN; m--) rows.push(m);
  return rows;
}

export function midiToY(midi: number): number {
  return (MIDI_MAX - midi) * ROW_H;
}

export function stepToX(step: number): number {
  return step * CELL_W;
}

export function gridWidth(bars: number): number {
  return bars * STEPS_PER_BAR * CELL_W;
}

export function gridHeight(): number {
  return (MIDI_MAX - MIDI_MIN + 1) * ROW_H;
}

export interface Cell {
  step: number;
  midi: number;
}

/** x and y are relative to the cell area (below the ruler, right of the keys). */
export function pointToCell(x: number, y: number, bars: number): Cell | null {
  if (x < 0 || y < 0) return null;
  const step = Math.floor(x / CELL_W);
  const midi = MIDI_MAX - Math.floor(y / ROW_H);
  if (step >= bars * STEPS_PER_BAR || midi < MIDI_MIN) return null;
  return { step, midi };
}

export function noteRect(note: { midi: number; start: number; length: number }) {
  return { left: stepToX(note.start) + 1, top: midiToY(note.midi) + 1, width: note.length * CELL_W - 2, height: ROW_H - 3 };
}

/** New scroll offset that keeps [pos, pos+size] inside the viewport. */
export function revealScroll(pos: number, size: number, scroll: number, viewport: number, pad = 0): number {
  if (pos - pad < scroll) return Math.max(0, pos - pad);
  if (pos + size + pad > scroll + viewport) return pos + size + pad - viewport;
  return scroll;
}

export interface RulerLabel {
  step: number;
  text: string;
}

export function rulerLabels(bars: number): RulerLabel[] {
  const out: RulerLabel[] = [];
  for (let bar = 1; bar <= bars; bar++) {
    for (let beat = 1; beat <= 4; beat++) {
      out.push({ step: (bar - 1) * STEPS_PER_BAR + (beat - 1) * 4, text: beat === 1 && bar > 1 ? `${bar}` : `${bar}.${beat}` });
    }
  }
  return out;
}
