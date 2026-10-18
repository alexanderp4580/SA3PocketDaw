import { describe, expect, it } from 'vitest';
import { decodeTo16kMono, downmixToMono, resampleSinc, sniffWavRate, type DecodedBuffer } from './resample';

const sine = (hz: number, rate: number, seconds: number) => Float32Array.from({ length: Math.round(rate * seconds) }, (_, i) => Math.sin((2 * Math.PI * hz * i) / rate));
const rms = (a: Float32Array, from: number, to: number) => Math.sqrt(a.subarray(from, to).reduce((s, v) => s + v * v, 0) / (to - from));

describe('downmixToMono', () => {
  it('averages channels', () => {
    expect(Array.from(downmixToMono([Float32Array.of(1, 0, -1), Float32Array.of(0, 0, 1)]))).toEqual([0.5, 0, 0]);
  });
  it('returns a single channel unchanged', () => {
    const c = Float32Array.of(1, 2);
    expect(downmixToMono([c])).toBe(c);
  });
});

describe('resampleSinc', () => {
  it('returns the input when the rates match', () => {
    const x = Float32Array.of(1, 2, 3);
    expect(resampleSinc(x, 16000, 16000)).toBe(x);
  });
  it('keeps a 440 Hz tone in phase and amplitude from 44.1 kHz to 16 kHz', () => {
    const out = resampleSinc(sine(440, 44100, 1), 44100, 16000);
    expect(out.length).toBe(16000);
    let worst = 0;
    for (let i = 200; i < out.length - 200; i++) worst = Math.max(worst, Math.abs(out[i]! - Math.sin((2 * Math.PI * 440 * i) / 16000)));
    expect(worst).toBeLessThan(0.01);
  });
  it('removes content above the new Nyquist frequency', () => {
    const out = resampleSinc(sine(12000, 44100, 1), 44100, 16000);
    expect(rms(out, 200, out.length - 200)).toBeLessThan(0.02);
  });
  it('handles upsampling from 8 kHz', () => {
    const out = resampleSinc(sine(300, 8000, 1), 8000, 16000);
    expect(out.length).toBe(16000);
    expect(Math.abs(out[4000]! - Math.sin((2 * Math.PI * 300 * 4000) / 16000))).toBeLessThan(0.01);
  });
  it('returns an empty array for empty input', () => {
    expect(resampleSinc(new Float32Array(0), 44100, 16000).length).toBe(0);
  });
});

function buffer(rate: number, channels: Float32Array[]): DecodedBuffer {
  return { sampleRate: rate, numberOfChannels: channels.length, length: channels[0]!.length, getChannelData: (i) => channels[i]! };
}

function wavHeader(rate: number, extraChunk = false): ArrayBuffer {
  const bytes: number[] = [];
  const str = (s: string) => [...s].forEach((c) => bytes.push(c.charCodeAt(0)));
  const u32 = (n: number) => bytes.push(n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255);
  const u16 = (n: number) => bytes.push(n & 255, n >> 8);
  str('RIFF'); u32(36); str('WAVE');
  if (extraChunk) { str('LIST'); u32(3); bytes.push(1, 2, 3, 0); }
  str('fmt '); u32(16); u16(1); u16(2); u32(rate); u32(rate * 4); u16(4); u16(16);
  str('data'); u32(0);
  return Uint8Array.from(bytes).buffer;
}

describe('sniffWavRate', () => {
  it('reads the sample rate from the fmt chunk, also after another chunk', () => {
    expect(sniffWavRate(wavHeader(44100))).toBe(44100);
    expect(sniffWavRate(wavHeader(22050, true))).toBe(22050);
  });
  it('returns null for other data', () => {
    expect(sniffWavRate(new ArrayBuffer(100))).toBeNull();
    expect(sniffWavRate(new ArrayBuffer(4))).toBeNull();
  });
});

describe('decodeTo16kMono', () => {
  it('decodes a WAV file at its own rate and resamples it here', async () => {
    const asked: number[] = [];
    const out = await decodeTo16kMono(wavHeader(44100), (rate) => {
      asked.push(rate);
      return { decodeAudioData: async () => buffer(44100, [sine(440, 44100, 1)]) };
    });
    expect(asked).toEqual([44100]);
    expect(out.length).toBe(16000);
  });

  it('asks for a 16 kHz context and averages the channels it returns', async () => {
    const asked: number[] = [];
    const out = await decodeTo16kMono(new ArrayBuffer(4), (rate) => {
      asked.push(rate);
      return { decodeAudioData: async () => buffer(16000, [Float32Array.of(1, 1), Float32Array.of(0, -1)]) };
    });
    expect(asked).toEqual([16000]);
    expect(Array.from(out)).toEqual([0.5, 0]);
  });
  it('resamples when the context returns another rate', async () => {
    const out = await decodeTo16kMono(new ArrayBuffer(4), () => ({ decodeAudioData: async () => buffer(22050, [sine(440, 22050, 1)]) }));
    expect(out.length).toBe(16000);
  });
  it('maps a decode failure to a readable error', async () => {
    await expect(
      decodeTo16kMono(new ArrayBuffer(4), () => ({
        decodeAudioData: async () => {
          throw new Error('EncodingError');
        },
      })),
    ).rejects.toThrow(/could not be decoded/i);
  });
  it('rejects silence-free empty audio', async () => {
    await expect(decodeTo16kMono(new ArrayBuffer(4), () => ({ decodeAudioData: async () => buffer(16000, [new Float32Array(0)]) }))).rejects.toThrow(/no audio/i);
  });
});
