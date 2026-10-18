/** Audio file -> mono 16 kHz Float32Array for the transcriber. Runs on the main thread (decoding needs the Web Audio API). */
export const TARGET_RATE = 16000;

export interface DecodedBuffer {
  sampleRate: number;
  numberOfChannels: number;
  length: number;
  getChannelData(channel: number): Float32Array;
}
export interface DecodeContext {
  decodeAudioData(data: ArrayBuffer): Promise<DecodedBuffer>;
}

export function downmixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0]!;
  const out = new Float32Array(channels[0]!.length);
  for (const c of channels) for (let i = 0; i < out.length; i++) out[i]! += c[i]!;
  const k = 1 / channels.length;
  for (let i = 0; i < out.length; i++) out[i]! *= k;
  return out;
}

const HALF_WIDTH = 24; // zero crossings of the low-pass kernel on each side
const CUTOFF_SCALE = 0.97; // low-pass edge as a fraction of the lower Nyquist frequency

function bessel0(x: number): number {
  let sum = 1;
  let term = 1;
  for (let k = 1; k < 30; k++) {
    term *= (x / (2 * k)) ** 2;
    sum += term;
  }
  return sum;
}
const KAISER_BETA = 9;
const KAISER_NORM = bessel0(KAISER_BETA);
const kaiser = (t: number) => (Math.abs(t) >= 1 ? 0 : bessel0(KAISER_BETA * Math.sqrt(1 - t * t)) / KAISER_NORM);
const sinc = (x: number) => (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x));

const TABLE_STEPS = 512; // kernel samples per input sample

/** Kaiser-windowed sinc resampler with the cutoff at the lower of the two Nyquist frequencies (kernel read from a table with linear interpolation). */
export function resampleSinc(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input;
  const outLength = Math.round((input.length * toRate) / fromRate);
  const out = new Float32Array(outLength);
  const ratio = fromRate / toRate;
  const cutoff = Math.min(1, toRate / fromRate) * CUTOFF_SCALE; // fraction of the input Nyquist
  const half = Math.ceil(HALF_WIDTH / cutoff);
  const size = half * TABLE_STEPS;
  const table = new Float64Array(size + 2);
  for (let i = 0; i <= size; i++) {
    const d = i / TABLE_STEPS;
    table[i] = cutoff * sinc(d * cutoff) * kaiser(d / half);
  }
  for (let o = 0; o < outLength; o++) {
    const centre = o * ratio;
    const first = Math.max(0, Math.ceil(centre - half));
    const last = Math.min(input.length - 1, Math.floor(centre + half));
    let acc = 0;
    for (let i = first; i <= last; i++) {
      const p = Math.abs(i - centre) * TABLE_STEPS;
      const k = Math.floor(p);
      const f = p - k;
      acc += input[i]! * (table[k]! + (table[k + 1]! - table[k]!) * f);
    }
    out[o] = acc;
  }
  return out;
}

/** Sample rate stored in a RIFF/WAVE header, or null when the data is not WAV. */
export function sniffWavRate(data: ArrayBuffer): number | null {
  if (data.byteLength < 28) return null;
  const v = new DataView(data);
  const tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
  let pos = 12;
  while (pos + 8 <= data.byteLength) {
    const size = v.getUint32(pos + 4, true);
    if (tag(pos) === 'fmt ' && pos + 16 <= data.byteLength) {
      const rate = v.getUint32(pos + 12, true);
      return rate >= 3000 && rate <= 384000 ? rate : null;
    }
    pos += 8 + size + (size % 2);
  }
  return null;
}

/**
 * Decode an audio file to mono 16 kHz. `createContext(rate)` returns an OfflineAudioContext-like object; browsers resample to its rate while decoding.
 * A WAV file is decoded at its own rate and resampled here (closer to librosa than the browser's resampler); other formats are decoded at 16 kHz.
 */
export async function decodeTo16kMono(data: ArrayBuffer, createContext: (sampleRate: number) => DecodeContext): Promise<Float32Array> {
  let decoded: DecodedBuffer;
  const rate = sniffWavRate(data) ?? TARGET_RATE;
  try {
    decoded = await createContext(rate).decodeAudioData(data);
  } catch (e) {
    throw new Error(`The audio file could not be decoded (${e instanceof Error ? e.message : String(e)})`);
  }
  if (decoded.length === 0) throw new Error('The audio file has no audio');
  const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) => decoded.getChannelData(i));
  return resampleSinc(downmixToMono(channels), decoded.sampleRate, TARGET_RATE);
}
