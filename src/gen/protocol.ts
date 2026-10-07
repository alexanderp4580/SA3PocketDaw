import type { LogEntry } from '../log';

export const MODEL_IDS = ['small-music', 'small-sfx', 'medium'] as const;
export type ModelId = (typeof MODEL_IDS)[number];

export const SAMPLE_RATE = 44100;

export type StageName =
  | 'gpu-probe'
  | 'load-encoder'
  | 'tokenize'
  | 'encode'
  | 'load-dit'
  | `denoise-step-${number}`
  | 'load-decoder'
  | 'decode'
  | 'total';

export interface StageTiming {
  name: string;
  startMs: number;
  endMs: number;
}

export interface GenerateParams {
  mode?: 'sample'|'instrument';
  model: ModelId;
  /** Final prompt text; use `buildPrompt` to add the sample-style suffix. */
  prompt: string;
  seconds: number;
  steps: number;
  seed: number;
}

export interface AudioStats {
  peak: number;
  rms: number;
  nonFinite: number;
  dims: number[];
}

export type GenerateRequest = { type: 'generate'; id: number } & GenerateParams;
export type CancelRequest = { type: 'cancel'; id: number };
export type UnloadRequest = { type: 'unload' };
export type WorkerRequest = GenerateRequest | CancelRequest | UnloadRequest;

export type ProgressEvent = { type: 'progress'; id: number; stage: string; fraction: number; message: string };
export type LogEvent = { type: 'log'; entry: LogEntry };
export type TimingEvent = { type: 'timing'; id: number; stages: StageTiming[] };
export type CompleteEvent = {
  type: 'complete';
  id: number;
  channels: Float32Array[];
  sampleRate: number;
  stats: AudioStats;
  timings: StageTiming[];
};
export type ErrorEvent = { type: 'error'; id: number; message: string; stack?: string; cancelled?: boolean };
export type UnloadedEvent = { type: 'unloaded' };
export type WorkerEvent = ProgressEvent | LogEvent | TimingEvent | CompleteEvent | ErrorEvent | UnloadedEvent;

export const MAX_SECONDS = 12;
export const MAX_STEPS = 64;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isId = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

export function isModelId(v: unknown): v is ModelId {
  return typeof v === 'string' && (MODEL_IDS as readonly string[]).includes(v);
}

export function isGenerateParams(v: unknown): v is GenerateParams {
  if (!isObj(v)) return false;
  return (
    (v.mode === undefined || v.mode === 'sample' || v.mode === 'instrument') &&
    isModelId(v.model) &&
    typeof v.prompt === 'string' &&
    v.prompt.trim().length > 0 &&
    typeof v.seconds === 'number' &&
    Number.isFinite(v.seconds) &&
    v.seconds > 0 &&
    v.seconds <= MAX_SECONDS &&
    typeof v.steps === 'number' &&
    Number.isInteger(v.steps) &&
    v.steps >= 1 &&
    v.steps <= MAX_STEPS &&
    typeof v.seed === 'number' &&
    Number.isInteger(v.seed) &&
    v.seed >= 0 &&
    v.seed <= 0xffffffff
  );
}

export function isWorkerRequest(v: unknown): v is WorkerRequest {
  if (!isObj(v)) return false;
  if (v.type === 'unload') return true;
  if (v.type === 'cancel') return isId(v.id);
  if (v.type === 'generate') return isId(v.id) && isGenerateParams(v);
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
      return isId(v.id) && typeof v.stage === 'string' && typeof v.fraction === 'number' && typeof v.message === 'string';
    case 'timing':
      return isId(v.id) && Array.isArray(v.stages);
    case 'complete':
      return (
        isId(v.id) &&
        Array.isArray(v.channels) &&
        v.channels.length > 0 &&
        v.channels.every((c) => c instanceof Float32Array) &&
        typeof v.sampleRate === 'number' &&
        isObj(v.stats) &&
        Array.isArray(v.timings)
      );
    case 'error':
      return isId(v.id) && typeof v.message === 'string';
    default:
      return false;
  }
}
