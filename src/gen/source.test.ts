import { describe, expect, it } from 'vitest';
import { SOURCE_STORAGE_KEY, cloudBlockedReason, effectiveSource, loadSource, saveSource } from './source';

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
