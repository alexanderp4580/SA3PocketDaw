import { describe, it, expect, afterEach, vi } from 'vitest';
import { modelsBaseUrl } from './modelsBase';

const APP = 'https://app.example/sa3/';

afterEach(() => vi.unstubAllEnvs());

describe('modelsBaseUrl', () => {
  it('defaults to models/ under the app base when unset or empty', () => {
    expect(modelsBaseUrl(APP, undefined)).toBe('https://app.example/sa3/models/');
    expect(modelsBaseUrl(APP, '')).toBe('https://app.example/sa3/models/');
  });
  it('returns the configured absolute URL', () => {
    const hf = 'https://huggingface.co/alexanderp4580/sa3-browser-models/resolve/main/';
    expect(modelsBaseUrl(APP, hf)).toBe(hf);
  });
  it('adds a missing trailing slash', () => {
    expect(modelsBaseUrl(APP, 'https://cdn.example/models')).toBe('https://cdn.example/models/');
  });
  it('reads VITE_MODELS_BASE_URL when no override is given', () => {
    vi.stubEnv('VITE_MODELS_BASE_URL', 'https://cdn.example/m');
    expect(modelsBaseUrl(APP)).toBe('https://cdn.example/m/');
  });
});
