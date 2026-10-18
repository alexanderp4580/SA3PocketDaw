import { describe, expect, it } from 'vitest';
import { FRAMES_PER_SEGMENT, HOP_SAMPLES, SAMPLE_RATE, SEGMENT_SAMPLES, deframe, windowAt, windowCount } from './segments';

describe('windowCount', () => {
  it('pads 1 s in front and the tail to whole 10 s segments, hopping 5 s', () => {
    expect(windowCount(0)).toBe(1);
    expect(windowCount(9 * SAMPLE_RATE)).toBe(1); // 10 s padded -> 1 segment
    expect(windowCount(9 * SAMPLE_RATE + 1)).toBe(3); // 20 s padded -> windows at 0, 5, 10 s
    expect(windowCount(12 * SAMPLE_RATE)).toBe(3); // 13 s padded -> 20 s
    expect(windowCount(19 * SAMPLE_RATE)).toBe(3);
    expect(windowCount(19 * SAMPLE_RATE + 1)).toBe(5); // 30 s padded
  });
});

describe('windowAt', () => {
  const audio = Float32Array.from({ length: 12 * SAMPLE_RATE }, (_, i) => i + 1);
  it('puts 1 s of silence before the audio and zeros after it', () => {
    const w0 = windowAt(audio, 0);
    expect(w0.length).toBe(SEGMENT_SAMPLES);
    expect(w0[SAMPLE_RATE - 1]).toBe(0);
    expect(w0[SAMPLE_RATE]).toBe(1);
    const w2 = windowAt(audio, 2);
    // window 2 starts at padded sample 160000 = audio sample 144000
    expect(w2[0]).toBe(144001);
    // 48000 audio samples remain after audio index 144000
    expect(w2[47999]).toBe(audio.length);
    expect(w2[48000]).toBe(0);
  });
  it('windows overlap by half a segment', () => {
    const w1 = windowAt(audio, 1);
    expect(w1[0]).toBe(HOP_SAMPLES - SAMPLE_RATE + 1);
  });
  it('rejects an index outside the padded signal', () => {
    expect(() => windowAt(audio, 3)).toThrow(/window/);
  });
});

describe('deframe', () => {
  const F = 9;
  const C = 2;
  const segs = [0, 1, 2, 3].map((i) => Float32Array.from({ length: F * C }, (_, k) => i * 100 + Math.floor(k / C)));
  it('matches piano_transcription_inference deframe (reference output for 4 segments of 9 frames)', () => {
    const { data, frames } = deframe(segs, F, C);
    expect(frames).toBe(20);
    expect(Array.from({ length: frames }, (_, f) => data[f * C])).toEqual([0, 1, 2, 3, 4, 5, 102, 103, 104, 105, 202, 203, 204, 205, 302, 303, 304, 305, 306, 307]);
    expect(data[1]).toBe(0);
  });
  it('returns a single segment whole', () => {
    const { data, frames } = deframe([segs[1]!], F, C);
    expect(frames).toBe(F);
    expect(data).toBe(segs[1]);
  });
  it('uses 1001 frames per segment by default', () => {
    expect(FRAMES_PER_SEGMENT).toBe(1001);
    const big = [0, 1, 2].map(() => new Float32Array(1001 * 88));
    expect(deframe(big).frames).toBe(750 + 500 + 750);
  });
});
