import { describe, expect, it } from 'vitest';
import { CELL_W, ROW_H, gridHeight, gridWidth, isBlackKey, midiToY, noteRect, pointToCell, revealScroll, rowMidis, rulerLabels } from './geometry';

describe('geometry', () => {
  it('lists every row from 96 down to 24', () => {
    const r = rowMidis();
    expect(r[0]).toBe(96);
    expect(r[r.length - 1]).toBe(24);
    expect(r).toHaveLength(73);
    expect(gridHeight()).toBe(73 * ROW_H);
  });
  it('flags black keys', () => {
    expect([60, 61, 63, 66, 68, 70, 62].map(isBlackKey)).toEqual([false, true, true, true, true, true, false]);
  });
  it('maps points to cells', () => {
    expect(pointToCell(0, 0, 1)).toEqual({ step: 0, midi: 96 });
    expect(pointToCell(CELL_W * 3 + 2, ROW_H * 36 + 1, 1)).toEqual({ step: 3, midi: 60 });
    expect(pointToCell(gridWidth(1), 0, 1)).toBeNull();
    expect(pointToCell(gridWidth(2) - 1, 0, 2)).toEqual({ step: 31, midi: 96 });
    expect(pointToCell(-1, 0, 1)).toBeNull();
    expect(pointToCell(0, gridHeight(), 1)).toBeNull();
    expect(midiToY(24)).toBe(72 * ROW_H);
  });
  it('places note rectangles inside their cells', () => {
    expect(noteRect({ midi: 95, start: 2, length: 2 })).toEqual({ left: 2 * CELL_W + 1, top: ROW_H + 1, width: 2 * CELL_W - 2, height: ROW_H - 3 });
  });
  it('reveals a span with minimal scrolling', () => {
    expect(revealScroll(100, 20, 90, 200)).toBe(90);
    expect(revealScroll(50, 20, 90, 200)).toBe(50);
    expect(revealScroll(300, 20, 90, 200)).toBe(120);
    expect(revealScroll(5, 20, 90, 200, 10)).toBe(0);
  });
  it('labels the ruler with bar.beat', () => {
    const l = rulerLabels(2);
    expect(l.map((x) => x.text)).toEqual(['1.1', '1.2', '1.3', '1.4', '2', '2.2', '2.3', '2.4']);
    expect(l[4]!.step).toBe(16);
  });
});
