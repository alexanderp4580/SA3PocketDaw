import { describe, expect, it } from 'vitest';
import { buildMediumSchedule, buildPingPongSchedule, mediumLatentLength, pingPongStep, randomNormal, smallLatentLength } from './sampling';

describe('buildPingPongSchedule', () => {
  it('starts at sigmaMax, ends at 0 and decreases', () => {
    const s = buildPingPongSchedule(8);
    expect(s).toHaveLength(9);
    expect(s[0]).toBe(1);
    expect(s[8]).toBe(0);
    for (let i = 1; i < s.length; i++) expect(s[i]!).toBeLessThan(s[i - 1]!);
  });
  it('matches the closed form for an interior point', () => {
    const s = buildPingPongSchedule(4);
    expect(s[2]).toBeCloseTo(1 / (1 + Math.exp(2 - 0.5 * 8.2)), 12);
  });
  it('clamps steps to at least 1', () => {
    expect(buildPingPongSchedule(0)).toEqual([1, 0]);
  });
});

describe('buildMediumSchedule', () => {
  it('runs 1..0 with steps+1 points', () => {
    const s = buildMediumSchedule(8, 100);
    expect(s).toHaveLength(9);
    expect(s[0]).toBeCloseTo(1, 12);
    expect(s[8]).toBe(0);
  });
  it('uses mu -0.5 for lengths up to 256', () => {
    const t = 0.5;
    expect(buildMediumSchedule(2, 10)[1]).toBeCloseTo(t / (t + Math.exp(-0.5) * (1 - t)), 12);
  });
  it('uses mu -1.15 for lengths from 4096', () => {
    const t = 0.5;
    expect(buildMediumSchedule(2, 9000)[1]).toBeCloseTo(t / (t + Math.exp(-1.15) * (1 - t)), 12);
  });
});

describe('pingPongStep', () => {
  it('returns the denoised latent on the final step', () => {
    const out = pingPongStep(Float32Array.of(1, 2), Float32Array.of(1, 1), 0.5, 0, null);
    expect(Array.from(out)).toEqual([0.5, 1.5]);
  });
  it('mixes noise with the denoised latent otherwise', () => {
    const out = pingPongStep(Float32Array.of(1), Float32Array.of(1), 0.5, 0.25, Float32Array.of(4));
    expect(out[0]).toBeCloseTo(0.75 * 0.5 + 0.25 * 4, 6);
  });
});

describe('randomNormal', () => {
  it('is deterministic per seed and differs between seeds', () => {
    expect(Array.from(randomNormal(7, 42))).toEqual(Array.from(randomNormal(7, 42)));
    expect(Array.from(randomNormal(7, 42))).not.toEqual(Array.from(randomNormal(7, 43)));
  });
  it('has the requested length, finite values and roughly unit variance', () => {
    const n = randomNormal(20001, 7);
    expect(n).toHaveLength(20001);
    let sum = 0;
    let sq = 0;
    for (const v of n) {
      expect(Number.isFinite(v)).toBe(true);
      sum += v;
      sq += v * v;
    }
    expect(Math.abs(sum / n.length)).toBeLessThan(0.05);
    expect(sq / n.length).toBeGreaterThan(0.9);
    expect(sq / n.length).toBeLessThan(1.1);
  });
});

describe('latent lengths', () => {
  it('small adds 6 s of context; medium does not', () => {
    expect(smallLatentLength(2)).toBe(Math.ceil((8 * 44100) / 8192) * 2);
    expect(mediumLatentLength(2)).toBe(Math.ceil((2 * 44100) / 8192) * 2);
  });
});
