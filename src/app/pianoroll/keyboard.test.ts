import { describe, expect, it } from 'vitest';
import { clampBase, keyboardLayout, shiftBase } from './keyboard';

describe('keyboard', () => {
  it('lays out ten white keys and seven black keys over C..E', () => {
    const { whites, blacks } = keyboardLayout(60);
    expect(whites.map((k) => k.midi)).toEqual([60, 62, 64, 65, 67, 69, 71, 72, 74, 76]);
    expect(blacks.map((k) => k.midi)).toEqual([61, 63, 66, 68, 70, 73, 75]);
    expect(blacks[0]!.left).toBeCloseTo(0.1 - 0.03);
  });
  it('keeps the keyboard inside the midi range', () => {
    expect(shiftBase(24, -1)).toBe(24);
    expect(shiftBase(72, 1)).toBe(72);
    expect(shiftBase(60, 1)).toBe(72);
    expect(clampBase(100)).toBe(72);
  });
});
