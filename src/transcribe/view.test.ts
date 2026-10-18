import { describe, expect, it } from 'vitest';
import type { TranscribeRun } from './client';
import { noteRows, runRows, windowRows } from './view';

const run = (over: Partial<TranscribeRun> = {}): TranscribeRun => ({
  at: 'T',
  name: 'take1.wav',
  noteCount: 25,
  firstNotes: [],
  audioSeconds: 12,
  windows: 3,
  windowMs: [3000.4, 3100, 3200],
  loadMs: 900,
  inferMs: 9300.4,
  postMs: 12,
  totalMs: 9330,
  realTimeFactor: 0.7775,
  threads: 4,
  crossOriginIsolated: true,
  hardwareConcurrency: 8,
  sessionReused: false,
  ...over,
});

describe('noteRows', () => {
  const notes = Array.from({ length: 50 }, (_, i) => ({ onset: i + 0.0126, offset: i + 0.7626, pitch: 60 + (i % 12), velocity: 80 }));
  it('shows the first 40 notes with time, name, length and velocity', () => {
    const rows = noteRows(notes);
    expect(rows).toHaveLength(40);
    expect(rows[0]).toEqual({ time: '0.013', name: 'C4', length: '0.750', velocity: 80 });
    expect(rows[1]!.name).toBe('C#4');
  });
  it('honours a smaller limit', () => {
    expect(noteRows(notes, 3)).toHaveLength(3);
  });
});

describe('runRows', () => {
  it('lists duration, notes, timing, real-time factor, threads and isolation', () => {
    const rows = Object.fromEntries(runRows(run()));
    expect(rows['Audio']).toBe('12.0 s');
    expect(rows['Notes']).toBe('25');
    expect(rows['Total time']).toBe('9.3 s');
    expect(rows['Real-time factor']).toBe('0.78x');
    expect(rows['Model load']).toBe('0.9 s');
    expect(rows['Threads']).toBe('4 (cores 8)');
    expect(rows['crossOriginIsolated']).toBe('true');
  });
  it('says when the session was reused', () => {
    expect(Object.fromEntries(runRows(run({ sessionReused: true, loadMs: 0 })))['Model load']).toBe('reused');
  });
});

describe('windowRows', () => {
  it('lists each window time', () => {
    expect(windowRows(run())).toEqual([
      ['Window 1', '3.0 s'],
      ['Window 2', '3.1 s'],
      ['Window 3', '3.2 s'],
    ]);
  });
});
