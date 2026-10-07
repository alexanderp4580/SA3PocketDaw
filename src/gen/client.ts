import { ingestWorkerMessage, log as defaultLog, recordGeneration as defaultRecord, type Logger } from '../log';
import { MODEL_LABELS } from './prompt';
import {
  type AudioStats,
  type GenerateParams,
  type ModelId,
  type StageTiming,
  type WorkerRequest,
  isWorkerEvent,
} from './protocol';

export interface WorkerLike {
  postMessage(message: WorkerRequest): void;
  terminate(): void;
  onmessage: ((e: { data: unknown }) => void) | null;
  onerror: ((e: { message?: string }) => void) | null;
}

export interface GenerationProgress {
  stage: string;
  fraction: number;
  message: string;
}

export interface GenerationOutput {
  channels: Float32Array[];
  sampleRate: number;
  stats: AudioStats;
  timings: StageTiming[];
}

export interface GenerateOptions {
  onProgress?: (p: GenerationProgress) => void;
  signal?: AbortSignal;
}

export type GenerationErrorCode = 'not-installed' | 'not-available' | 'webgpu-unavailable' | 'webgpu-lost' | 'out-of-memory' | 'cancelled' | 'worker-crashed' | 'failed';

export class GenerationError extends Error {
  constructor(
    message: string,
    readonly code: GenerationErrorCode,
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'GenerationError';
  }
}

/** Turn a raw worker error message into a readable one. */
export function mapGenerationError(raw: string, model: ModelId, stack?: string): GenerationError {
  const label = MODEL_LABELS[model];
  if (/is not installed/i.test(raw)) return new GenerationError(`Download ${label} on the Models screen first`, 'not-installed', raw);
  if (/not available\)|not listed/i.test(raw)) return new GenerationError(`${label} is not available in this build`, 'not-available', raw);
  if (/WebGPU is (unavailable|present, but)|no usable GPU/i.test(raw)) {
    return new GenerationError('WebGPU is not available in this browser, so generation cannot run here', 'webgpu-unavailable', raw);
  }
  if (/device.{0,20}lost|lost.{0,20}device|context lost|DEVICE_LOST/i.test(raw)) {
    return new GenerationError('WebGPU was lost (the GPU reset or the browser reclaimed it). Reload the page and try again', 'webgpu-lost', raw);
  }
  if (/out of memory|oom|allocation failed|array buffer allocation|RangeError|createBuffer|failed to allocate/i.test(raw)) {
    const advice = model === 'medium' ? 'Medium needs the most memory; try Small Music, ' : 'Try a shorter length, ';
    return new GenerationError(`The device ran out of memory. ${advice}use Free model memory, close other tabs and try again`, 'out-of-memory', raw);
  }
  return new GenerationError(raw, 'failed', stack);
}

interface Job {
  id: number;
  params: GenerateParams;
  options: GenerateOptions;
  resolve(o: GenerationOutput): void;
  reject(e: Error): void;
  /** Rejected already (cancelled or aborted); the worker still has to finish with it. */
  settled: boolean;
  abortListener?: () => void;
}

export interface GenerationClientOptions {
  createWorker: () => WorkerLike;
  logger?: Logger;
  record?: (record: unknown) => void;
  now?: () => string;
}

export function createGenerationClient(options: GenerationClientOptions) {
  const logger = options.logger ?? defaultLog;
  const scope = logger.scope('gen');
  const record = options.record ?? defaultRecord;
  const nowIso = options.now ?? (() => new Date().toISOString());
  let worker: WorkerLike | null = null;
  let nextId = 1;
  const queue: Job[] = [];
  let active: Job | null = null;
  let unloadWaiters: Array<() => void> = [];

  function ensureWorker(): WorkerLike {
    if (worker) return worker;
    const w = options.createWorker();
    w.onmessage = (e) => onMessage(e.data);
    w.onerror = (e) => crash(e.message ?? 'unknown worker error');
    worker = w;
    scope.info('generation worker started');
    return w;
  }

  function abortError(): GenerationError {
    return new GenerationError('Cancelled', 'cancelled');
  }

  function settle(job: Job, fn: () => void) {
    if (job.abortListener) job.options.signal?.removeEventListener('abort', job.abortListener);
    if (job.settled) return;
    job.settled = true;
    fn();
  }

  function pump() {
    if (active) return;
    const job = queue.shift();
    if (!job) return;
    active = job;
    ensureWorker().postMessage({ type: 'generate', id: job.id, ...job.params });
  }

  function finishActive() {
    active = null;
    pump();
  }

  function crash(message: string) {
    scope.error('generation worker crashed', message);
    worker?.terminate();
    worker = null;
    const job = active;
    active = null;
    if (job) settle(job, () => job.reject(new GenerationError(`The generation worker stopped unexpectedly: ${message}`, 'worker-crashed', message)));
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
      for (const w of unloadWaiters) w();
      unloadWaiters = [];
      return;
    }
    const job = active;
    if (!job || ('id' in data && data.id !== job.id)) return;
    switch (data.type) {
      case 'progress':
        if (!job.settled) job.options.onProgress?.({ stage: data.stage, fraction: data.fraction, message: data.message });
        break;
      case 'timing':
        break;
      case 'complete': {
        const output: GenerationOutput = { channels: data.channels, sampleRate: data.sampleRate, stats: data.stats, timings: data.timings };
        const total = data.timings.find((s) => s.name === 'total');
        if (!job.settled) {
          record({
            id: job.id,
            at: nowIso(),
            model: job.params.model,
            prompt: job.params.prompt,
            seconds: job.params.seconds,
            steps: job.params.steps,
            seed: job.params.seed,
            totalMs: total ? total.endMs - total.startMs : null,
            stages: data.timings,
            stats: data.stats,
          });
        }
        settle(job, () => job.resolve(output));
        finishActive();
        break;
      }
      case 'error': {
        const err = data.cancelled ? abortError() : mapGenerationError(data.message, job.params.model, data.stack);
        if (!data.cancelled) scope.error(`generation ${job.id} failed: ${err.message}`, data.message);
        settle(job, () => job.reject(err));
        finishActive();
        break;
      }
    }
  }

  function cancelJob(job: Job) {
    const i = queue.indexOf(job);
    if (i >= 0) {
      queue.splice(i, 1);
      settle(job, () => job.reject(abortError()));
      return;
    }
    if (job === active && !job.settled) {
      scope.info(`cancel requested for generation ${job.id}; it stops after the running model call`);
      worker?.postMessage({ type: 'cancel', id: job.id });
      settle(job, () => job.reject(abortError()));
    }
  }

  return {
    generate(params: GenerateParams, opts: GenerateOptions = {}): Promise<GenerationOutput> {
      if (opts.signal?.aborted) return Promise.reject(abortError());
      return new Promise<GenerationOutput>((resolve, reject) => {
        const job: Job = { id: nextId++, params, options: opts, resolve, reject, settled: false };
        if (opts.signal) {
          job.abortListener = () => cancelJob(job);
          opts.signal.addEventListener('abort', job.abortListener, { once: true });
        }
        queue.push(job);
        scope.info(`generation ${job.id} queued`, { model: params.model, seconds: params.seconds, steps: params.steps, seed: params.seed });
        pump();
      });
    },
    /** Ask the worker to free every model session. Resolves when it confirms (immediately when no worker exists). */
    unload(): Promise<void> {
      if (!worker) return Promise.resolve();
      return new Promise<void>((resolve) => {
        unloadWaiters.push(resolve);
        worker!.postMessage({ type: 'unload' });
      });
    },
    /** True while a job runs or waits. */
    busy: () => active !== null || queue.length > 0,
    /** Stop the worker and fail pending jobs. */
    dispose() {
      worker?.terminate();
      worker = null;
      const pending = [...(active ? [active] : []), ...queue.splice(0)];
      active = null;
      for (const job of pending) settle(job, () => job.reject(abortError()));
      for (const w of unloadWaiters) w();
      unloadWaiters = [];
    },
  };
}

export type GenerationClient = ReturnType<typeof createGenerationClient>;

/** Client that runs the real module worker. */
export function createDefaultGenerationClient(): GenerationClient {
  return createGenerationClient({
    createWorker: () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike,
  });
}

let shared: GenerationClient | null = null;
export function generationClient(): GenerationClient {
  return (shared ??= createDefaultGenerationClient());
}
