import { notesFromHeads, type Heads, type TranscribedNote } from './notes';
import { SAMPLE_RATE, deframe, windowAt, windowCount } from './segments';

/** One model call: a 10 s window in, the four [1001, 88] heads out. */
export interface HeadsSession {
  run(window: Float32Array): Promise<Heads>;
}

export class CancelledError extends Error {
  constructor() {
    super('Cancelled');
    this.name = 'CancelledError';
  }
}

export interface PipelineHooks {
  now?: () => number;
  onProgress?: (done: number, total: number) => void;
  isCancelled?: () => boolean;
  /** Lets queued messages (cancel) run between windows. */
  yieldToEvents?: () => Promise<void>;
}

export interface PipelineResult {
  notes: TranscribedNote[];
  audioSeconds: number;
  windows: number;
  frames: number;
  windowMs: number[];
  inferMs: number;
  postMs: number;
  totalMs: number;
}

/** Windows -> model -> deframe -> notes, for mono 16 kHz audio. */
export async function transcribe(audio: Float32Array, session: HeadsSession, hooks: PipelineHooks = {}): Promise<PipelineResult> {
  if (audio.length === 0) throw new Error('There is no audio to transcribe');
  const now = hooks.now ?? (() => performance.now());
  const t0 = now();
  const total = windowCount(audio.length);
  const out: Record<keyof Heads, Float32Array[]> = { onset: [], offset: [], frame: [], velocity: [] };
  const windowMs: number[] = [];
  hooks.onProgress?.(0, total);
  for (let i = 0; i < total; i++) {
    if (hooks.isCancelled?.()) throw new CancelledError();
    const w0 = now();
    const heads = await session.run(windowAt(audio, i));
    windowMs.push(now() - w0);
    for (const k of Object.keys(out) as Array<keyof Heads>) out[k].push(heads[k]);
    hooks.onProgress?.(i + 1, total);
    await hooks.yieldToEvents?.();
  }
  const p0 = now();
  const joined = {} as Heads;
  let frames = 0;
  for (const k of Object.keys(out) as Array<keyof Heads>) {
    const d = deframe(out[k]);
    joined[k] = d.data;
    frames = d.frames;
  }
  const notes = notesFromHeads(joined, frames);
  const end = now();
  return {
    notes,
    audioSeconds: audio.length / SAMPLE_RATE,
    windows: total,
    frames,
    windowMs,
    inferMs: windowMs.reduce((a, b) => a + b, 0),
    postMs: end - p0,
    totalMs: end - t0,
  };
}
