import { ingestWorkerMessage, log as defaultLog, type Logger } from '../log';
import type { TranscribedNote } from './notes';
import { isWorkerEvent, type TranscribeSummary, type WorkerRequest } from './protocol';

export interface WorkerLike {
  postMessage(message: WorkerRequest, transfer?: Transferable[]): void;
  terminate(): void;
  onmessage: ((e: { data: unknown }) => void) | null;
  onerror: ((e: { message?: string }) => void) | null;
}

export interface TranscribeProgress {
  stage: 'loading' | 'windows';
  done: number;
  total: number;
  message: string;
}

export interface TranscribeOptions {
  onProgress?: (p: TranscribeProgress) => void;
  signal?: AbortSignal;
  /** Explicit WASM thread count; missing = automatic. */
  threads?: number;
  /** Shown in the report. */
  name?: string;
}

export type TranscribeErrorCode = 'not-installed' | 'out-of-memory' | 'cancelled' | 'worker-crashed' | 'failed';

export class TranscribeError extends Error {
  constructor(
    message: string,
    readonly code: TranscribeErrorCode,
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'TranscribeError';
  }
}

export function mapTranscribeError(raw: string, stack?: string): TranscribeError {
  if (/is not installed|not listed|not available\)/i.test(raw)) return new TranscribeError('Download the Piano transcriber on the Models screen first', 'not-installed', raw);
  if (/out of memory|oom|allocation failed|array buffer allocation|RangeError|bad_alloc|failed to allocate/i.test(raw)) {
    return new TranscribeError('The device ran out of memory. Close other tabs, use Free transcriber memory and try a shorter file', 'out-of-memory', raw);
  }
  return new TranscribeError(raw, 'failed', stack);
}

/** Notes listed in the Debug table and the report. */
export const LISTED_NOTES = 40;

/** What the Debug screen and the report show about the last run. */
export interface TranscribeRun {
  at: string;
  name: string;
  noteCount: number;
  firstNotes: TranscribedNote[];
  audioSeconds: number;
  windows: number;
  windowMs: number[];
  loadMs: number;
  inferMs: number;
  postMs: number;
  totalMs: number;
  /** Total time divided by audio duration. */
  realTimeFactor: number;
  threads: number;
  crossOriginIsolated: boolean;
  hardwareConcurrency: number | null;
  sessionReused: boolean;
}

export function runRecord(summary: TranscribeSummary, name: string, at: string): TranscribeRun {
  return {
    at,
    name,
    noteCount: summary.notes.length,
    firstNotes: summary.notes.slice(0, LISTED_NOTES),
    audioSeconds: summary.audioSeconds,
    windows: summary.windows,
    windowMs: summary.windowMs,
    loadMs: summary.loadMs,
    inferMs: summary.inferMs,
    postMs: summary.postMs,
    totalMs: summary.totalMs,
    realTimeFactor: summary.audioSeconds > 0 ? summary.totalMs / 1000 / summary.audioSeconds : 0,
    threads: summary.threads,
    crossOriginIsolated: summary.crossOriginIsolated,
    hardwareConcurrency: summary.hardwareConcurrency,
    sessionReused: summary.sessionReused,
  };
}

interface Job {
  id: number;
  audio: Float32Array;
  options: TranscribeOptions;
  resolve(s: TranscribeSummary): void;
  reject(e: Error): void;
  settled: boolean;
  abortListener?: () => void;
}

export interface TranscriberClientOptions {
  createWorker: () => WorkerLike;
  logger?: Logger;
  record?: (run: TranscribeRun) => void;
  now?: () => string;
}

export function createTranscriberClient(options: TranscriberClientOptions) {
  const logger = options.logger ?? defaultLog;
  const scope = logger.scope('transcribe');
  const nowIso = options.now ?? (() => new Date().toISOString());
  let worker: WorkerLike | null = null;
  /** Thread request the worker was started for; the WASM runtime reads its thread count once per worker. */
  let workerThreads: number | undefined;
  let nextId = 1;
  const queue: Job[] = [];
  let active: Job | null = null;
  let unloadWaiters: Array<() => void> = [];
  let last: TranscribeRun | null = null;
  let lastError: { at: string; code: string; message: string } | null = null;

  function ensureWorker(): WorkerLike {
    if (worker) return worker;
    const w = options.createWorker();
    w.onmessage = (e) => onMessage(e.data);
    w.onerror = (e) => crash(e.message ?? 'unknown worker error');
    worker = w;
    scope.info('transcription worker started');
    return w;
  }

  const cancelledError = () => new TranscribeError('Cancelled', 'cancelled');

  function settle(job: Job, fn: () => void) {
    if (job.abortListener) job.options.signal?.removeEventListener('abort', job.abortListener);
    if (job.settled) return;
    job.settled = true;
    fn();
  }

  function fail(job: Job, err: TranscribeError) {
    if (err.code !== 'cancelled') lastError = { at: nowIso(), code: err.code, message: err.message };
    settle(job, () => job.reject(err));
  }

  function pump() {
    if (active) return;
    const job = queue.shift();
    if (!job) return;
    active = job;
    if (worker && workerThreads !== job.options.threads) {
      scope.info('restarting the worker for a new thread count', { from: workerThreads ?? 'auto', to: job.options.threads ?? 'auto' });
      worker.terminate();
      worker = null;
      for (const w of unloadWaiters) w();
      unloadWaiters = [];
    }
    workerThreads = job.options.threads;
    ensureWorker().postMessage({ type: 'transcribe', id: job.id, audio: job.audio, threads: job.options.threads }, [job.audio.buffer]);
  }

  function finishActive() {
    active = null;
    pump();
  }

  function crash(message: string) {
    scope.error('transcription worker crashed', message);
    worker?.terminate();
    worker = null;
    const job = active;
    active = null;
    if (job) fail(job, new TranscribeError(`The transcription worker stopped unexpectedly: ${message}`, 'worker-crashed', message));
    for (const w of unloadWaiters) w();
    unloadWaiters = [];
    pump();
  }

  function onMessage(data: unknown) {
    if (ingestWorkerMessage(logger, data)) return;
    if (!isWorkerEvent(data)) {
      scope.warn('ignored an unknown worker message');
      return;
    }
    if (data.type === 'unloaded') {
      // WebAssembly memory never shrinks, so the worker ends with its session.
      worker?.terminate();
      worker = null;
      for (const w of unloadWaiters) w();
      unloadWaiters = [];
      return;
    }
    const job = active;
    if (!job || ('id' in data && data.id !== job.id)) return;
    switch (data.type) {
      case 'progress':
        if (!job.settled) job.options.onProgress?.({ stage: data.stage, done: data.done, total: data.total, message: data.message });
        break;
      case 'complete':
        if (!job.settled) {
          last = runRecord(data.summary, job.options.name ?? '', nowIso());
          options.record?.(last);
        }
        settle(job, () => job.resolve(data.summary));
        finishActive();
        break;
      case 'error': {
        const err = data.cancelled ? cancelledError() : mapTranscribeError(data.message, data.stack);
        if (!data.cancelled) scope.error(`transcription ${job.id} failed: ${err.message}`, data.message);
        fail(job, err);
        finishActive();
        break;
      }
    }
  }

  function cancelJob(job: Job) {
    const i = queue.indexOf(job);
    if (i >= 0) {
      queue.splice(i, 1);
      settle(job, () => job.reject(cancelledError()));
      return;
    }
    if (job === active && !job.settled) {
      scope.info(`cancel requested for transcription ${job.id}; it stops after the running window`);
      worker?.postMessage({ type: 'cancel', id: job.id });
      settle(job, () => job.reject(cancelledError()));
    }
  }

  return {
    /** `audio` is mono 16 kHz; its buffer is transferred to the worker. */
    transcribe(audio: Float32Array, opts: TranscribeOptions = {}): Promise<TranscribeSummary> {
      if (opts.signal?.aborted) return Promise.reject(cancelledError());
      return new Promise<TranscribeSummary>((resolve, reject) => {
        const job: Job = { id: nextId++, audio, options: opts, resolve, reject, settled: false };
        if (opts.signal) {
          job.abortListener = () => cancelJob(job);
          opts.signal.addEventListener('abort', job.abortListener, { once: true });
        }
        queue.push(job);
        scope.info(`transcription ${job.id} queued`, { seconds: audio.length / 16000, threads: opts.threads ?? 'auto' });
        pump();
      });
    },
    /** Free the model session and end the worker (its WebAssembly memory is only returned that way). Resolves when the worker confirms (at once when no worker exists). */
    unload(): Promise<void> {
      if (!worker) return Promise.resolve();
      return new Promise<void>((resolve) => {
        unloadWaiters.push(resolve);
        worker!.postMessage({ type: 'unload' });
      });
    },
    busy: () => active !== null || queue.length > 0,
    lastRun: () => last,
    lastError: () => lastError,
    dispose() {
      worker?.terminate();
      worker = null;
      const pending = [...(active ? [active] : []), ...queue.splice(0)];
      active = null;
      for (const job of pending) settle(job, () => job.reject(cancelledError()));
      for (const w of unloadWaiters) w();
      unloadWaiters = [];
    },
  };
}

export type TranscriberClient = ReturnType<typeof createTranscriberClient>;

let shared: TranscriberClient | null = null;
export function transcriberClient(): TranscriberClient {
  return (shared ??= createTranscriberClient({
    createWorker: () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike,
  }));
}
