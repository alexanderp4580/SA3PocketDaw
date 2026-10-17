import { log as defaultLog, type ScopedLogger } from '../log';
import { redactKey } from '../store/apiKey';
import { GenerationError, type GenerationOutput, type GenerationProgress } from './client';
import { CLOUD_MAX_STEPS, MIN_STEPS } from './steps';
export { CLOUD_MAX_STEPS };
import { CLOUD_MIN_SECONDS } from './length';
import { decodeWav, type DecodedAudio } from './wav';
import { summarizeAudio } from './pipeline';

export const CLOUD_START_URL = 'https://api.stability.ai/v2beta/audio/stable-audio/text-to-audio';
export const cloudResultUrl = (id: string) => `https://api.stability.ai/v2beta/audio/results/${encodeURIComponent(id)}`;
export const CLOUD_MODEL = 'stable-audio-3';
export const CLOUD_POLL_MS = 2000;
export const CLOUD_DEADLINE_MS = 180_000;
export const CLOUD_CREDITS = 8;
const MAX_SEED = 4294967294;
export const CLOUD_STAGE = 'Generating in the cloud';

export interface CloudParams {
  prompt: string;
  seconds: number;
  steps: number;
  seed: number;
}

export interface CloudDeps {
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
  decode?: (bytes: ArrayBuffer) => DecodedAudio;
  /** Resolves after `ms`; rejects when the signal aborts. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  now?: () => number;
  signal?: AbortSignal;
  onProgress?: (p: GenerationProgress) => void;
  logger?: ScopedLogger;
}

export function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new GenerationError('Cancelled', 'cancelled'));
    const t = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(t); reject(new GenerationError('Cancelled', 'cancelled')); };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

const cancelled = () => new GenerationError('Cancelled', 'cancelled');

/** Generates one clip with Stable Audio 3 through Stability AI's REST API. The key is only sent in the request header and never appears in errors or logs. */
export async function generateCloud(params: CloudParams, key: string, deps: CloudDeps = {}): Promise<GenerationOutput> {
  const doFetch = deps.fetch ?? ((u, i) => globalThis.fetch(u, i));
  const decode = deps.decode ?? decodeWav;
  const sleep = deps.sleep ?? abortableSleep;
  const now = deps.now ?? Date.now;
  const signal = deps.signal;
  const scope = deps.logger ?? defaultLog.scope('cloud');
  const safe = (t: string) => redactKey(t, key);
  const headers = { authorization: `Bearer ${key}`, accept: 'audio/*' };
  const duration = Math.max(CLOUD_MIN_SECONDS, params.seconds);
  const steps = Math.max(MIN_STEPS, Math.min(CLOUD_MAX_STEPS, Math.round(params.steps)));
  const seed = Math.max(0, Math.min(MAX_SEED, Math.round(params.seed)));
  const startedAt = now();

  function check() {
    if (signal?.aborted) throw cancelled();
  }
  async function request(url: string, init: RequestInit): Promise<Response> {
    check();
    try {
      return await doFetch(url, { ...init, headers, signal });
    } catch (e) {
      if (signal?.aborted || (e as { name?: string })?.name === 'AbortError') throw cancelled();
      if (e instanceof GenerationError) throw e;
      const raw = safe(e instanceof Error ? e.message : String(e));
      scope.error('cloud request failed before a response', raw);
      throw new GenerationError('Cloud generation needs a network connection. The request did not reach Stability AI: the device may be offline, or the browser blocked access (CORS).', 'network', raw);
    }
  }
  async function failure(res: Response, what: string): Promise<GenerationError> {
    let details = '';
    try {
      const text = await res.text();
      try {
        const j = JSON.parse(text) as { errors?: unknown; message?: unknown };
        details = Array.isArray(j.errors) ? j.errors.map(String).join('; ') : typeof j.message === 'string' ? j.message : '';
      } catch {
        details = text;
      }
    } catch { /* body unreadable */ }
    details = safe(details).replace(/\s+/g, ' ').trim().slice(0, 300);
    const s = res.status;
    const hint =
      s === 401 ? 'The key was not accepted. Check it on the Models screen.'
      : s === 403 ? 'The request was refused: it may have been flagged by content moderation, or this account may not have Stable Audio 3 API access.'
      : s === 429 ? 'Stability AI is rate limiting this key or the account is out of credits. Try again later.'
      : s >= 500 ? 'Stability AI had a server error. Try again later.'
      : s === 404 ? 'Stability AI no longer has this generation.'
      : 'The request was rejected.';
    const message = `${what} failed (HTTP ${s}). ${hint}${details ? ` Details: ${details}` : ''}`;
    scope.error(message);
    return new GenerationError(message, s === 400 || s === 401 || s === 403 || s === 422 ? 'cloud-rejected' : 'failed', details || undefined);
  }

  scope.info('cloud generation started', { duration, steps, seed, promptLength: params.prompt.length });
  deps.onProgress?.({ stage: CLOUD_STAGE, fraction: 0, message: 'Sending the request to Stability AI' });
  const form = new FormData();
  form.append('prompt', params.prompt);
  form.append('model', CLOUD_MODEL);
  form.append('duration', String(duration));
  form.append('seed', String(seed));
  form.append('steps', String(steps));
  form.append('output_format', 'wav');
  const start = await request(CLOUD_START_URL, { method: 'POST', body: form });
  if (start.status !== 202) throw await failure(start, 'Starting the cloud generation');
  let id: unknown;
  try {
    id = ((await start.json()) as { id?: unknown })?.id;
  } catch { /* handled below */ }
  if (typeof id !== 'string' || !id) {
    const m = 'Stability AI sent an unexpected reply (no generation id).';
    scope.error(m);
    throw new GenerationError(m, 'failed');
  }

  for (;;) {
    check();
    if (now() - startedAt >= CLOUD_DEADLINE_MS) {
      scope.error('cloud generation timed out');
      throw new GenerationError('The cloud generation did not finish within 3 minutes. Try again.', 'timeout');
    }
    try {
      await sleep(CLOUD_POLL_MS, signal);
    } catch (e) {
      if (signal?.aborted) throw cancelled();
      throw e;
    }
    check();
    const res = await request(cloudResultUrl(id), { method: 'GET' });
    if (res.status === 202) {
      deps.onProgress?.({ stage: CLOUD_STAGE, fraction: 0, message: `Waiting for Stability AI (${Math.round((now() - startedAt) / 1000)} s)` });
      continue;
    }
    if (res.status !== 200) throw await failure(res, 'Fetching the cloud result');
    let audio: DecodedAudio;
    try {
      audio = decode(await res.arrayBuffer());
    } catch (e) {
      const m = `The audio from Stability AI could not be read: ${safe(e instanceof Error ? e.message : String(e))}`;
      scope.error(m);
      throw new GenerationError(m, 'failed');
    }
    const frames = Math.min(audio.channels[0]?.length ?? 0, Math.round(duration * audio.sampleRate));
    const channels = audio.channels.map((c) => c.slice(0, frames));
    const flat = new Float32Array(frames * channels.length);
    channels.forEach((c, i) => flat.set(c, i * frames));
    const stats = summarizeAudio(flat, [1, channels.length, frames]);
    if (stats.nonFinite > 0 || stats.peak === 0) {
      const m = `The cloud audio is invalid or silent (peak ${stats.peak}, non-finite samples ${stats.nonFinite}). Try another prompt or seed.`;
      scope.error(m);
      throw new GenerationError(m, 'failed');
    }
    const endedAt = now();
    scope.info('cloud generation finished', { ms: endedAt - startedAt, frames, sampleRate: audio.sampleRate });
    return { channels, sampleRate: audio.sampleRate, stats, timings: [{ name: 'total', startMs: startedAt, endMs: endedAt }] };
  }
}
