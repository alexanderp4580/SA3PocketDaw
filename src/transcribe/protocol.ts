import type { LogEntry } from '../log';
import type { TranscribedNote } from './notes';

export interface TranscribeSummary {
  notes: TranscribedNote[];
  audioSeconds: number;
  windows: number;
  frames: number;
  windowMs: number[];
  /** Time to create the model session; 0 when the session from an earlier run was reused. */
  loadMs: number;
  inferMs: number;
  postMs: number;
  /** Windows + post-processing, without loading. */
  totalMs: number;
  threads: number;
  crossOriginIsolated: boolean;
  hardwareConcurrency: number | null;
  sessionReused: boolean;
}

export type TranscribeRequest = { type: 'transcribe'; id: number; audio: Float32Array; threads?: number };
export type CancelRequest = { type: 'cancel'; id: number };
export type UnloadRequest = { type: 'unload' };
export type WorkerRequest = TranscribeRequest | CancelRequest | UnloadRequest;

export type ProgressEvent = { type: 'progress'; id: number; stage: 'loading' | 'windows'; done: number; total: number; message: string };
export type LogEvent = { type: 'log'; entry: LogEntry };
export type CompleteEvent = { type: 'complete'; id: number; summary: TranscribeSummary };
export type ErrorEvent = { type: 'error'; id: number; message: string; stack?: string; cancelled?: boolean };
export type UnloadedEvent = { type: 'unloaded' };
export type WorkerEvent = ProgressEvent | LogEvent | CompleteEvent | ErrorEvent | UnloadedEvent;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isId = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

export function isWorkerRequest(v: unknown): v is WorkerRequest {
  if (!isObj(v)) return false;
  if (v.type === 'unload') return true;
  if (v.type === 'cancel') return isId(v.id);
  if (v.type === 'transcribe') {
    return isId(v.id) && v.audio instanceof Float32Array && v.audio.length > 0 && (v.threads === undefined || (typeof v.threads === 'number' && Number.isInteger(v.threads) && v.threads >= 1));
  }
  return false;
}

export function isWorkerEvent(v: unknown): v is WorkerEvent {
  if (!isObj(v)) return false;
  switch (v.type) {
    case 'unloaded':
      return true;
    case 'log':
      return isObj(v.entry);
    case 'progress':
      return isId(v.id) && (v.stage === 'loading' || v.stage === 'windows') && typeof v.done === 'number' && typeof v.total === 'number' && typeof v.message === 'string';
    case 'complete':
      return isId(v.id) && isObj(v.summary) && Array.isArray((v.summary as Record<string, unknown>).notes);
    case 'error':
      return isId(v.id) && typeof v.message === 'string';
    default:
      return false;
  }
}
