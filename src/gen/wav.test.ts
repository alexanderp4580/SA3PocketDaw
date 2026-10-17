import { describe, expect, it } from 'vitest';
import { decodeWav } from './wav';

function wav(opts: { format?: number; bits: number; channels: number; rate?: number; frames: number[][]; extensible?: boolean; extra?: boolean; dataSize?: number }): ArrayBuffer {
  const { bits, channels, frames } = opts;
  const rate = opts.rate ?? 44100, bytes = bits / 8, format = opts.format ?? 1;
  const data = new DataView(new ArrayBuffer(frames.length * channels * bytes));
  frames.forEach((f, i) => f.forEach((v, c) => {
    const o = (i * channels + c) * bytes;
    if (bits === 8) data.setUint8(o, Math.round(v * 127 + 128));
    else if (bits === 16) data.setInt16(o, Math.round(v * 32767), true);
    else if (bits === 24) { const n = Math.round(v * 8388607); data.setUint8(o, n & 255); data.setUint8(o + 1, (n >> 8) & 255); data.setUint8(o + 2, (n >> 16) & 255); }
    else if (format === 3) data.setFloat32(o, v, true);
    else data.setInt32(o, Math.round(v * 2147483647), true);
  }));
  const fmtLen = opts.extensible ? 40 : 16;
  const extra = opts.extra ? 14 : 0;
  const out = new DataView(new ArrayBuffer(12 + 8 + fmtLen + extra + 8 + data.byteLength));
  const tag = (o: number, s: string) => [...s].forEach((ch, i) => out.setUint8(o + i, ch.charCodeAt(0)));
  tag(0, 'RIFF'); out.setUint32(4, out.byteLength - 8, true); tag(8, 'WAVE');
  tag(12, 'fmt '); out.setUint32(16, fmtLen, true);
  out.setUint16(20, opts.extensible ? 0xfffe : format, true); out.setUint16(22, channels, true); out.setUint32(24, rate, true);
  out.setUint32(28, rate * channels * bytes, true); out.setUint16(32, channels * bytes, true); out.setUint16(34, bits, true);
  if (opts.extensible) { out.setUint16(36, 22, true); out.setUint16(38, bits, true); out.setUint16(44, format, true); }
  let p = 20 + fmtLen;
  if (opts.extra) { tag(p, 'LIST'); out.setUint32(p + 4, 6, true); p += 14; }
  tag(p, 'data'); out.setUint32(p + 4, opts.dataSize ?? data.byteLength, true);
  new Uint8Array(out.buffer, p + 8).set(new Uint8Array(data.buffer));
  return out.buffer;
}

describe('decodeWav', () => {
  it('decodes 16-bit stereo into one Float32Array per channel', () => {
    const r = decodeWav(wav({ bits: 16, channels: 2, rate: 48000, frames: [[0.5, -0.5], [1, 0], [-1, 0.25]] }));
    expect(r.sampleRate).toBe(48000);
    expect(r.channels).toHaveLength(2);
    expect(r.channels[0]![0]).toBeCloseTo(0.5, 3);
    expect(r.channels[1]![0]).toBeCloseTo(-0.5, 3);
    expect(r.channels[0]![1]).toBeCloseTo(1, 3);
    expect(r.channels[0]![2]).toBeCloseTo(-1, 3);
    expect(r.channels[1]![2]).toBeCloseTo(0.25, 3);
  });
  it('decodes 8, 24 and 32-bit integer and 32-bit float PCM', () => {
    const f = [[0.5], [-0.25]];
    for (const o of [{ bits: 8 }, { bits: 24 }, { bits: 32 }, { bits: 32, format: 3 }]) {
      const r = decodeWav(wav({ ...o, channels: 1, frames: f }));
      expect(r.channels[0]![0]).toBeCloseTo(0.5, o.bits === 8 ? 1 : 3);
      expect(r.channels[0]![1]).toBeCloseTo(-0.25, o.bits === 8 ? 1 : 3);
    }
  });
  it('reads WAVE_FORMAT_EXTENSIBLE and skips unknown chunks', () => {
    const r = decodeWav(wav({ bits: 16, channels: 1, frames: [[0.5], [0.25]], extensible: true, extra: true }));
    expect(r.channels[0]).toHaveLength(2);
    expect(r.channels[0]![1]).toBeCloseTo(0.25, 3);
  });
  it('uses the bytes present when the data size overruns the file', () => {
    const r = decodeWav(wav({ bits: 16, channels: 1, frames: [[0.5], [0.25]], dataSize: 0xffffffff }));
    expect(r.channels[0]).toHaveLength(2);
  });
  it('rejects non-WAV, truncated and unsupported data', () => {
    expect(() => decodeWav(new ArrayBuffer(4))).toThrow(/WAV/);
    expect(() => decodeWav(new TextEncoder().encode('{"errors":["x"]}  padding padding').buffer as ArrayBuffer)).toThrow(/WAV/);
    expect(() => decodeWav(wav({ bits: 16, channels: 1, format: 2, frames: [[0]] }))).toThrow(/format/);
  });
});
