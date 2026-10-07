import { describe, expect, it } from 'vitest';
import { createLogger } from '../log';
import { GenerationError, createGenerationClient, mapGenerationError, type WorkerLike } from './client';
import type { GenerateParams, WorkerRequest } from './protocol';

class FakeWorker implements WorkerLike {
  sent: WorkerRequest[] = [];
  terminated = false;
  onmessage: WorkerLike['onmessage'] = null;
  onerror: WorkerLike['onerror'] = null;
  postMessage(m: WorkerRequest) {
    this.sent.push(m);
  }
  terminate() {
    this.terminated = true;
  }
  emit(data: unknown) {
    this.onmessage?.({ data });
  }
  complete(id: number) {
    this.emit({
      type: 'complete',
      id,
      channels: [new Float32Array(4), new Float32Array(4)],
      sampleRate: 44100,
      stats: { peak: 0.5, rms: 0.1, nonFinite: 0, dims: [1, 2, 4] },
      timings: [{ name: 'total', startMs: 0, endMs: 1234 }],
    });
  }
  get generates() {
    return this.sent.filter((m) => m.type === 'generate');
  }
}

const params = (over: Partial<GenerateParams> = {}): GenerateParams => ({ model: 'small-music', prompt: 'p', seconds: 2, steps: 8, seed: 1, ...over });

function setup() {
  const workers: FakeWorker[] = [];
  const records: unknown[] = [];
  const logger = createLogger({ console: null });
  const client = createGenerationClient({
    createWorker: () => {
      const w = new FakeWorker();
      workers.push(w);
      return w;
    },
    logger,
    record: (r) => records.push(r),
    now: () => 'T',
  });
  return { client, workers, records, logger };
}

describe('generation client', () => {
  it('sends a generate request, reports progress and resolves with the audio and records timing', async () => {
    const { client, workers, records } = setup();
    const seen: string[] = [];
    const p = client.generate(params(), { onProgress: (x) => seen.push(x.stage) });
    const w = workers[0]!;
    expect(w.generates).toEqual([{ type: 'generate', id: 1, ...params() }]);
    w.emit({ type: 'progress', id: 1, stage: 'encode', fraction: 0.2, message: 'Encoding' });
    w.complete(1);
    const out = await p;
    expect(seen).toEqual(['encode']);
    expect(out.channels).toHaveLength(2);
    expect(out.sampleRate).toBe(44100);
    expect(records).toEqual([expect.objectContaining({ id: 1, model: 'small-music', totalMs: 1234, at: 'T', seed: 1 })]);
  });

  it('runs one job at a time in order', async () => {
    const { client, workers } = setup();
    const a = client.generate(params({ seed: 1 }));
    const b = client.generate(params({ seed: 2 }));
    const w = workers[0]!;
    expect(w.generates).toHaveLength(1);
    w.complete(1);
    await a;
    expect(w.generates.map((g) => (g as any).seed)).toEqual([1, 2]);
    w.complete(2);
    await b;
    expect(client.busy()).toBe(false);
  });

  it('cancels a queued job without touching the worker', async () => {
    const { client, workers } = setup();
    const ac = new AbortController();
    const a = client.generate(params());
    const b = client.generate(params({ seed: 2 }), { signal: ac.signal });
    ac.abort();
    await expect(b).rejects.toMatchObject({ code: 'cancelled' });
    workers[0]!.complete(1);
    await a;
    expect(workers[0]!.generates).toHaveLength(1);
  });

  it('cancels the running job at once, tells the worker, and starts the next job only when the worker finishes', async () => {
    const { client, workers } = setup();
    const ac = new AbortController();
    const a = client.generate(params({ seed: 1 }), { signal: ac.signal });
    const b = client.generate(params({ seed: 2 }));
    const w = workers[0]!;
    ac.abort();
    await expect(a).rejects.toMatchObject({ code: 'cancelled' });
    expect(w.sent).toContainEqual({ type: 'cancel', id: 1 });
    expect(w.generates).toHaveLength(1);
    w.emit({ type: 'error', id: 1, message: 'Cancelled', cancelled: true });
    expect(w.generates).toHaveLength(2);
    w.complete(2);
    await b;
  });

  it('rejects immediately for an already aborted signal', async () => {
    const { client, workers } = setup();
    const ac = new AbortController();
    ac.abort();
    await expect(client.generate(params(), { signal: ac.signal })).rejects.toMatchObject({ code: 'cancelled' });
    expect(workers).toHaveLength(0);
  });

  it('maps worker errors to readable messages and continues with the queue', async () => {
    const { client, workers } = setup();
    const a = client.generate(params({ model: 'medium' }));
    const b = client.generate(params());
    const w = workers[0]!;
    w.emit({ type: 'error', id: 1, message: 'Model file onnx/dit_q4.onnx is not installed' });
    await expect(a).rejects.toThrow('Download Medium on the Models screen first');
    w.complete(2);
    await b;
  });

  it('rejects the running job and restarts the worker when the worker crashes', async () => {
    const { client, workers } = setup();
    const a = client.generate(params());
    workers[0]!.onerror?.({ message: 'boom' });
    await expect(a).rejects.toMatchObject({ code: 'worker-crashed' });
    expect(workers[0]!.terminated).toBe(true);
    const b = client.generate(params({ seed: 5 }));
    expect(workers).toHaveLength(2);
    workers[1]!.complete(2);
    await b;
  });

  it('merges worker log messages into the logger', () => {
    const { client, workers, logger } = setup();
    void client.generate(params());
    workers[0]!.emit({ type: 'log', entry: { t: 5, level: 'info', scope: 'gen-worker', message: 'hi' } });
    expect(logger.entries().some((e) => e.scope === 'gen-worker' && e.message === 'hi')).toBe(true);
  });

  it('ignores events for another job id', async () => {
    const { client, workers } = setup();
    const seen: string[] = [];
    const a = client.generate(params(), { onProgress: (p) => seen.push(p.stage) });
    workers[0]!.emit({ type: 'progress', id: 99, stage: 'x', fraction: 0, message: '' });
    workers[0]!.complete(1);
    await a;
    expect(seen).toEqual([]);
  });

  it('unload resolves when the worker confirms, and at once without a worker', async () => {
    const { client, workers } = setup();
    await client.unload();
    void client.generate(params());
    const u = client.unload();
    expect(workers[0]!.sent).toContainEqual({ type: 'unload' });
    workers[0]!.emit({ type: 'unloaded' });
    await u;
  });
});

describe('mapGenerationError', () => {
  it('names the model to download', () => {
    const e = mapGenerationError('Model file onnx/x.onnx is not installed', 'small-sfx');
    expect(e).toBeInstanceOf(GenerationError);
    expect(e.message).toBe('Download Small SFX on the Models screen first');
    expect(e.code).toBe('not-installed');
  });
  it('maps a pack missing from the manifest', () => {
    expect(mapGenerationError('Pack small-sfx is not listed in the model list (not available)', 'small-sfx').code).toBe('not-available');
  });
  it('maps lost WebGPU devices', () => {
    const e = mapGenerationError('Failed to run: GPUDevice was lost: device lost', 'medium');
    expect(e.code).toBe('webgpu-lost');
    expect(e.message).toMatch(/Reload/);
  });
  it('maps out-of-memory with model-specific advice', () => {
    expect(mapGenerationError('Array buffer allocation failed', 'medium').message).toMatch(/Small Music/);
    const small = mapGenerationError('out of memory', 'small-music');
    expect(small.code).toBe('out-of-memory');
    expect(small.message).toMatch(/Free model memory/);
  });
  it('maps missing WebGPU', () => {
    expect(mapGenerationError('WebGPU is unavailable in this browser.', 'small-music').code).toBe('webgpu-unavailable');
  });
  it('passes unknown errors through with the stack as detail', () => {
    const e = mapGenerationError('weird', 'small-music', 'stack');
    expect(e.message).toBe('weird');
    expect(e.detail).toBe('stack');
  });
});
