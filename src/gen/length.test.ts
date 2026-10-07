import { describe, expect, it } from 'vitest';
import { MIN_SECONDS, SECONDS_STEP, MAX_SECONDS, parseSeconds, clampSeconds, stepSeconds, outputFrames, loadSeconds, saveSeconds } from './length';
import { smallLatentLength, mediumLatentLength } from './sampling';

describe('parseSeconds', () => {
  it('accepts decimals with dot or comma', () => {
    expect(parseSeconds('1.25')).toBe(1.25);
    expect(parseSeconds(' 3,5 ')).toBe(3.5);
    expect(parseSeconds('2')).toBe(2);
  });
  it('rejects empty, text, negative and non-finite input', () => {
    for (const t of ['', 'abc', '-1', 'Infinity', '1.2.3', 'NaN']) expect(parseSeconds(t)).toBeNull();
  });
});

describe('clampSeconds', () => {
  it('clamps to 0.5 s and the model maximum and rounds to 0.01 s', () => {
    expect(clampSeconds(0.1, 'small-music')).toBe(MIN_SECONDS);
    expect(clampSeconds(999, 'small-music')).toBe(MAX_SECONDS['small-music']);
    expect(clampSeconds(999, 'medium')).toBe(MAX_SECONDS.medium);
    expect(clampSeconds(1.2549, 'small-music')).toBe(1.25);
    expect(clampSeconds(Number.NaN, 'small-music')).toBe(2);
  });
});

describe('stepSeconds', () => {
  it('moves by 0.25 s and stays inside the range', () => {
    expect(SECONDS_STEP).toBe(0.25);
    expect(stepSeconds(1.25, 1, 'small-music')).toBe(1.5);
    expect(stepSeconds(1.3, -1, 'small-music')).toBe(1.05);
    expect(stepSeconds(MIN_SECONDS, -1, 'small-music')).toBe(MIN_SECONDS);
    expect(stepSeconds(MAX_SECONDS['small-music'], 1, 'small-music')).toBe(MAX_SECONDS['small-music']);
  });
});

describe('exact length', () => {
  it('outputFrames is the exact sample count for a float duration', () => {
    expect(outputFrames(1.25, 44100, 1e9)).toBe(55125);
    expect(outputFrames(0.5, 44100, 1e9)).toBe(22050);
    expect(outputFrames(2.37, 44100, 1e9)).toBe(Math.round(2.37 * 44100));
    expect(outputFrames(10, 44100, 1000)).toBe(1000);
  });
  it('latent lengths keep fractional seconds', () => {
    expect(smallLatentLength(1.25)).toBe(Math.ceil((7.25 * 44100) / 8192) * 2);
    expect(mediumLatentLength(1.25)).toBe(Math.ceil((1.25 * 44100) / 8192) * 2);
    expect(mediumLatentLength(1.25)).toBeLessThan(mediumLatentLength(10));
  });
});

describe('persistence', () => {
  const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };
  it('round-trips the last value and ignores garbage', () => {
    const s = mem();
    expect(loadSeconds(s, 'small-music')).toBe(2);
    saveSeconds(s, 1.75);
    expect(loadSeconds(s, 'small-music')).toBe(1.75);
    s.setItem('sa3daw.genSeconds', 'zzz');
    expect(loadSeconds(s, 'small-music')).toBe(2);
    saveSeconds(s, 500);
    expect(loadSeconds(s, 'small-music')).toBe(MAX_SECONDS['small-music']);
  });
  it('works without storage', () => {
    expect(loadSeconds(null, 'medium')).toBe(2);
    expect(() => saveSeconds(null, 3)).not.toThrow();
  });
});
