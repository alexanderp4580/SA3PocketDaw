import { MIDI_MAX, MIDI_MIN } from '../../store/projectModel';

export const WHITE_SEMIS = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16];

export interface KbKey {
  midi: number;
  /** Left edge as a fraction of the keyboard width. */
  left: number;
  /** Width as a fraction of the keyboard width. */
  width: number;
}

/** Ten white keys from C of `baseC`, and the black keys between them. */
export function keyboardLayout(baseC: number): { whites: KbKey[]; blacks: KbKey[] } {
  const w = 1 / WHITE_SEMIS.length;
  const whites = WHITE_SEMIS.map((s, i) => ({ midi: baseC + s, left: i * w, width: w }));
  const blacks: KbKey[] = [];
  for (let i = 0; i < WHITE_SEMIS.length - 1; i++) {
    const gap = WHITE_SEMIS[i + 1]! - WHITE_SEMIS[i]!;
    if (gap === 2) blacks.push({ midi: baseC + WHITE_SEMIS[i]! + 1, left: (i + 1) * w - w * 0.3, width: w * 0.6 });
  }
  return { whites, blacks };
}

export function clampBase(baseC: number): number {
  const snapped = Math.round(baseC / 12) * 12;
  return Math.min(Math.floor((MIDI_MAX - 16) / 12) * 12, Math.max(MIDI_MIN, snapped));
}

export function shiftBase(baseC: number, dir: 1 | -1): number {
  return clampBase(baseC + dir * 12);
}
