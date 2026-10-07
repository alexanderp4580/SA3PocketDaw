import { describe, it, expect } from 'vitest';
import { prepareSample, resample } from './samplePrep';

const sine = (hz: number, sr: number, sec: number, amp = 0.5) =>
  Float32Array.from({ length: Math.round(sr * sec) }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / sr));

describe('prepareSample', () => {
  it('returns mono 44.1k and normalizes peak to -1 dBFS', () => {
    const r = prepareSample([sine(440, 44100, 0.5, 0.2)], 44100);
    expect(r.sampleRate).toBe(44100);
    expect(r.peak).toBeCloseTo(Math.pow(10, -1 / 20), 2);
    expect(r.durationSec).toBeGreaterThan(0.4);
  });

  it('mixes stereo to mono', () => {
    const a = sine(440, 44100, 0.3);
    const b = a.map((v) => -v);
    const r = prepareSample([a, b], 44100);
    expect(r.peak).toBe(0); // cancels to silence
    expect(r.pcm.length).toBe(0);
  });

  it('resamples 48k input to 44.1k length', () => {
    const r = prepareSample([sine(440, 48000, 1)], 48000);
    expect(r.sampleRate).toBe(44100);
    expect(r.durationSec).toBeGreaterThan(0.95);
    expect(r.durationSec).toBeLessThan(1.01);
    const rs = resample(sine(440, 48000, 1), 48000, 44100);
    expect(rs.length).toBe(44100);
  });

  it('trims leading and trailing silence but keeps a few ms', () => {
    const sr = 44100;
    const x = new Float32Array(sr * 2);
    x.set(sine(440, sr, 0.5), sr * 0.5);
    const r = prepareSample([x], sr);
    expect(r.durationSec).toBeGreaterThan(0.5);
    expect(r.durationSec).toBeLessThan(0.53);
  });

  it('fades in over 10 ms and out over 40 ms', () => {
    const r = prepareSample([new Float32Array(44100).fill(0.5)], 44100);
    expect(Math.abs(r.pcm[0]!)).toBeLessThan(0.01);
    expect(Math.abs(r.pcm[r.pcm.length - 1]!)).toBeLessThan(0.01);
    const mid = r.pcm[Math.floor(r.pcm.length / 2)]!;
    expect(mid).toBeCloseTo(Math.pow(10, -1 / 20), 2);
    // at 20 ms from end the fade is half done
    const v = r.pcm[r.pcm.length - 1 - Math.round(0.02 * 44100)]!;
    expect(v / mid).toBeGreaterThan(0.4);
    expect(v / mid).toBeLessThan(0.6);
  });

  it('handles silence', () => {
    const r = prepareSample([new Float32Array(1000)], 44100);
    expect(r.pcm.length).toBe(0);
    expect(r.durationSec).toBe(0);
  });
});
