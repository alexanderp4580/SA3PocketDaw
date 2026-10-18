import { describe, expect, it } from 'vitest';
import { MAX_PREVIEW_NOTES, playPreview, previewEvents, type PreviewContext } from './preview';

describe('previewEvents', () => {
  it('maps notes to start, duration and a velocity gain', () => {
    const ev = previewEvents([{ onset: 0.5, offset: 1.5, pitch: 69, velocity: 127 }, { onset: 2, offset: 2.01, pitch: 60, velocity: 0 }]);
    expect(ev[0]).toMatchObject({ when: 0.5, midi: 69, duration: 1 });
    expect(ev[0]!.gain).toBeCloseTo(0.2);
    expect(ev[1]!.duration).toBeCloseTo(0.08);
    expect(ev[1]!.gain).toBeGreaterThan(0);
  });
  it('limits the number of notes', () => {
    const notes = Array.from({ length: MAX_PREVIEW_NOTES + 10 }, (_, i) => ({ onset: i * 0.1, offset: i * 0.1 + 0.1, pitch: 60, velocity: 80 }));
    expect(previewEvents(notes)).toHaveLength(MAX_PREVIEW_NOTES);
  });
});

function fakeContext() {
  const log: string[] = [];
  const ctx: PreviewContext = {
    currentTime: 10,
    destination: {},
    createOscillator: () => {
      const osc = {
        type: 'sine',
        frequency: { value: 0 },
        connect: () => undefined,
        start: (t: number) => log.push(`start ${t}`),
        stop: (t: number) => log.push(`stop ${t}`),
      };
      return osc;
    },
    createGain: () => ({
      gain: {
        value: 0,
        setValueAtTime: () => undefined,
        linearRampToValueAtTime: () => undefined,
        exponentialRampToValueAtTime: () => undefined,
      },
      connect: () => undefined,
    }),
  };
  return { ctx, log };
}

describe('playPreview', () => {
  it('starts one oscillator per note relative to the context clock and reports the length', () => {
    const { ctx, log } = fakeContext();
    const p = playPreview(ctx, [{ onset: 0, offset: 1, pitch: 60, velocity: 80 }, { onset: 1, offset: 2, pitch: 64, velocity: 80 }]);
    expect(log.filter((l) => l.startsWith('start'))).toHaveLength(2);
    expect(log[0]).toBe('start 10.1');
    expect(p.seconds).toBeCloseTo(2.1, 2);
  });
  it('stop silences the oscillators that are still scheduled', () => {
    const { ctx, log } = fakeContext();
    const p = playPreview(ctx, [{ onset: 0, offset: 1, pitch: 60, velocity: 80 }]);
    p.stop();
    expect(log.some((l) => l.startsWith('stop 10'))).toBe(true);
  });
});
