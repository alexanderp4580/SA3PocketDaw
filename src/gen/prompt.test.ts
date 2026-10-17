import { describe, expect, it } from 'vitest';
import { CLOUD_MODEL_LABEL, MODEL_DEFAULTS, MODEL_LABELS, buildPrompt, randomSeed, sampleModelLabel } from './prompt';

describe('buildPrompt', () => {
  it('adds the sustained-note suffix for music and medium', () => {
    expect(buildPrompt('synth lead', 'small-music')).toBe('synth lead, single sustained note, dry, no reverb, no drums');
    expect(buildPrompt('  warm pad, ', 'medium')).toBe('warm pad, single sustained note, dry, no reverb, no drums');
  });
  it('uses the isolated-sound suffix for sfx', () => {
    expect(buildPrompt('laser zap', 'small-sfx')).toBe('laser zap, single isolated sound, dry');
  });
  it('rejects an empty prompt', () => {
    expect(() => buildPrompt('   ', 'small-music')).toThrow('Prompt is empty');
  });
});

describe('defaults and seed', () => {
  it('defaults to 8 steps and 2 s for every model', () => {
    for (const d of Object.values(MODEL_DEFAULTS)) {
      expect(d.steps).toBe(8);
      expect(d.seconds).toBe(2);
    }
  });
  it('randomSeed returns an unsigned 32-bit integer', () => {
    expect(randomSeed(() => 0)).toBe(0);
    expect(randomSeed(() => 0.999999999999)).toBeLessThanOrEqual(0xffffffff);
    expect(Number.isInteger(randomSeed())).toBe(true);
  });
});

describe('model labels', () => {
  it('names the cloud model without adding it to the on-device labels', () => {
    expect(CLOUD_MODEL_LABEL).toBe('Stable Audio 3 (cloud)');
    expect(Object.keys(MODEL_LABELS)).not.toContain('stable-audio-3');
  });
  it('labels a stored sample by its source', () => {
    expect(sampleModelLabel({ model: 'medium' })).toBe('Medium');
    expect(sampleModelLabel({ model: 'stable-audio-3', source: 'cloud' })).toBe('Stable Audio 3 (cloud)');
    expect(sampleModelLabel({ model: 'old-thing' })).toBe('old-thing');
    expect(sampleModelLabel({})).toBe('');
  });
});
