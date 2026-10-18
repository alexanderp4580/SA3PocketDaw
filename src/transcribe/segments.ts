/** Window layout of the ByteDance piano transcription package: 1 s of silence in front, 10 s windows, 5 s hop. */
export const SAMPLE_RATE = 16000;
export const SEGMENT_SAMPLES = 160000;
export const HOP_SAMPLES = 80000;
export const FRAMES_PER_SEGMENT = 1001;
export const PITCHES = 88;
export const PAD_SAMPLES = SAMPLE_RATE;

function paddedLength(audioLength: number): number {
  return Math.ceil((audioLength + PAD_SAMPLES) / SEGMENT_SAMPLES) * SEGMENT_SAMPLES;
}

export function windowCount(audioLength: number): number {
  return Math.floor((paddedLength(audioLength) - SEGMENT_SAMPLES) / HOP_SAMPLES) + 1;
}

/** Window `index` of the padded signal, copied into a new array. */
export function windowAt(audio: Float32Array, index: number): Float32Array {
  if (!Number.isInteger(index) || index < 0 || index >= windowCount(audio.length)) throw new Error(`window ${index} is outside the signal`);
  const out = new Float32Array(SEGMENT_SAMPLES);
  const start = index * HOP_SAMPLES - PAD_SAMPLES; // in audio coordinates
  const from = Math.max(0, start);
  const to = Math.min(audio.length, start + SEGMENT_SAMPLES);
  if (to > from) out.set(audio.subarray(from, to), from - start);
  return out;
}

/** Join per-window [frames, classes] outputs into one array: drop each window's last frame, keep the middle half of inner windows. */
export function deframe(segments: Float32Array[], frames = FRAMES_PER_SEGMENT, classes = PITCHES): { data: Float32Array; frames: number } {
  const n = segments.length;
  if (n === 1) return { data: segments[0]!, frames };
  const s = frames - 1;
  const a = Math.trunc(s * 0.25);
  const b = Math.trunc(s * 0.75);
  const total = b + (n - 2) * (b - a) + (s - a);
  const data = new Float32Array(total * classes);
  let o = 0;
  const put = (seg: Float32Array, from: number, to: number) => {
    data.set(seg.subarray(from * classes, to * classes), o);
    o += (to - from) * classes;
  };
  put(segments[0]!, 0, b);
  for (let i = 1; i < n - 1; i++) put(segments[i]!, a, b);
  put(segments[n - 1]!, a, s);
  return { data, frames: total };
}
