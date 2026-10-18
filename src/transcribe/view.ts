import { midiToName } from '../audio/pitch';
import { formatElapsed } from '../app/format';
import { LISTED_NOTES, type TranscribeRun } from './client';
import type { TranscribedNote } from './notes';

export interface NoteRow {
  time: string;
  name: string;
  length: string;
  velocity: number;
}

export function noteRows(notes: TranscribedNote[], limit = LISTED_NOTES): NoteRow[] {
  return notes.slice(0, limit).map((n) => ({ time: n.onset.toFixed(3), name: midiToName(n.pitch), length: (n.offset - n.onset).toFixed(3), velocity: n.velocity }));
}

export function runRows(r: TranscribeRun): Array<[string, string]> {
  return [
    ['File', r.name || 'unnamed'],
    ['Audio', `${r.audioSeconds.toFixed(1)} s`],
    ['Notes', String(r.noteCount)],
    ['Total time', formatElapsed(r.totalMs)],
    ['Real-time factor', `${r.realTimeFactor.toFixed(2)}x`],
    ['Model load', r.sessionReused ? 'reused' : formatElapsed(r.loadMs)],
    ['Threads', `${r.threads} (cores ${r.hardwareConcurrency ?? 'unknown'})`],
    ['crossOriginIsolated', String(r.crossOriginIsolated)],
  ];
}

export function windowRows(r: TranscribeRun): Array<[string, string]> {
  return r.windowMs.map((ms, i) => [`Window ${i + 1}`, formatElapsed(ms)]);
}
