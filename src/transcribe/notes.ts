/** Note extraction from the four regression heads of the ByteDance piano transcription model. Pedal is not used. */
export const PITCHES = 88;
export const FRAMES_PER_SECOND = 100;
export const BEGIN_NOTE = 21;
export const PAD_SECONDS = 1;
const MAX_NOTE_FRAMES = 600;

export interface Heads {
  /** Each head is [frames, 88], row-major. */
  onset: Float32Array;
  offset: Float32Array;
  frame: Float32Array;
  velocity: Float32Array;
}

export interface TranscribedNote {
  /** Seconds from the start of the audio. */
  onset: number;
  offset: number;
  /** MIDI note number, 21..108. */
  pitch: number;
  /** 0..127 as the model reports it. */
  velocity: number;
}

export interface Thresholds {
  onset: number;
  offset: number;
  frame: number;
}
export const DEFAULT_THRESHOLDS: Thresholds = { onset: 0.3, offset: 0.3, frame: 0.1 };

const f32 = Math.fround;

/** Strict local maxima above `threshold` whose `neighbour` samples on each side are monotone; `shift` is the sub-frame position estimate. */
function pickPeaks(reg: Float32Array, frames: number, key: number, threshold: number, neighbour: number, binary: Uint8Array, shift: Float32Array) {
  const x = (n: number) => reg[n * PITCHES + key]!;
  for (let n = neighbour; n < frames - neighbour; n++) {
    if (!(x(n) > threshold)) continue;
    let monotone = true;
    for (let i = 0; i < neighbour; i++) {
      if (x(n - i) < x(n - i - 1) || x(n + i) < x(n + i + 1)) {
        monotone = false;
        break;
      }
    }
    if (!monotone) continue;
    binary[n] = 1;
    const d = f32(x(n + 1) - x(n - 1));
    shift[n] = x(n - 1) > x(n + 1) ? f32(f32(d / f32(x(n) - x(n + 1))) / 2) : f32(f32(d / f32(x(n) - x(n - 1))) / 2);
  }
}

interface Raw {
  onsetFrame: number;
  offsetFrame: number;
  onsetShift: number;
  offsetShift: number;
  velocity: number;
}

/** Walk one key's columns: a note starts at an onset peak and ends at the frame threshold or the offset peak (whichever the package rule picks). */
function detectKey(key: number, frames: number, h: Heads, thresholds: Thresholds, onB: Uint8Array, onS: Float32Array, offB: Uint8Array, offS: Float32Array): Raw[] {
  const at = (a: Float32Array, i: number) => a[i * PITCHES + key]!;
  const out: Raw[] = [];
  let begin: number | null = null;
  let gone: number | null = null;
  let offAt: number | null = null;
  const push = (b: number, fin: number, offsetShift: number) => out.push({ onsetFrame: b, offsetFrame: fin, onsetShift: onS[b]!, offsetShift, velocity: at(h.velocity, b) });
  for (let i = 0; i < frames; i++) {
    if (onB[i] === 1) {
      if (begin !== null) {
        push(begin, Math.max(i - 1, 0), 0);
        gone = offAt = null;
      }
      begin = i;
    }
    if (begin !== null && i > begin) {
      if (at(h.frame, i) <= thresholds.frame && gone === null) gone = i;
      if (offB[i] === 1 && offAt === null) offAt = i;
      if (gone !== null) {
        const fin = offAt !== null && offAt - begin > gone - offAt ? offAt : gone;
        push(begin, fin, offS[fin]!);
        begin = gone = offAt = null;
      }
      if (begin !== null && (i - begin >= MAX_NOTE_FRAMES || i === frames - 1)) {
        push(begin, i, offS[i]!);
        begin = gone = offAt = null;
      }
    }
  }
  return out;
}

/**
 * Notes from the joined head arrays of a signal that was padded with 1 s of silence in front.
 * Times are shifted back by the pad; notes that end inside the pad are dropped.
 * Sorted by onset, then pitch.
 */
export function notesFromHeads(heads: Heads, frames: number, thresholds: Thresholds = DEFAULT_THRESHOLDS): TranscribedNote[] {
  const notes: TranscribedNote[] = [];
  const onB = new Uint8Array(frames);
  const onS = new Float32Array(frames);
  const offB = new Uint8Array(frames);
  const offS = new Float32Array(frames);
  for (let key = 0; key < PITCHES; key++) {
    onB.fill(0);
    onS.fill(0);
    offB.fill(0);
    offS.fill(0);
    pickPeaks(heads.onset, frames, key, thresholds.onset, 2, onB, onS);
    pickPeaks(heads.offset, frames, key, thresholds.offset, 4, offB, offS);
    for (const r of detectKey(key, frames, heads, thresholds, onB, onS, offB, offS)) {
      const offset = f32((r.offsetFrame + r.offsetShift) / FRAMES_PER_SECOND) - PAD_SECONDS;
      if (!(offset > 0)) continue;
      const onset = f32((r.onsetFrame + r.onsetShift) / FRAMES_PER_SECOND) - PAD_SECONDS;
      notes.push({ onset: Math.max(0, onset), offset, pitch: key + BEGIN_NOTE, velocity: Math.trunc(r.velocity * 128) });
    }
  }
  return notes.sort((a, b) => a.onset - b.onset || a.pitch - b.pitch);
}
