import { describe, expect, it } from 'vitest';
import { API_KEY_STORAGE_KEY, clearApiKey, loadApiKey, maskKey, redactKey, registerKeyClear, saveApiKey } from './apiKey';

const mem = () => {
  const m = new Map<string, string>();
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};
const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => { throw new Error('denied'); } };

describe('api key storage', () => {
  it('saves a trimmed key under sa3daw.stabilityKey and loads it back', () => {
    const s = mem();
    expect(API_KEY_STORAGE_KEY).toBe('sa3daw.stabilityKey');
    expect(saveApiKey(s, '  sk-abcdef1234  ')).toBe(true);
    expect(s.m.get('sa3daw.stabilityKey')).toBe('sk-abcdef1234');
    expect(loadApiKey(s)).toBe('sk-abcdef1234');
  });
  it('treats a missing or blank key as none and refuses to save a blank one', () => {
    const s = mem();
    expect(loadApiKey(s)).toBeNull();
    expect(saveApiKey(s, '   ')).toBe(false);
    expect(s.m.size).toBe(0);
  });
  it('clears the key', () => {
    const s = mem();
    saveApiKey(s, 'sk-abcdef1234');
    clearApiKey(s);
    expect(loadApiKey(s)).toBeNull();
  });
  it('survives unavailable storage', () => {
    expect(loadApiKey(broken)).toBeNull();
    expect(saveApiKey(broken, 'sk-x1234')).toBe(false);
    expect(() => clearApiKey(broken)).not.toThrow();
    expect(loadApiKey(null)).toBeNull();
    expect(saveApiKey(null, 'sk-x1234')).toBe(false);
  });
});

describe('maskKey and redactKey', () => {
  it('shows only the last four characters', () => {
    expect(maskKey('sk-abcdef1234')).toBe('••••1234');
    expect(maskKey('abc')).toBe('••••');
    expect(maskKey('')).toBe('');
  });
  it('replaces every occurrence of the key in a text', () => {
    expect(redactKey('bad sk-abcdef1234 and sk-abcdef1234', 'sk-abcdef1234')).toBe('bad ••••1234 and ••••1234');
    expect(redactKey('Bearer sk-abcdef1234', 'sk-abcdef1234')).not.toContain('abcdef');
    expect(redactKey('nothing here', '')).toBe('nothing here');
  });
});

describe('registerKeyClear', () => {
  it('removes the key when the clear-all hook runs', async () => {
    const s = mem();
    saveApiKey(s, 'sk-abcdef1234');
    const hooks: Array<() => Promise<void> | void> = [];
    registerKeyClear((h) => void hooks.push(h), s);
    expect(hooks).toHaveLength(1);
    expect(loadApiKey(s)).not.toBeNull();
    await hooks[0]!();
    expect(loadApiKey(s)).toBeNull();
  });
});
