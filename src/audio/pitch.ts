import { log } from '../log';

const scope = log.scope('audio.pitch');

export const MIN_HZ = 30;
export const MAX_HZ = 2000;
export const MIN_CONFIDENCE = 0.7;
const BAND_HZ = 8000;
const LOW_CUT_HZ = 25;
const MAX_HARMONICS = 10;
const HARMONIC_DECAY = 0.85;
const GRID_PER_OCTAVE = 240;
const ATTACK_SKIP_SEC = 0.015;
const MAX_WINDOWS = 10;
/** Standard deviation, in semitones, of the octave prior applied when a pitch hint is given. */
export const HINT_SIGMA_SEMITONES = 6;

export interface PitchCandidate {
  /** Fractional MIDI note. */
  midi: number;
  /** 0..1 relative to the best candidate. */
  score: number;
}

export interface PitchResult {
  /** Fractional MIDI note; 0 when nothing was detected. */
  midi: number;
  hz: number;
  /** 0..1; below MIN_CONFIDENCE the pitch is not trusted. */
  confidence: number;
  /** Offset of `midi` from the nearest whole note, -50..50 cents. */
  cents: number;
  /** Best candidate first. */
  candidates: PitchCandidate[];
}

export interface RootResult {
  midi: number;
  cents: number;
  lowConfidence: boolean;
}

export interface DetectOptions {
  /** Expected note; weights candidates by their distance in semitones from it. */
  hintMidi?: number;
}

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440);
}
export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
export function midiToName(midi: number): string {
  const m = Math.round(midi);
  return `${NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
}
export function nameToMidi(name: string): number | null {
  const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(name.trim());
  if (!m) return null;
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]!.toUpperCase() as 'C'];
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return (Number(m[3]) + 1) * 12 + base + acc;
}


function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]!; re[i] = re[j]!; re[j] = tr;
      const ti = im[i]!; im[i] = im[j]!; im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const xr = re[b]! * cr - im[b]! * ci;
        const xi = re[b]! * ci + im[b]! * cr;
        re[b] = re[a]! - xr; im[b] = im[a]! - xi;
        re[a]! += xr; im[a]! += xi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

interface Spectrum {
  mag: Float32Array;
  binHz: number;
  /** Unpadded window length in samples. */
  n: number;
  rms: number;
}

function spectrumOf(pcm: Float32Array, start: number, n: number, sampleRate: number): Spectrum {
  const m = n * 4;
  const re = new Float64Array(m);
  const im = new Float64Array(m);
  let sq = 0;
  for (let i = 0; i < n; i++) {
    const v = pcm[start + i] ?? 0;
    sq += v * v;
    re[i] = v * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1 || 1)));
  }
  fft(re, im);
  const binHz = sampleRate / m;
  const kmax = Math.min(m / 2, Math.ceil(BAND_HZ / binHz));
  const mag = new Float32Array(kmax + 1);
  for (let k = 0; k <= kmax; k++) mag[k] = Math.hypot(re[k]!, im[k]!);
  return { mag, binHz, n, rms: Math.sqrt(sq / n) };
}

function gridHz(i: number): number {
  return MIN_HZ * Math.pow(2, i / GRID_PER_OCTAVE);
}
const GRID_SIZE = Math.floor(Math.log2(MAX_HZ / MIN_HZ) * GRID_PER_OCTAVE) + 1;

/** Subharmonic-summation score of every grid pitch for one window. */
function windowScores(sp: Spectrum): Float32Array {
  const { mag, binHz } = sp;
  const kLow = Math.ceil(LOW_CUT_HZ / binHz);
  const s = new Float32Array(mag.length);
  let max = 0;
  for (let k = kLow; k < mag.length; k++) {
    s[k] = Math.sqrt(mag[k]!);
    if (s[k]! > max) max = s[k]!;
  }
  const out = new Float32Array(GRID_SIZE);
  if (max === 0) return out;
  let sum = 0;
  for (let k = kLow; k < s.length; k++) {
    s[k]! /= max;
    sum += s[k]!;
  }
  const offset = Math.min(0.4, Math.max(0.04, (1.5 * sum) / (s.length - kLow)));
  const lobeBins = 1;
  for (let i = 0; i < GRID_SIZE; i++) {
    const g = gridHz(i);
    const hMax = Math.min(MAX_HARMONICS, Math.floor(BAND_HZ / g));
    let acc = 0, wsum = 0;
    for (let h = 1; h <= hMax; h++) {
      const f = h * g;
      const tol = Math.max(0.012 * f, lobeBins * binHz * 0.5);
      const lo = Math.max(kLow, Math.floor((f - tol) / binHz));
      const hi = Math.min(s.length - 1, Math.ceil((f + tol) / binHz));
      let peak = 0;
      for (let k = lo; k <= hi; k++) if (s[k]! > peak) peak = s[k]!;
      const w = Math.pow(HARMONIC_DECAY, h - 1);
      acc += w * (peak - offset);
      wsum += w;
    }
    out[i] = wsum > 0 ? acc / wsum : 0;
  }
  return out;
}

/** Peak-picked frequency (Hz) of the strongest bin within [f*(1-tol), f*(1+tol)], or null. */
function localPeak(sp: Spectrum, f: number, tol: number, floor: number): { hz: number; amp: number } | null {
  const { mag, binHz } = sp;
  const lo = Math.max(1, Math.floor((f * (1 - tol)) / binHz));
  const hi = Math.min(mag.length - 2, Math.ceil((f * (1 + tol)) / binHz));
  let best = -1;
  let bv = 0;
  for (let k = lo; k <= hi; k++) {
    if (mag[k]! > bv && mag[k]! >= mag[k - 1]! && mag[k]! >= mag[k + 1]!) {
      bv = mag[k]!;
      best = k;
    }
  }
  if (best < 0 || bv < floor) return null;
  const a = Math.log(mag[best - 1]! + 1e-12), b = Math.log(bv + 1e-12), c = Math.log(mag[best + 1]! + 1e-12);
  const den = a - 2 * b + c;
  const delta = den !== 0 ? (0.5 * (a - c)) / den : 0;
  return { hz: (best + Math.max(-0.5, Math.min(0.5, delta))) * binHz, amp: bv };
}

/** Least-squares f0 from the harmonic peaks near multiples of `f0`; returns the refined f0 and its total peak weight. */
function refineF0(sp: Spectrum, f0: number): { hz: number; weight: number } {
  let cur = f0;
  let weight = 0;
  let globalMax = 0;
  for (let k = 0; k < sp.mag.length; k++) if (sp.mag[k]! > globalMax) globalMax = sp.mag[k]!;
  const floor = globalMax * 0.03;
  for (let iter = 0; iter < 3; iter++) {
    let num = 0, den = 0, wt = 0;
    const hMax = Math.min(8, Math.floor(BAND_HZ / cur));
    for (let h = 1; h <= hMax; h++) {
      const tol = Math.max(0.015, (2 * sp.binHz * 4) / (h * cur));
      const pk = localPeak(sp, h * cur, Math.min(tol, 0.03), floor);
      if (!pk) continue;
      num += pk.amp * h * pk.hz;
      den += pk.amp * h * h;
      wt += pk.amp;
    }
    if (den === 0) break;
    cur = num / den;
    weight = wt;
  }
  return { hz: cur, weight };
}

/** Share of band energy on harmonics of f0 beyond what the same bin coverage would hold by chance, 0..1. */
function harmonicExcess(sp: Spectrum, f0: number, sampleRate: number): number {
  const { mag, binHz, n } = sp;
  const kLow = Math.ceil(LOW_CUT_HZ / binHz);
  const mark = new Uint8Array(mag.length);
  const half = Math.max(0.02 * f0 * 0 , 1.5 * (sampleRate / n));
  for (let h = 1; h * f0 < BAND_HZ; h++) {
    const f = h * f0;
    const tol = Math.max(0.02 * f, half);
    const lo = Math.max(kLow, Math.floor((f - tol) / binHz));
    const hi = Math.min(mag.length - 1, Math.ceil((f + tol) / binHz));
    for (let k = lo; k <= hi; k++) mark[k] = 1;
  }
  let total = 0, on = 0, covered = 0, bins = 0;
  for (let k = kLow; k < mag.length; k++) {
    const p = mag[k]! * mag[k]!;
    total += p;
    bins++;
    if (mark[k]) {
      on += p;
      covered++;
    }
  }
  if (total === 0) return 0;
  const cov = covered / bins;
  return cov >= 1 ? 0 : Math.max(0, (on / total - cov) / (1 - cov));
}

function weightedMedian(values: Array<{ v: number; w: number }>): number {
  const sorted = [...values].sort((a, b) => a.v - b.v);
  const total = sorted.reduce((a, x) => a + x.w, 0);
  let acc = 0;
  for (const x of sorted) {
    acc += x.w;
    if (acc >= total / 2) return x.v;
  }
  return sorted[sorted.length - 1]!.v;
}

function none(): PitchResult {
  return { midi: 0, hz: 0, confidence: 0, cents: 0, candidates: [] };
}

function windowLayout(pcm: Float32Array, sampleRate: number): { starts: number[]; n: number } {
  const len = pcm.length;
  // Start after the attack: past the loudest 512-sample block plus a short margin.
  let peakBlock = 0, peakVal = 0;
  for (let b = 0; b + 512 <= len; b += 512) {
    let sq = 0;
    for (let i = b; i < b + 512; i++) sq += pcm[i]! * pcm[i]!;
    if (sq > peakVal) { peakVal = sq; peakBlock = b; }
  }
  // The first strong block avoids selecting an accidental cycle maximum at the end.
  for (let b=0;b+512<=len;b+=512) {let sq=0;for(let i=b;i<b+512;i++)sq+=pcm[i]!**2;if(sq>=peakVal*.6){peakBlock=b;break;}}
  const after = Math.min(len, peakBlock + 512 + Math.round(ATTACK_SKIP_SEC * sampleRate));
  for (const n of [8192, 4096, 2048]) {
    if (len - after >= n) {
      const hop = Math.max(n / 4, Math.ceil((len - after - n) / (MAX_WINDOWS - 1)));
      const starts: number[] = [];
      for (let s = after; s + n <= len; s += hop) starts.push(s);
      return { starts, n };
    }
  }
  // Very short sound: the whole sample.
  let n = 512;
  while (n * 2 <= len) n *= 2;
  return { starts: [0], n };
}

/**
 * Multi-window subharmonic-summation pitch detection. Windows start after the attack (the whole sample is used for very short sounds),
 * candidates are the peaks of the weighted score curve, the best one is refined from its harmonic peaks and confidence combines
 * excess harmonic energy with agreement between windows.
 */
export function detectPitch(pcm: Float32Array, sampleRate: number, options: DetectOptions = {}): PitchResult {
  if (pcm.length < 512) {
    scope.warn('sample too short for pitch detection', { samples: pcm.length });
    return none();
  }
  const layout = windowLayout(pcm, sampleRate);
  const spectra = layout.starts.map((s) => spectrumOf(pcm, s, layout.n, sampleRate));
  const maxRms = Math.max(...spectra.map((x) => x.rms));
  if (maxRms < 1e-4) {
    scope.info('silent', { maxRms });
    return none();
  }
  const used = spectra.filter((x) => x.rms >= maxRms * 0.05);
  const wsum = used.reduce((a, x) => a + x.rms, 0);
  const combined = new Float32Array(GRID_SIZE);
  for (const sp of used) {
    const sc = windowScores(sp);
    for (let i = 0; i < GRID_SIZE; i++) combined[i]! += (sc[i]! * sp.rms) / wsum;
  }
  if (options.hintMidi !== undefined) {
    for (let i = 0; i < GRID_SIZE; i++) {
      const d = hzToMidi(gridHz(i)) - options.hintMidi;
      const prior = Math.exp(-(d * d) / (2 * HINT_SIGMA_SEMITONES * HINT_SIGMA_SEMITONES));
      combined[i] = combined[i]! > 0 ? combined[i]! * prior : combined[i]!;
    }
  }
  // Peak picking over +-2 semitones.
  const radius = Math.round((2 / 12) * GRID_PER_OCTAVE);
  const peaks: Array<{ i: number; v: number }> = [];
  for (let i = 0; i < GRID_SIZE; i++) {
    let isMax = combined[i]! > 0;
    for (let j = Math.max(0, i - radius); isMax && j <= Math.min(GRID_SIZE - 1, i + radius); j++) {
      if (combined[j]! > combined[i]! || (combined[j]! === combined[i]! && j < i)) isMax = false;
    }
    if (isMax) peaks.push({ i, v: combined[i]! });
  }
  peaks.sort((a, b) => b.v - a.v);
  if (peaks.length === 0) return none();
  const best = peaks[0]!;

  // Refine per window around the coarse winner.
  const coarseHz = gridHz(best.i);
  const per: Array<{ v: number; w: number }> = [];
  for (const sp of used) {
    const r = refineF0(sp, coarseHz);
    if (r.weight > 0 && Math.abs(12 * Math.log2(r.hz / coarseHz)) < 0.7) per.push({ v: 12 * Math.log2(r.hz / coarseHz), w: r.weight * sp.rms });
  }
  const offsetSemis = per.length > 0 ? weightedMedian(per) : 0;
  const hz = coarseHz * Math.pow(2, offsetSemis / 12);
  const midi = hzToMidi(hz);
  const agree = per.length > 0 ? per.filter((x) => Math.abs(x.v - offsetSemis) < 0.5).reduce((a, x) => a + x.w, 0) / per.reduce((a, x) => a + x.w, 0) : 0;
  // Windows whose own best pitch disagrees also count against consistency.
  let own = 0, ownTotal = 0;
  for (const sp of used) {
    const sc = windowScores(sp);
    let bi = 0;
    for (let i = 1; i < GRID_SIZE; i++) if (sc[i]! > sc[bi]!) bi = i;
    const d = Math.abs(12 * Math.log2(gridHz(bi) / hz));
    ownTotal += sp.rms;
    if (d < 0.5) own += sp.rms;
  }
  const consistency = Math.min(agree, ownTotal > 0 ? own / ownTotal : 0);
  let excess = 0;
  for (const sp of used) excess += (harmonicExcess(sp, hz, sampleRate) * sp.rms) / wsum;
  const confidence = Math.max(0, Math.min(1, excess / 0.5)) * consistency;

  const candidates: PitchCandidate[] = [{ midi, score: 1 }];
  const addCandidate = (m: number, score: number) => {
    if (m < 12 || m > 120) return;
    if (candidates.some((c) => Math.abs(c.midi - m) < 0.7)) return;
    candidates.push({ midi: m, score: Math.max(0, Math.min(1, score)) });
  };
  for (const pk of peaks.slice(1, 6)) addCandidate(hzToMidi(gridHz(pk.i)), pk.v / best.v);
  const at = (m: number) => combined[Math.max(0, Math.min(GRID_SIZE - 1, Math.round(Math.log2(midiToHz(m) / MIN_HZ) * GRID_PER_OCTAVE)))]! / best.v;
  addCandidate(midi + 12, at(midi + 12));
  addCandidate(midi - 12, at(midi - 12));
  candidates.sort((a, b) => b.score - a.score);
  const nearest = Math.round(midi);
  const out: PitchResult = { midi, hz, confidence, cents: Math.round((midi - nearest) * 100), candidates };
  scope.info('detected', { midi, hz, confidence, consistency, excess, windows: used.length, window: layout.n });
  return out;
}

/** Whole note and cents from a detection; below the confidence threshold the hint note (or C4) with zero cents. */
export function rootFromDetection(r: PitchResult, minConfidence = MIN_CONFIDENCE, hintMidi?: number): RootResult {
  if (r.confidence < minConfidence || !(r.midi > 0)) return { midi: hintMidi ?? 60, cents: 0, lowConfidence: true };
  return { midi: Math.round(r.midi), cents: r.cents, lowConfidence: false };
}
