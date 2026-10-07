import { describe, expect, it } from 'vitest';
import type { Note } from '../../store/projectModel';
import { findTarget, infoLine, inKey, jumpNote, moveStep, movePitch, positionLabel, snapStep, stepsLabel, velocityFromY } from './cursor';

const n = (id: string, midi: number, start: number, length = 1, velocity?: number): Note => ({ id, midi, start, length, ...(velocity ? { velocity } : {}) });

describe('cursor', () => {
  it('labels grids and positions like the mockup', () => {
    expect([1, 2, 4, 8, 16, 3].map(stepsLabel)).toEqual(['1/16', '1/8', '1/4', '1/2', '1 bar', '3/16']);
    expect(positionLabel(10)).toBe('1.3.3');
    expect(positionLabel(0)).toBe('1.1.1');
    expect(positionLabel(16 + 5)).toBe('2.2.2');
  });
  it('builds the info line for a target and for a new note', () => {
    expect(infoLine({ midi: 69, step: 6 }, n('a', 69, 6, 2, 96), 2, 80)).toBe('A4 · 1.2.3 · ♪1/8 · v96');
    expect(infoLine({ midi: 67, step: 10 }, null, 2, 96)).toBe('G4 · 1.3.3 · + new ♪1/8 · v96');
    expect(infoLine({ midi: 70, step: 0 }, null, 1, 90)).toBe('A♯4 · 1.1.1 · + new ♪1/16 · v90');
  });
  it('moves the step by the grid and clamps to the pattern', () => {
    expect(moveStep(0, 1, 2, 16)).toBe(2);
    expect(moveStep(0, -1, 2, 16)).toBe(0);
    expect(moveStep(14, 1, 2, 16)).toBe(14);
    expect(moveStep(15, 1, 16, 32)).toBe(16);
    expect(snapStep(7, 4, 16)).toBe(4);
    expect(snapStep(15, 16, 16)).toBe(0);
  });
  it('moves pitch, skipping out-of-key pitches and stopping at the range ends', () => {
    expect(movePitch(60, 1)).toBe(61);
    const c = { keyRoot: 0, scale: 'major' as const };
    expect(movePitch(60, 1, c)).toBe(62);
    expect(movePitch(64, 1, c)).toBe(65);
    expect(movePitch(60, -1, c)).toBe(59);
    expect(movePitch(96, 1)).toBe(96);
    expect(movePitch(24, -1)).toBe(24);
    expect(inKey(63, { keyRoot: 0, scale: 'minor' })).toBe(true);
    expect(inKey(64, { keyRoot: 0, scale: 'minor' })).toBe(false);
    expect(inKey(66, { keyRoot: 2, scale: 'major' })).toBe(true);
  });
  it('targets the note at the cursor pitch overlapping the cell, preferring one starting inside', () => {
    const notes = [n('long', 60, 0, 8), n('late', 60, 5, 1), n('other', 62, 4, 1)];
    expect(findTarget(notes, { midi: 60, step: 4 }, 2)!.id).toBe('late');
    expect(findTarget(notes, { midi: 60, step: 2 }, 2)!.id).toBe('long');
    expect(findTarget(notes, { midi: 60, step: 8 }, 2)).toBeNull();
    expect(findTarget(notes, { midi: 61, step: 4 }, 2)).toBeNull();
    expect(findTarget([n('a', 60, 4), n('b', 60, 5)], { midi: 60, step: 4 }, 2)!.id).toBe('a');
  });
  it('jumps to the previous and next note', () => {
    const notes = [n('a', 60, 0), n('b', 64, 4), n('c', 67, 4), n('d', 62, 8)];
    expect(jumpNote(notes, { midi: 60, step: 0 }, 1, 1, 16)).toEqual({ midi: 64, step: 4 });
    expect(jumpNote(notes, { midi: 65, step: 4 }, 1, -1, 16)).toEqual({ midi: 60, step: 0 });
    expect(jumpNote(notes, { midi: 66, step: 2 }, 1, 1, 16)).toEqual({ midi: 67, step: 4 });
    expect(jumpNote(notes, { midi: 62, step: 8 }, 1, 1, 16)).toBeNull();
    expect(jumpNote(notes, { midi: 60, step: 0 }, 1, -1, 16)).toBeNull();
  });
  it('maps the velocity strip to 1..127', () => {
    expect(velocityFromY(0, 100)).toBe(127);
    expect(velocityFromY(100, 100)).toBe(1);
    expect(velocityFromY(-20, 100)).toBe(127);
    expect(velocityFromY(50, 100)).toBe(64);
  });
});
