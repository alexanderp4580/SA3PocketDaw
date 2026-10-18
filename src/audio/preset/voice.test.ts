import { describe, expect, it } from 'vitest';
import type { PresetRegion } from '../sfz/format';
import { regionPlay } from '../sfz/select';
import { FakeParam, FakePresetContext } from './fakes';
import { scheduleEnvelope, startRegionVoice } from './voice';

const region = (over: Partial<PresetRegion> = {}): PresetRegion => ({ file: 0, lokey: 0, hikey: 127, center: 60, lovel: 1, hivel: 127, ...over });
const buffer = (duration: number) => ({ duration });
const env = (o: Partial<{ attack: number; hold: number; decay: number; sustain: number; release: number }> = {}) => ({ attack: 0, hold: 0, decay: 0, sustain: 1, release: 0.5, ...o });

describe('scheduleEnvelope', () => {
  it('ramps up, holds and releases after the note', () => {
    const p = new FakeParam();
    const r = scheduleEnvelope(p, env({ attack: 0.1 }), 0.8, 10, 2);
    expect(p.events[0]).toEqual({ type: 'set', value: 0, time: 10 });
    expect(p.events[1]).toEqual({ type: 'ramp', value: 0.8, time: 10.1 });
    expect(p.events.at(-2)).toEqual({ type: 'set', value: 0.8, time: 12 });
    expect(p.events.at(-1)).toEqual({ type: 'ramp', value: 0, time: 12.5 });
    expect(r.stopAt).toBeCloseTo(12.5);
    expect(r.levelAt(10.05)).toBeCloseTo(0.4);
    expect(r.levelAt(11)).toBeCloseTo(0.8);
    expect(r.levelAt(12.25)).toBeCloseTo(0.4);
    expect(r.levelAt(13)).toBe(0);
  });

  it('decays to the sustain level and releases from there', () => {
    const p = new FakeParam();
    const r = scheduleEnvelope(p, env({ attack: 0, hold: 1, decay: 2, sustain: 0.5, release: 1 }), 1, 0, 10);
    const ramps = p.events.filter((e) => e.type === 'ramp');
    expect(ramps.map((e) => [e.time, e.value])).toContainEqual([3.002, 0.5]);
    expect(r.levelAt(1.5)).toBeCloseTo(0.8755, 3);
    expect(r.levelAt(10.5)).toBeCloseTo(0.25);
  });

  it('cuts the envelope short when the note ends during the decay', () => {
    const p = new FakeParam();
    scheduleEnvelope(p, env({ hold: 0, decay: 4, sustain: 0, release: 1 }), 1, 0, 2);
    const set = p.events.find((e) => e.type === 'set' && e.time === 2)!;
    expect(set.value).toBeCloseTo(0.5, 2);
    expect(p.events.at(-1)).toEqual({ type: 'ramp', value: 0, time: 3 });
  });

  it('a note shorter than the attack ends at the level reached', () => {
    const p = new FakeParam();
    scheduleEnvelope(p, env({ attack: 1 }), 1, 0, 0.25);
    expect(p.events.find((e) => e.type === 'set' && e.time === 0.25)!.value).toBeCloseTo(0.25);
  });

  it('applies a step down to sustain when there is no decay time', () => {
    const p = new FakeParam();
    scheduleEnvelope(p, env({ sustain: 0.4 }), 1, 0, 3);
    expect(p.events.some((e) => e.type === 'set' && e.value === 0.4)).toBe(true);
  });

  it('never releases faster than the minimum', () => {
    const p = new FakeParam();
    const r = scheduleEnvelope(p, env({ release: 0 }), 1, 0, 1);
    expect(r.stopAt).toBeCloseTo(1.015);
  });
});

describe('startRegionVoice', () => {
  it('plays the file at the region rate from the start time', () => {
    const ctx = new FakePresetContext();
    const out = {};
    const play = regionPlay(region({ center: 48 }), 60, 127);
    const v = startRegionVoice(ctx, { play, buffer: buffer(20), when: 1, duration: 2, output: out });
    const s = ctx.sources[0]!;
    expect(s.playbackRate.value).toBeCloseTo(2);
    expect(s.started).toBe(1);
    expect(s.stopped).toBeCloseTo(v.endTime);
    expect(v.endTime).toBeCloseTo(3 + 0.05);
    expect(ctx.gains[0]!.connections).toContain(out);
  });

  it('loops a looped region over its loop points in buffer seconds', () => {
    const ctx = new FakePresetContext();
    startRegionVoice(ctx, { play: regionPlay(region({ loopStart: 2, loopEnd: 5, center: 48 }), 60, 100), buffer: buffer(6), when: 0, duration: 30, output: {} });
    const s = ctx.sources[0]!;
    expect([s.loop, s.loopStart, s.loopEnd]).toEqual([true, 2, 5]);
    expect(s.stopped).toBeCloseTo(30.05);
  });

  it('a one-shot region ignores the note length', () => {
    const ctx = new FakePresetContext();
    const v = startRegionVoice(ctx, { play: regionPlay(region({ oneShot: true }), 60, 100), buffer: buffer(4), when: 0, duration: 0.5, output: {} });
    expect(v.endTime).toBeCloseTo(4.05, 1);
  });

  it('a note that is already late starts now', () => {
    const ctx = new FakePresetContext();
    ctx.currentTime = 5;
    const v = startRegionVoice(ctx, { play: regionPlay(region(), 60, 100), buffer: buffer(10), when: 4, duration: 3, output: {} });
    expect(ctx.sources[0]!.started).toBe(5);
    expect(v.startTime).toBe(5);
  });

  it('inserts a low-pass filter and a panner only when the region asks', () => {
    const plain = new FakePresetContext();
    startRegionVoice(plain, { play: regionPlay(region(), 60, 100), buffer: buffer(1), when: 0, duration: 1, output: {} });
    expect(plain.filters).toHaveLength(0);
    expect(plain.panners).toHaveLength(0);
    const fancy = new FakePresetContext();
    startRegionVoice(fancy, { play: regionPlay(region({ cutoff: 2500, pan: -0.5 }), 60, 100), buffer: buffer(1), when: 0, duration: 1, output: {} });
    expect(fancy.filters[0]!.frequency.value).toBe(2500);
    expect(fancy.panners[0]!.pan.value).toBe(-0.5);
  });

  it('release triggers play at constant gain for the whole file', () => {
    const ctx = new FakePresetContext();
    const play = regionPlay(region({ trigger: 'release', volume: -6.0206, veltrack: 0, keytrack: 0 }), 60, 100);
    const v = startRegionVoice(ctx, { play, buffer: buffer(0.4), when: 2, duration: 0, output: {} });
    const g = ctx.gains[0]!.gain;
    expect(g.events).toEqual([{ type: 'set', value: expect.closeTo(0.5, 3), time: 2 }]);
    expect(v.endTime).toBeCloseTo(2.4);
  });

  it('stop fades from the current level and ends the source', () => {
    const ctx = new FakePresetContext();
    const v = startRegionVoice(ctx, { play: regionPlay(region({ veltrack: 0 }), 60, 100), buffer: buffer(20), when: 0, duration: 10, output: {} });
    v.stop(4, 0.02);
    const g = ctx.gains[0]!.gain;
    expect(g.events.at(-2)).toEqual({ type: 'set', value: 1, time: 4 });
    expect(g.events.at(-1)).toEqual({ type: 'ramp', value: 0, time: 4.02 });
    expect(ctx.sources[0]!.stopped).toBeCloseTo(4.02);
    expect(v.endTime).toBeCloseTo(4.02);
  });
});
