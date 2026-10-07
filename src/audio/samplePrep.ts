import { log } from '../log';

const scope = log.scope('audio.prep');

export const TARGET_RATE = 44100;
export const TRIM_THRESHOLD = 0.01; // relative to peak (-40 dB)
export const TRIM_PAD_SEC = 0.005;
export const FADE_IN_SEC = 0.01;
export const FADE_OUT_SEC = 0.04;
export const TARGET_PEAK_DB = -1;

export interface PreparedSample {
  pcm: Float32Array;
  sampleRate: number;
  durationSec: number;
  peak: number;
}

export function mixToMono(channels: Float32Array[]): Float32Array {
  const first = channels[0];
  if (!first) return new Float32Array(0);
  if (channels.length === 1) return Float32Array.from(first);
  const out = new Float32Array(first.length);
  for (const ch of channels) for (let i = 0; i < out.length; i++) out[i]! += (ch[i] ?? 0) / channels.length;
  return out;
}

/** Linear-interpolation resampler; box-averages when downsampling to limit aliasing. */
export function resample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return input;
  const ratio = from / to;
  const outLen = Math.max(0, Math.round(input.length / ratio));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    if (ratio > 1) {
      const a = Math.floor(pos);
      const b = Math.min(input.length, Math.max(a + 1, Math.ceil(pos + ratio)));
      let sum = 0;
      for (let j = a; j < b; j++) sum += input[j]!;
      out[i] = sum / (b - a);
    } else {
      const a = Math.floor(pos);
      const frac = pos - a;
      const x0 = input[a] ?? 0;
      const x1 = input[Math.min(a + 1, input.length - 1)] ?? x0;
      out[i] = x0 + (x1 - x0) * frac;
    }
  }
  return out;
}

function peakOf(a: Float32Array): number {
  let p = 0;
  for (let i = 0; i < a.length; i++) {
    const v = Math.abs(a[i]!);
    if (v > p) p = v;
  }
  return p;
}

export function prepareSample(channels: Float32Array[], sampleRate: number): PreparedSample {
  let pcm = resample(mixToMono(channels), sampleRate, TARGET_RATE);
  const rawPeak = peakOf(pcm);
  if (rawPeak === 0) {
    scope.warn('silent input', { samples: pcm.length, sampleRate });
    return { pcm: new Float32Array(0), sampleRate: TARGET_RATE, durationSec: 0, peak: 0 };
  }
  const thr = rawPeak * TRIM_THRESHOLD;
  let s = 0;
  while (s < pcm.length && Math.abs(pcm[s]!) < thr) s++;
  let e = pcm.length - 1;
  while (e > s && Math.abs(pcm[e]!) < thr) e--;
  const pad = Math.round(TRIM_PAD_SEC * TARGET_RATE);
  s = Math.max(0, s - pad);
  e = Math.min(pcm.length - 1, e + pad);
  pcm = pcm.slice(s, e + 1);

  const fin = Math.min(pcm.length, Math.round(FADE_IN_SEC * TARGET_RATE));
  for (let i = 0; i < fin; i++) pcm[i]! *= i / fin;
  const fout = Math.min(pcm.length, Math.round(FADE_OUT_SEC * TARGET_RATE));
  for (let i = 0; i < fout; i++) pcm[pcm.length - 1 - i]! *= i / fout;

  const gain = Math.pow(10, TARGET_PEAK_DB / 20) / peakOf(pcm);
  for (let i = 0; i < pcm.length; i++) pcm[i]! *= gain;
  const out = { pcm, sampleRate: TARGET_RATE, durationSec: pcm.length / TARGET_RATE, peak: peakOf(pcm) };
  scope.info('prepared', { inRate: sampleRate, trimmedFrom: s, trimmedTo: e, durationSec: out.durationSec, peak: out.peak });
  return out;
}
