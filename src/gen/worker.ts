import { forwardLogs, log } from '../log';
import { createModelManager } from '../store/modelManager';
import { appBaseUrl, modelsBaseUrl } from '../store/modelsBase';
import { createOrtPorts } from './ortRuntime';
import { CANCEL_MESSAGE, CancelledError, createPipeline } from './pipeline';
import { type GenerateRequest, type WorkerEvent, isWorkerRequest } from './protocol';
import { createTimingRecorder } from './timing';

const ctx = self as unknown as {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent) => void) | null;
};
const scope = log.scope('gen-worker');
const post = (e: WorkerEvent, transfer: Transferable[] = []) => ctx.postMessage(e, transfer);
forwardLogs(log, (m) => ctx.postMessage(m));

const appBase = appBaseUrl();
const models = createModelManager({ baseUrl: modelsBaseUrl(appBase), log });
let manifestPromise: ReturnType<typeof models.loadManifest> | null = null;
const loadManifest = () => (manifestPromise ??= models.loadManifest().catch((e) => {
  manifestPromise = null;
  throw e;
}));

let currentId: number | null = null;
let unloadAfter = false;
const cancelled = new Set<number>();
const pipeline = createPipeline(
  createOrtPorts({
    openFile: (path) => models.openFile(path),
    loadManifest,
    appBase,
    log: scope,
  }),
  scope,
);

async function runGenerate(req: GenerateRequest) {
  const timing = createTimingRecorder();
  const { id } = req;
  try {
    const result = await pipeline.generate(req, {
      timing,
      isCancelled: () => cancelled.has(id),
      progress: (stage, fraction, message) => post({ type: 'progress', id, stage, fraction, message }),
    });
    post({ type: 'timing', id, stages: result.stages });
    post(
      { type: 'complete', id, channels: result.channels, sampleRate: result.sampleRate, stats: result.stats, timings: result.stages },
      result.channels.map((c) => c.buffer),
    );
  } catch (e) {
    const isCancel = e instanceof CancelledError;
    const message = e instanceof Error ? e.message : String(e);
    if (isCancel) scope.warn(CANCEL_MESSAGE);
    else scope.error(`generation ${id} failed`, message);
    post({ type: 'timing', id, stages: timing.stages() });
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
    if (data.id !== currentId) return;
    cancelled.add(data.id);
    scope.info(`cancel requested for ${data.id}; checked between steps`);
    return;
  }
  if (data.type === 'unload') {
    if (currentId !== null) {
      scope.info('unload deferred until the running generation ends');
      unloadAfter = true;
      return;
    }
    await pipeline.unload();
    post({ type: 'unloaded' });
    return;
  }
  if (currentId !== null) {
    post({ type: 'error', id: data.id, message: 'Generation worker is busy with another job' });
    return;
  }
  currentId = data.id;
  try {
    await runGenerate(data);
  } finally {
    if (unloadAfter) {
      unloadAfter = false;
      await pipeline.unload();
      post({ type: 'unloaded' });
    }
    currentId = null;
  }
};
