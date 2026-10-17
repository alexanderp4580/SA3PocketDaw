export interface DecodedAudio {
  channels: Float32Array[];
  sampleRate: number;
}

/** Decodes PCM (8/16/24/32-bit integer, 32/64-bit float) WAV bytes, including WAVE_FORMAT_EXTENSIBLE, into one array per channel. */
export function decodeWav(buffer: ArrayBuffer): DecodedAudio {
  const v = new DataView(buffer);
  const tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (buffer.byteLength < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('The audio is not a WAV file');
  let fmt: { format: number; channels: number; rate: number; bits: number } | null = null;
  let pos = 12;
  while (pos + 8 <= buffer.byteLength) {
    const id = tag(pos);
    const size = v.getUint32(pos + 4, true);
    const body = pos + 8;
    if (id === 'fmt ' && body + 16 <= buffer.byteLength) {
      let format = v.getUint16(body, true);
      if (format === 0xfffe && size >= 26 && body + 28 <= buffer.byteLength) format = v.getUint16(body + 24, true);
      fmt = { format, channels: v.getUint16(body + 2, true), rate: v.getUint32(body + 4, true), bits: v.getUint16(body + 14, true) };
    } else if (id === 'data') {
      if (!fmt) throw new Error('The WAV file has no format chunk before its data');
      return readPcm(v, body, Math.min(size, buffer.byteLength - body), fmt);
    }
    pos = body + size + (size & 1);
  }
  throw new Error('The WAV file has no audio data');
}

function readPcm(v: DataView, start: number, length: number, f: { format: number; channels: number; rate: number; bits: number }): DecodedAudio {
  const bytes = f.bits / 8;
  const isFloat = f.format === 3 && (f.bits === 32 || f.bits === 64);
  const isInt = f.format === 1 && (f.bits === 8 || f.bits === 16 || f.bits === 24 || f.bits === 32);
  if (!isFloat && !isInt) throw new Error(`Unsupported WAV format (code ${f.format}, ${f.bits}-bit)`);
  if (f.channels < 1 || f.rate < 1) throw new Error('The WAV header is invalid');
  const frames = Math.floor(length / (bytes * f.channels));
  const channels = Array.from({ length: f.channels }, () => new Float32Array(frames));
  for (let i = 0; i < frames; i += 1) {
    for (let c = 0; c < f.channels; c += 1) {
      const o = start + (i * f.channels + c) * bytes;
      let s: number;
      if (isFloat) s = f.bits === 32 ? v.getFloat32(o, true) : v.getFloat64(o, true);
      else if (f.bits === 8) s = (v.getUint8(o) - 128) / 128;
      else if (f.bits === 16) s = v.getInt16(o, true) / 32768;
      else if (f.bits === 24) s = (((v.getUint8(o + 2) << 24) | (v.getUint8(o + 1) << 16) | (v.getUint8(o) << 8)) >> 8) / 8388608;
      else s = v.getInt32(o, true) / 2147483648;
      channels[c]![i] = s;
    }
  }
  return { channels, sampleRate: f.rate };
}
