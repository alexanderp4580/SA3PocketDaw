import { describe, expect, it } from 'vitest';
import { SOURCE_STORAGE_KEY, canGenerateAnywhere, cloudBlockedReason, effectiveSource, loadSource, saveSource } from './source';

const mem = () => { const m = new Map<string, string>(); return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };

describe('generation source', () => {
  it('defaults to on-device and persists the cloud choice under sa3daw.genSource', () => {
    const s = mem();
    expect(SOURCE_STORAGE_KEY).toBe('sa3daw.genSource');
    expect(loadSource(s)).toBe('device');
    saveSource(s, 'cloud');
    expect(s.m.get('sa3daw.genSource')).toBe('cloud');
    expect(loadSource(s)).toBe('cloud');
    s.m.set('sa3daw.genSource', 'junk');
    expect(loadSource(s)).toBe('device');
  });
  it('survives unavailable storage', () => {
    const bad = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
    expect(loadSource(bad)).toBe('device');
    expect(() => saveSource(bad, 'cloud')).not.toThrow();
    expect(loadSource(null)).toBe('device');
  });
  it('uses the cloud only while a key is saved', () => {
    expect(effectiveSource('cloud', true)).toBe('cloud');
    expect(effectiveSource('cloud', false)).toBe('device');
    expect(effectiveSource('device', true)).toBe('device');
  });
  it('explains why the cloud is disabled', () => {
    expect(cloudBlockedReason(false)).toMatch(/key/i);
    expect(cloudBlockedReason(true)).toBe('');
  });
});

describe('canGenerateAnywhere', () => {
  const card = (available: boolean, status: string) => ({ available, status });
  it('is true with an available installed model, or with a saved key', () => {
    expect(canGenerateAnywhere([card(true, 'installed')], false)).toBe(true);
    expect(canGenerateAnywhere([], true)).toBe(true);
    expect(canGenerateAnywhere([card(true, 'partial'), card(false, 'installed')], true)).toBe(true);
  });
  it('is false only with neither', () => {
    expect(canGenerateAnywhere([], false)).toBe(false);
    expect(canGenerateAnywhere([card(true, 'partial'), card(false, 'installed'), card(true, 'absent')], false)).toBe(false);
  });
});
