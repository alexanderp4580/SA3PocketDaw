import { forwardLogs, log } from '../log';
import { createModelManager } from '../store/modelManager';
import { appBaseUrl, modelsBaseUrl } from '../store/modelsBase';
import { createOrtSession } from './ortSession';
import { CancelledError, transcribe } from './pipeline';
import { isWorkerRequest, type TranscribeRequest, type TranscribeSummary, type WorkerEvent } from './protocol';

const ctx = self as unknown as {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent) => void) | null;
};
const scope = log.scope('transcribe-worker');
const post = (e: WorkerEvent) => ctx.postMessage(e);
forwardLogs(log, (m) => ctx.postMessage(m));

const appBase = appBaseUrl();
const models = createModelManager({ baseUrl: modelsBaseUrl(appBase), log });
let manifestPromise: ReturnType<typeof models.loadManifest> | null = null;
const loadManifest = () => (manifestPromise ??= models.loadManifest().catch((e) => {
  manifestPromise = null;
  throw e;
}));

const ort = createOrtSession({ openFile: (path) => models.openFile(path), loadManifest, appBase, log: scope });

let currentId: number | null = null;
let unloadAfter = false;
const cancelled = new Set<number>();
const yieldToEvents = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function run(req: TranscribeRequest) {
  const { id } = req;
  try {
    post({ type: 'progress', id, stage: 'loading', done: 0, total: 1, message: 'Loading the model' });
    const loaded = await ort.load(req.threads, (message) => post({ type: 'progress', id, stage: 'loading', done: 0, total: 1, message }));
    const r = await transcribe(req.audio, loaded.session, {
      isCancelled: () => cancelled.has(id),
      yieldToEvents,
      onProgress: (done, total) => post({ type: 'progress', id, stage: 'windows', done, total, message: `Window ${Math.min(done + 1, total)} of ${total}` }),
    });
    const summary: TranscribeSummary = {
      notes: r.notes,
      audioSeconds: r.audioSeconds,
      windows: r.windows,
      frames: r.frames,
      windowMs: r.windowMs,
      loadMs: loaded.loadMs,
      inferMs: r.inferMs,
      postMs: r.postMs,
      totalMs: r.totalMs,
      threads: loaded.threads,
      crossOriginIsolated: self.crossOriginIsolated,
      hardwareConcurrency: navigator.hardwareConcurrency ?? null,
      sessionReused: loaded.reused,
    };
    scope.info(`transcription ${id} done`, { notes: r.notes.length, seconds: r.audioSeconds, totalMs: Math.round(r.totalMs), threads: loaded.threads });
    post({ type: 'complete', id, summary });
  } catch (e) {
    const isCancel = e instanceof CancelledError;
    const message = e instanceof Error ? e.message : String(e);
    if (isCancel) scope.warn('transcription cancelled');
    else scope.error(`transcription ${id} failed`, message);
    post({ type: 'error', id, message, stack: e instanceof Error ? e.stack : undefined, cancelled: isCancel || undefined });
  } finally {
    cancelled.delete(id);
  }
}

ctx.onmessage = async ({ data }) => {
  if (!isWorkerRequest(data)) {
    scope.warn('ignored an invalid message', data);
    return;
  }
  if (data.type === 'cancel') {
    if (data.id === currentId) cancelled.add(data.id);
    return;
  }
  if (data.type === 'unload') {
    if (currentId !== null) {
      unloadAfter = true;
      return;
    }
    await ort.release();
    post({ type: 'unloaded' });
    return;
  }
  if (currentId !== null) {
    post({ type: 'error', id: data.id, message: 'Transcription worker is busy with another job' });
    return;
  }
  currentId = data.id;
  try {
    await run(data);
  } finally {
    if (unloadAfter) {
      unloadAfter = false;
      await ort.release();
      post({ type: 'unloaded' });
    }
    currentId = null;
  }
};
