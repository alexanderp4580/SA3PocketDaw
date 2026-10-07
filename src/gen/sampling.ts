import { SAMPLE_RATE } from './protocol';

export function buildPingPongSchedule(steps: number, sigmaMax = 1): number[] {
  const count = Math.max(1, Math.floor(steps));
  return Array.from({ length: count + 1 }, (_, index) => {
    if (index === 0) return sigmaMax;
    if (index === count) return 0;
    const t = sigmaMax * (1 - index / count);
    const logSnr = 2 - t * 8.2;
    return 1 / (1 + Math.exp(logSnr));
  });
}

/** Medium schedule: the official runtime's DistributionShift (base 0.5, max 1.15, length clamped to 256..4096). */
export function buildMediumSchedule(steps: number, latentLength: number): number[] {
  const count = Math.max(1, Math.floor(steps));
  const sl = Math.min(4096, Math.max(256, latentLength));
  const mu = -(0.5 + ((1.15 - 0.5) * (sl - 256)) / (4096 - 256));
  return Array.from({ length: count + 1 }, (_, i) => {
    const t = 1 - i / count;
    return t / (t + Math.exp(mu) * (1 - t));
  });
}

export function pingPongStep(
  latent: Float32Array,
  velocity: ArrayLike<number>,
  current: number,
  next: number,
  noise: Float32Array | null,
): Float32Array {
  const updated = new Float32Array(latent.length);
  const isFinalStep = next <= 0;
  for (let i = 0; i < latent.length; i += 1) {
    const denoised = latent[i]! - current * velocity[i]!;
    updated[i] = isFinalStep || !noise ? denoised : (1 - next) * denoised + next * noise[i]!;
  }
  return updated;
}

/** Deterministic standard-normal samples (LCG + Box-Muller). */
export function randomNormal(length: number, seed: number): Float32Array {
  let state = seed >>> 0;
  const random = () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return (state + 1) / 4294967297;
  };
  const output = new Float32Array(length);
  for (let i = 0; i < length; i += 2) {
    const radius = Math.sqrt(-2 * Math.log(random()));
    const angle = 2 * Math.PI * random();
    output[i] = radius * Math.cos(angle);
    if (i + 1 < length) output[i + 1] = radius * Math.sin(angle);
  }
  return output;
}

export const LATENT_CHANNELS = 256;

/** Small models run with 6 s of extra context. */
export function smallLatentLength(seconds: number): number {
  return Math.ceil(((seconds + 6) * SAMPLE_RATE) / 8192) * 2;
}

export function mediumLatentLength(seconds: number): number {
  return Math.ceil((seconds * SAMPLE_RATE) / 8192) * 2;
}
