import { describe, it, expect } from 'vitest';
import { detectPitch, rootFromDetection, midiToName, nameToMidi, midiToHz } from './pitch';

const SR = 44100;
function tone(midi: number, kind: 'sine' | 'saw' | 'pluck', sec = 1.0) {
  const hz = midiToHz(midi);
  const n = Math.round(SR * sec);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const ph = (hz * t) % 1;
    let v: number;
    if (kind === 'sine') v = Math.sin(2 * Math.PI * ph);
    else if (kind === 'saw') v = 2 * ph - 1;
    else v = (Math.sin(2 * Math.PI * ph) + 0.6 * Math.sin(4 * Math.PI * ph) + 0.4 * Math.sin(6 * Math.PI * ph)) * Math.exp(-2.5 * t);
    out[i] = 0.5 * v * Math.min(1, t / 0.01);
  }
  return out;
}

describe('detectPitch', () => {
  for (const kind of ['sine', 'saw', 'pluck'] as const) {
    for (const midi of [36, 48, 60, 69, 81, 93]) {
      it(`${kind} ${midiToName(midi)}`, () => {
        const r = detectPitch(tone(midi, kind), SR);
        expect(Math.abs(r.midi - midi)).toBeLessThan(0.3);
        expect(r.confidence).toBeGreaterThan(0.8);
      });
    }
  }

  it('is low confidence on noise', () => {
    let s = 1;
    const noise = Float32Array.from({ length: SR }, () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1);
    expect(detectPitch(noise, SR).confidence).toBeLessThan(0.7);
  });

  it('is zero confidence on silence and too-short input', () => {
    expect(detectPitch(new Float32Array(SR), SR).confidence).toBe(0);
    expect(detectPitch(new Float32Array(100), SR).confidence).toBe(0);
  });
});

describe('rootFromDetection', () => {
  it('rounds to nearest note', () => {
    expect(rootFromDetection({ midi: 62.4, hz: 300, confidence: 0.95, cents:40, candidates:[] })).toEqual({ midi: 62, cents:40, lowConfidence: false });
    expect(rootFromDetection({ midi: 62.6, hz: 300, confidence: 0.95, cents:-40, candidates:[] }).midi).toBe(63);
  });
  it('falls back to C4 when confidence is low', () => {
    expect(rootFromDetection({ midi: 71, hz: 500, confidence: 0.3, cents:0, candidates:[] })).toEqual({ midi: 60, cents:0, lowConfidence: true });
  });
  it('noise result falls back', () => {
    let s = 7;
    const noise = Float32Array.from({ length: SR }, () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1);
    expect(rootFromDetection(detectPitch(noise, SR)).lowConfidence).toBe(true);
  });
});

describe('note names', () => {
  it('converts both ways', () => {
    expect(midiToName(60)).toBe('C4');
    expect(midiToName(69)).toBe('A4');
    expect(midiToName(61)).toBe('C#4');
    expect(nameToMidi('C4')).toBe(60);
    expect(nameToMidi('a4')).toBe(69);
    expect(nameToMidi('Bb2')).toBe(46);
    expect(nameToMidi('x')).toBeNull();
  });
});
