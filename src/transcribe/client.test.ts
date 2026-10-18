import { describe, expect, it } from 'vitest';
import { createLogger } from '../log';
import { TranscribeError, createTranscriberClient, mapTranscribeError, type WorkerLike } from './client';
import type { TranscribeSummary, WorkerRequest } from './protocol';

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
  get jobs() {
    return this.sent.filter((m) => m.type === 'transcribe');
  }
}

const summary = (over: Partial<TranscribeSummary> = {}): TranscribeSummary => ({
  notes: [{ onset: 0, offset: 1, pitch: 60, velocity: 80 }],
  audioSeconds: 12,
  windows: 3,
  frames: 2000,
  windowMs: [100, 110, 120],
  loadMs: 500,
  inferMs: 330,
  postMs: 5,
  totalMs: 340,
  threads: 4,
  crossOriginIsolated: true,
  hardwareConcurrency: 8,
  sessionReused: false,
  ...over,
});

function setup() {
  const workers: FakeWorker[] = [];
  const records: unknown[] = [];
  const client = createTranscriberClient({
    createWorker: () => {
      const w = new FakeWorker();
      workers.push(w);
      return w;
    },
    logger: createLogger({ console: null }),
    record: (r) => records.push(r),
    now: () => 'T',
  });
  return { client, workers, records };
}
const audio = () => new Float32Array(16000);

describe('transcriber client', () => {
  it('starts the worker on first use, transfers the audio and resolves with the summary', async () => {
    const { client, workers, records } = setup();
    const p = client.transcribe(audio(), { name: 'take1.wav' });
    expect(workers).toHaveLength(1);
    expect(workers[0]!.jobs).toHaveLength(1);
    workers[0]!.emit({ type: 'complete', id: workers[0]!.jobs[0]!.id, summary: summary() });
    const r = await p;
    expect(r.notes).toHaveLength(1);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ at: 'T', name: 'take1.wav', noteCount: 1, audioSeconds: 12, threads: 4, crossOriginIsolated: true });
  });

  it('forwards progress for the running job only', async () => {
    const { client, workers } = setup();
    const seen: string[] = [];
    const p = client.transcribe(audio(), { onProgress: (x) => seen.push(`${x.stage}:${x.done}/${x.total}`) });
    const id = workers[0]!.jobs[0]!.id;
    workers[0]!.emit({ type: 'progress', id: id + 5, stage: 'windows', done: 9, total: 9, message: '' });
    workers[0]!.emit({ type: 'progress', id, stage: 'loading', done: 0, total: 1, message: 'Loading' });
    workers[0]!.emit({ type: 'progress', id, stage: 'windows', done: 1, total: 3, message: 'Window 1 of 3' });
    workers[0]!.emit({ type: 'complete', id, summary: summary() });
    await p;
    expect(seen).toEqual(['loading:0/1', 'windows:1/3']);
  });

  it('runs jobs one at a time', async () => {
    const { client, workers } = setup();
    const a = client.transcribe(audio());
    const b = client.transcribe(audio());
    expect(workers[0]!.jobs).toHaveLength(1);
    expect(client.busy()).toBe(true);
    workers[0]!.emit({ type: 'complete', id: workers[0]!.jobs[0]!.id, summary: summary() });
    await a;
    expect(workers[0]!.jobs).toHaveLength(2);
    workers[0]!.emit({ type: 'complete', id: workers[0]!.jobs[1]!.id, summary: summary() });
    await b;
    expect(client.busy()).toBe(false);
  });

  it('cancels through the signal: rejects at once and tells the worker', async () => {
    const { client, workers } = setup();
    const ctl = new AbortController();
    const p = client.transcribe(audio(), { signal: ctl.signal });
    const id = workers[0]!.jobs[0]!.id;
    ctl.abort();
    await expect(p).rejects.toMatchObject({ code: 'cancelled' });
    expect(workers[0]!.sent).toContainEqual({ type: 'cancel', id });
    workers[0]!.emit({ type: 'error', id, message: 'Cancelled', cancelled: true });
    expect(client.busy()).toBe(false);
  });

  it('rejects at once when the signal is already aborted', async () => {
    const { client, workers } = setup();
    const ctl = new AbortController();
    ctl.abort();
    await expect(client.transcribe(audio(), { signal: ctl.signal })).rejects.toMatchObject({ code: 'cancelled' });
    expect(workers).toHaveLength(0);
  });

  it('maps worker errors', async () => {
    const { client, workers } = setup();
    const p = client.transcribe(audio());
    workers[0]!.emit({ type: 'error', id: workers[0]!.jobs[0]!.id, message: 'Model file piano-transcriber/x.onnx is not installed' });
    await expect(p).rejects.toMatchObject({ code: 'not-installed' });
  });

  it('fails the running job when the worker crashes and starts a new worker for the next job', async () => {
    const { client, workers } = setup();
    const p = client.transcribe(audio());
    workers[0]!.onerror?.({ message: 'boom' });
    await expect(p).rejects.toMatchObject({ code: 'worker-crashed' });
    expect(workers[0]!.terminated).toBe(true);
    const q = client.transcribe(audio());
    expect(workers).toHaveLength(2);
    workers[1]!.emit({ type: 'complete', id: workers[1]!.jobs[0]!.id, summary: summary() });
    await q;
  });

  it('unload resolves at once without a worker; with one it waits for the confirmation, then ends the worker', async () => {
    const { client, workers } = setup();
    await client.unload();
    const p = client.transcribe(audio());
    workers[0]!.emit({ type: 'complete', id: workers[0]!.jobs[0]!.id, summary: summary() });
    await p;
    let done = false;
    const u = client.unload().then(() => (done = true));
    expect(workers[0]!.sent.at(-1)).toEqual({ type: 'unload' });
    await Promise.resolve();
    expect(done).toBe(false);
    workers[0]!.emit({ type: 'unloaded' });
    await u;
    expect(done).toBe(true);
    expect(workers[0]!.terminated).toBe(true);
    const q = client.transcribe(audio());
    expect(workers).toHaveLength(2);
    workers[1]!.emit({ type: 'complete', id: workers[1]!.jobs[0]!.id, summary: summary() });
    await q;
  });

  it('passes a thread request to the worker', async () => {
    const { client, workers } = setup();
    void client.transcribe(audio(), { threads: 2 });
    expect(workers[0]!.jobs[0]).toMatchObject({ threads: 2 });
  });

  it('starts a new worker when the thread request changes', async () => {
    const { client, workers } = setup();
    const a = client.transcribe(audio(), { threads: 1 });
    workers[0]!.emit({ type: 'complete', id: workers[0]!.jobs[0]!.id, summary: summary() });
    await a;
    const b = client.transcribe(audio(), { threads: 1 });
    expect(workers).toHaveLength(1);
    workers[0]!.emit({ type: 'complete', id: workers[0]!.jobs[1]!.id, summary: summary() });
    await b;
    void client.transcribe(audio(), { threads: 4 });
    expect(workers).toHaveLength(2);
    expect(workers[0]!.terminated).toBe(true);
  });

  it('keeps the first 40 notes of the last run for the report', async () => {
    const { client, workers } = setup();
    const notes = Array.from({ length: 60 }, (_, i) => ({ onset: i, offset: i + 1, pitch: 60, velocity: 80 }));
    const p = client.transcribe(audio());
    workers[0]!.emit({ type: 'complete', id: workers[0]!.jobs[0]!.id, summary: summary({ notes }) });
    await p;
    expect(client.lastRun()!.noteCount).toBe(60);
    expect(client.lastRun()!.firstNotes).toHaveLength(40);
  });

  it('keeps the last run for the report', async () => {
    const { client, workers } = setup();
    expect(client.lastRun()).toBeNull();
    const p = client.transcribe(audio(), { name: 'a.wav' });
    workers[0]!.emit({ type: 'complete', id: workers[0]!.jobs[0]!.id, summary: summary() });
    await p;
    expect(client.lastRun()).toMatchObject({ name: 'a.wav', noteCount: 1, windowMs: [100, 110, 120] });
  });
});

describe('mapTranscribeError', () => {
  it('maps known messages', () => {
    expect(mapTranscribeError('Model file x is not installed').code).toBe('not-installed');
    expect(mapTranscribeError('not listed in the model list').code).toBe('not-installed');
    expect(mapTranscribeError('Array buffer allocation failed').code).toBe('out-of-memory');
    expect(mapTranscribeError('std::bad_alloc').code).toBe('out-of-memory');
    expect(mapTranscribeError('something else').code).toBe('failed');
    expect(mapTranscribeError('x')).toBeInstanceOf(TranscribeError);
  });
});
