import { describe, expect, it } from 'vitest';
import type { Preset, PresetRegion } from './format';
import { heldLevel, regionPlay, regionRate, regionsToPlay, selectRegions, velocityGain, voiceSeconds } from './select';

const region = (over: Partial<PresetRegion>): PresetRegion => ({ file: 0, lokey: 0, hikey: 127, center: 60, lovel: 1, hivel: 127, ...over });
const preset = (regions: PresetRegion[]): Preset => ({ version: 1, id: 't', name: 'T', sampleRate: 44100, credits: [], license: '', files: [{ path: 'a.m4a', frames: 100, channels: 1 }], regions });

describe('selectRegions', () => {
  const p = preset([
    region({ file: 0, lokey: 40, hikey: 50, center: 45, lovel: 1, hivel: 60 }),
    region({ file: 1, lokey: 40, hikey: 50, center: 45, lovel: 61, hivel: 127 }),
    region({ file: 2, lokey: 51, hikey: 60, center: 55, lovel: 1, hivel: 127 }),
    region({ file: 3, lokey: 40, hikey: 60, trigger: 'release', keytrack: 0 }),
  ]);
  it('includes the inclusive key and velocity boundaries', () => {
    expect(selectRegions(p, 40, 1).map((r) => r.file)).toEqual([0]);
    expect(selectRegions(p, 50, 60).map((r) => r.file)).toEqual([0]);
    expect(selectRegions(p, 50, 61).map((r) => r.file)).toEqual([1]);
    expect(selectRegions(p, 51, 127).map((r) => r.file)).toEqual([2]);
  });
  it('selects nothing outside every range', () => {
    expect(selectRegions(p, 39, 64)).toEqual([]);
    expect(selectRegions(p, 61, 64)).toEqual([]);
  });
  it('returns every overlapping layer, once each', () => {
    const q = preset([region({ file: 0, lovel: 1, hivel: 80 }), region({ file: 1, lovel: 60, hivel: 127 })]);
    expect(selectRegions(q, 60, 70).map((r) => r.file)).toEqual([0, 1]);
    expect(selectRegions(q, 60, 59).map((r) => r.file)).toEqual([0]);
  });
  it('keeps release triggers apart from note-on regions', () => {
    expect(selectRegions(p, 45, 100, 'release').map((r) => r.file)).toEqual([3]);
    expect(selectRegions(p, 45, 100, 'attack').map((r) => r.file)).toEqual([1]);
  });
});

describe('playback numbers', () => {
  it('derives the rate from the centre key and tune', () => {
    expect(regionRate(region({ center: 60 }), 72)).toBeCloseTo(2);
    expect(regionRate(region({ center: 60 }), 48)).toBeCloseTo(0.5);
    expect(regionRate(region({ center: 60, tune: 100 }), 60)).toBeCloseTo(2 ** (1 / 12));
    expect(regionRate(region({ center: 60, tune: -1200 }), 72)).toBeCloseTo(1);
    expect(regionRate(region({ center: 60, keytrack: 0 }), 90)).toBeCloseTo(1);
  });
  it('velocity gain is 1 at full velocity and follows the veltrack amount', () => {
    expect(velocityGain(127)).toBeCloseTo(1);
    expect(velocityGain(64)).toBeCloseTo((64 / 127) ** 2);
    expect(velocityGain(64, 0)).toBe(1);
    expect(velocityGain(1, 0.5)).toBeCloseTo(0.5 + 0.5 * (1 / 127) ** 2);
  });
  it('combines volume (dB) with velocity', () => {
    const play = regionPlay(region({ volume: -6.0206, veltrack: 0 }), 60, 10);
    expect(play.gain).toBeCloseTo(0.5, 3);
  });
  it('attenuates release triggers by rt_decay per held second', () => {
    const r = region({ trigger: 'release', rtDecay: 6.0206, veltrack: 0 });
    expect(regionPlay(r, 60, 100, 0).gain).toBeCloseTo(1);
    expect(regionPlay(r, 60, 100, 1).gain).toBeCloseTo(0.5, 3);
    expect(regionPlay(region({ rtDecay: 6 }), 60, 127, 5).gain).toBeCloseTo(1);
  });
  it('envelope defaults and overrides', () => {
    expect(regionsToPlay(preset([region({})]), 60, 100)[0]!.envelope).toEqual({ attack: 0, hold: 0, decay: 0, sustain: 1, release: 0.05 });
    expect(regionsToPlay(preset([region({ attack: 0.1, release: 0.6, sustain: 0.5, hold: 1, decay: 2 })]), 60, 100)[0]!.envelope).toEqual({ attack: 0.1, hold: 1, decay: 2, sustain: 0.5, release: 0.6 });
  });
});

describe('held envelope', () => {
  const env = { attack: 0.1, hold: 1, decay: 2, sustain: 0.5, release: 0.3 };
  it('rises, holds, decays to the sustain level and stays there', () => {
    expect(heldLevel(env, 0)).toBe(0);
    expect(heldLevel(env, 0.05)).toBeCloseTo(0.5);
    expect(heldLevel(env, 0.6)).toBe(1);
    expect(heldLevel(env, 2.1)).toBeCloseTo(0.75);
    expect(heldLevel(env, 10)).toBe(0.5);
  });
  it('has a minimum attack and release', () => {
    expect(heldLevel({ ...env, attack: 0, hold: 0, decay: 0 }, 0.001)).toBeCloseTo(0.5 * 0 + 0.5);
    expect(voiceSeconds({ ...env, release: 0 }, 1)).toBeCloseTo(1.015);
  });
});
