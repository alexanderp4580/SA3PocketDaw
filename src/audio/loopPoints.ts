import { detectPitch } from './pitch';
import { FADE_SEC, resolveTrim, trimFrames, isFullTrim, type Trim } from './trim';
import { log } from '../log';

const scope = log.scope('audio.loop');

/** A loop region inside a sound, in seconds of that sound. */
export interface LoopRegion { start: number; end: number }
export interface LoopOptions {
  /** Earliest loop start (the attack is skipped). */
  minStart?: number;
  /** Largest accepted crossfade mismatch, 0 (identical) .. 2 (opposite). */
  maxMismatch?: number;
}

export const LOOP_MIN_START_SEC = 0.15;
/** Shortest input that is searched at all. */
export const LOOP_MIN_INPUT_SEC = 0.5;
export const LOOP_MIN_LENGTH_SEC = 0.12;
export const LOOP_MAX_LENGTH_SEC = 1.2;
export const LOOP_MAX_MISMATCH = 0.2;
/** The crossfade is at most this long and at most a third of the loop. */
export const CROSSFADE_MAX_SEC = 0.03;
const ENV_HOP_SEC = 0.01;
const ENV_WINDOW_SEC = 0.04;
/** The sustained part is the longest run whose RMS stays within this max/min ratio (about 3.5 dB). */
const ENV_STABLE_RATIO = 1.5;
const MIN_REGION_SEC = 0.25;
const REGION_MARGIN_SEC = 0.02;
const MIN_PITCH_CONFIDENCE = 0.5;
const MIN_PERIOD_CORRELATION = 0.8;
const MAX_START_CANDIDATES = 120;
const MAX_LENGTH_CANDIDATES = 48;
const COMPARE_STRIDE = 4;
const SILENCE = 1e-4;

/** Frames of the equal-power crossfade for a loop of `loopFrames`. */
export function crossfadeFrames(sampleRate: number, loopFrames: number): number {
  return Math.max(1, Math.min(Math.round(CROSSFADE_MAX_SEC * sampleRate), Math.floor(loopFrames / 3)));
}

/** RMS envelope: one value per hop over a short window. */
function envelope(pcm: Float32Array, sr: number): { env: Float32Array; hop: number; win: number } {
  const hop = Math.round(ENV_HOP_SEC * sr), win = Math.round(ENV_WINDOW_SEC * sr);
  const sq = new Float64Array(pcm.length + 1);
  for (let i = 0; i < pcm.length; i++) sq[i + 1] = sq[i]! + pcm[i]! * pcm[i]!;
  const n = Math.max(0, Math.floor((pcm.length - win) / hop) + 1);
  const env = new Float32Array(n);
  for (let i = 0; i < n; i++) env[i] = Math.sqrt((sq[i * hop + win]! - sq[i * hop]!) / win);
  return { env, hop, win };
}

/** Longest run of envelope frames, starting at or after `from`, that stays within the stable ratio and well above silence. */
function stableRegion(env: Float32Array, from: number, floor: number): { first: number; last: number } | null {
  let best: { first: number; last: number } | null = null;
  for (let i = from; i < env.length; i++) {
    if (env[i]! < floor) continue;
    let lo = env[i]!, hi = env[i]!, j = i;
    while (j + 1 < env.length && env[j + 1]! >= floor) {
      const v = env[j + 1]!;
      if (Math.max(hi, v) > ENV_STABLE_RATIO * Math.min(lo, v)) break;
      lo = Math.min(lo, v); hi = Math.max(hi, v); j++;
    }
    if (!best || j - i > best.last - best.first) best = { first: i, last: j };
  }
  return best;
}

/** Period in frames (fractional) near sr/hz from the normalised autocorrelation of the middle of the region. */
function refinePeriod(x: Float32Array, from: number, to: number, period: number): number | null {
  const maxLag = Math.ceil(period * 1.05) + 1;
  const n = Math.min(4096, to - from - maxLag);
  if (n < 256) return null;
  const m = from + Math.floor((to - from - n - maxLag) / 2);
  const corr = (lag: number) => {
    let ab = 0, aa = 0, bb = 0;
    for (let i = 0; i < n; i++) { const a = x[m + i]!, b = x[m + i + lag]!; ab += a * b; aa += a * a; bb += b * b; }
    return aa > 0 && bb > 0 ? ab / Math.sqrt(aa * bb) : 0;
  };
  let bestLag = 0, best = -1;
  const lo = Math.max(2, Math.floor(period * 0.95)), hi = Math.ceil(period * 1.05);
  const vals = new Map<number, number>();
  for (let lag = lo - 1; lag <= hi + 1; lag++) vals.set(lag, corr(lag));
  for (let lag = lo; lag <= hi; lag++) { const v = vals.get(lag)!; if (v > best) { best = v; bestLag = lag; } }
  if (best < MIN_PERIOD_CORRELATION) return null;
  const a = vals.get(bestLag - 1)!, b = best, c = vals.get(bestLag + 1)!;
  const denom = a - 2 * b + c;
  return denom < 0 ? bestLag + Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / denom)) : bestLag;
}

/** Normalised difference (0 identical .. 2 opposite) between the `x` frames before `s` and before `e`; correlation is returned too. */
function mismatch(x: Float32Array, s: number, e: number, len: number, stride = 1): { err: number; corr: number } {
  let aa = 0, bb = 0, ab = 0;
  for (let i = 0; i < len; i += stride) { const a = x[s - len + i]!, b = x[e - len + i]!; aa += a * a; bb += b * b; ab += a * b; }
  const sum = aa + bb;
  return { err: sum > 1e-12 ? (aa + bb - 2 * ab) / sum : 2, corr: aa > 0 && bb > 0 ? ab / Math.sqrt(aa * bb) : 0 };
}

/**
 * Finds a loop inside the sustained part of a pitched sound, or null when none is acceptable.
 *
 * The sustained part is the longest run of the RMS envelope that stays within a 1.5 max/min ratio and starts no earlier than
 * `minStart`. The pitch period comes from `detectPitch` refined by autocorrelation. Loop lengths are whole numbers of periods;
 * starts are upward zero crossings. The pair with the smallest mismatch between the material before the start and before the
 * end (the part `bakeLoop` crossfades) wins, and a mismatch above `maxMismatch` gives null. Unpitched, noisy, silent, too short
 * or steadily decaying input gives null.
 */
export function findLoop(pcm: Float32Array, sampleRate: number, options: LoopOptions = {}): LoopRegion | null {
  const minStart = options.minStart ?? LOOP_MIN_START_SEC, maxMismatch = options.maxMismatch ?? LOOP_MAX_MISMATCH;
  if (pcm.length < LOOP_MIN_INPUT_SEC * sampleRate) return null;
  const { env, hop, win } = envelope(pcm, sampleRate);
  let peak = 0;
  for (const v of env) if (v > peak) peak = v;
  if (peak < SILENCE) return null;
  const region = stableRegion(env, Math.ceil((minStart * sampleRate) / hop), peak * 0.1);
  if (!region) return null;
  const margin = Math.round(REGION_MARGIN_SEC * sampleRate);
  const ra = region.first * hop + margin, rb = region.last * hop + win - margin;
  if ((rb - ra) / sampleRate < MIN_REGION_SEC) return null;

  const pitch = detectPitch(pcm.subarray(ra, rb), sampleRate);
  if (!(pitch.hz > 0) || pitch.confidence < MIN_PITCH_CONFIDENCE) { scope.info('no loop: unpitched', { confidence: pitch.confidence }); return null; }
  const period = refinePeriod(pcm, ra, rb, sampleRate / pitch.hz);
  if (period === null) { scope.info('no loop: period not stable'); return null; }

  const maxLen = Math.min(LOOP_MAX_LENGTH_SEC * sampleRate, (rb - ra) * 0.85);
  const kMin = Math.max(1, Math.ceil((LOOP_MIN_LENGTH_SEC * sampleRate) / period)), kMax = Math.floor(maxLen / period);
  if (kMax < kMin) return null;
  const ks: number[] = [];
  const kStep = Math.max(1, Math.ceil((kMax - kMin + 1) / MAX_LENGTH_CANDIDATES));
  for (let k = kMin; k <= kMax; k += kStep) ks.push(k);

  const crossings: number[] = [];
  for (let s = ra + 1; s < rb; s++) if (pcm[s - 1]! <= 0 && pcm[s]! > 0) crossings.push(s);
  const startStep = Math.max(1, Math.ceil(crossings.length / MAX_START_CANDIDATES));
  let best: { s: number; e: number; err: number; score: number } | null = null;
  for (let ci = 0; ci < crossings.length; ci += startStep) {
    const s = crossings[ci]!;
    for (const k of ks) for (let d = -1; d <= 1; d++) {
      const len = Math.round(k * period) + d, e = s + len;
      if (e > rb) continue;
      const x = crossfadeFrames(sampleRate, len);
      if (s - x < 0) continue;
      const { err } = mismatch(pcm, s, e, x, COMPARE_STRIDE);
      const score = err + (0.03 * (maxLen - len)) / maxLen;
      if (!best || score < best.score) best = { s, e, err, score };
    }
  }
  if (!best) return null;
  // Re-measure the winner without stride.
  const exact = mismatch(pcm, best.s, best.e, crossfadeFrames(sampleRate, best.e - best.s)).err;
  if (exact > maxMismatch) { scope.info('no loop: mismatch too high', { mismatch: exact }); return null; }
  const loop = { start: best.s / sampleRate, end: best.e / sampleRate };
  scope.info('loop found', { ...loop, mismatch: exact, periodFrames: period });
  return loop;
}

/**
 * Returns a copy of `pcm` whose region [start,end) loops without a click. The last `crossfade` frames of the region are blended
 * into the frames just before `start` (equal power, compensated for the correlation of the two parts so coherent material keeps
 * its level): the region ends on the sample before `start`. The crossfade is min(30 ms, a third of the loop) and needs that
 * many frames before `start`; otherwise the input is returned unchanged.
 */
export function bakeLoop(pcm: Float32Array, sampleRate: number, loop: LoopRegion): Float32Array {
  const s = Math.round(loop.start * sampleRate), e = Math.round(loop.end * sampleRate);
  if (!(e > s) || e > pcm.length || s < 1) return pcm;
  const x = crossfadeFrames(sampleRate, e - s);
  if (s - x < 0) return pcm;
  const out = pcm.slice();
  const { corr } = mismatch(pcm, s, e, x);
  const c = Math.max(0, corr);
  for (let i = 0; i < x; i++) {
    const t = (i + 1) / x, theta = (Math.PI / 2) * t;
    let a = Math.cos(theta), b = Math.sin(theta);
    const norm = Math.sqrt(a * a + b * b + 2 * c * a * b);
    a /= norm; b /= norm;
    out[e - x + i] = a * pcm[e - x + i]! + b * pcm[s - x + i]!;
  }
  return out;
}

/** Wrapped seam jump (last frame of the region to its first) against the sound's own step sizes. */
export function seamStats(pcm: Float32Array, sampleRate: number, loop: LoopRegion): { jump: number; maxStep: number; typicalStep: number } {
  const s = Math.round(loop.start * sampleRate), e = Math.round(loop.end * sampleRate);
  const steps: number[] = [];
  for (let i = s + 1; i < e; i++) steps.push(Math.abs(pcm[i]! - pcm[i - 1]!));
  steps.sort((a, b) => a - b);
  return { jump: Math.abs(pcm[e - 1]! - pcm[s]!), maxStep: steps[steps.length - 1] ?? 0, typicalStep: steps[Math.floor(steps.length * 0.9)] ?? 0 };
}

/**
 * The loop in the coordinates of the track's chopped sound, or null when there is none or the chop reaches into it. A chop edge
 * carries a 3 ms fade, so a cut edge must lie at least that far outside the loop.
 */
export function trimmedLoop(loop: LoopRegion | undefined, trim: Partial<Trim> | null | undefined, length: number, sampleRate: number): LoopRegion | null {
  if (!loop) return null;
  const duration = length / sampleRate, kept = resolveTrim(trim, duration);
  if (isFullTrim(kept, duration)) return loop;
  const { start, end } = trimFrames(kept, sampleRate, length);
  const fade = FADE_SEC * sampleRate, s = loop.start * sampleRate, e = loop.end * sampleRate;
  if (start > 0 && start + fade > s) return null;
  if (end < length && end - fade < e) return null;
  return { start: (s - start) / sampleRate, end: (e - start) / sampleRate };
}

/** Shape check for a persisted loop; with `duration` it must also lie inside the sound. */
export function normalizeLoop(value: unknown, duration?: number): LoopRegion | undefined {
  const v = value as Partial<Record<'start' | 'end', unknown>> | null | undefined;
  if (!v || typeof v.start !== 'number' || typeof v.end !== 'number' || !Number.isFinite(v.start) || !Number.isFinite(v.end)) return undefined;
  if (v.start < 0 || v.end <= v.start) return undefined;
  if (duration !== undefined && v.end > duration + 1e-6) return undefined;
  return { start: v.start, end: v.end };
}

/** Length of a held preview note: long enough to loop the region and hear several repeats. */
export function loopHoldSeconds(loop: LoopRegion): number {
  return Math.min(6, Math.max(1.5, loop.end + 1.5));
}

/** Display text for a loop region, e.g. "Loop 1.20–2.85 s". */
export function formatLoop(loop: LoopRegion): string {
  return `Loop ${loop.start.toFixed(2)}–${loop.end.toFixed(2)} s`;
}
