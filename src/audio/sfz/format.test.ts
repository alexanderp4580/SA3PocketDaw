import { describe, expect, it } from 'vitest';
import { decodedBytes, normalizePreset, presetDecodedBytes } from './format';

const base = () => ({
  version: 1, id: 'x', name: 'X', sampleRate: 44100, credits: ['A'], license: 'CC0',
  files: [{ path: 'samples/a.m4a', frames: 1000, channels: 1 }, { path: 'samples/b.m4a', frames: 500, channels: 2 }],
  regions: [{ file: 0, lokey: 20, hikey: 30, center: 25, lovel: 1, hivel: 127 }],
});

describe('normalizePreset', () => {
  it('accepts a minimal preset and keeps optional fields', () => {
    const input = base();
    Object.assign(input.regions[0]!, { loopStart: 1, loopEnd: 2, release: 0.6, trigger: 'release', keytrack: 0, oneShot: true, cutoff: 2000 });
    const p = normalizePreset(JSON.parse(JSON.stringify(input)));
    expect(p.regions[0]).toMatchObject({ loopStart: 1, loopEnd: 2, release: 0.6, trigger: 'release', keytrack: 0, oneShot: true, cutoff: 2000 });
    expect(p.credits).toEqual(['A']);
  });
  it.each([
    ['version', (p: any) => (p.version = 2)],
    ['no regions', (p: any) => (p.regions = [])],
    ['bad file index', (p: any) => (p.regions[0].file = 2)],
    ['inverted key range', (p: any) => (p.regions[0].lokey = 40)],
    ['inverted velocity range', (p: any) => (p.regions[0].lovel = 128)],
    ['loop with one end', (p: any) => (p.regions[0].loopStart = 1)],
    ['loop end before start', (p: any) => Object.assign(p.regions[0], { loopStart: 2, loopEnd: 1 })],
    ['absolute path', (p: any) => (p.files[0].path = '/etc/passwd')],
    ['parent path', (p: any) => (p.files[0].path = '../x.m4a')],
    ['channels', (p: any) => (p.files[0].channels = 3)],
    ['non-finite value', (p: any) => (p.regions[0].volume = Infinity)],
  ])('rejects %s', (_name, mutate) => {
    const p = base();
    mutate(p);
    expect(() => normalizePreset(JSON.parse(JSON.stringify(p)))).toThrow();
  });
});

describe('decoded size', () => {
  it('is float32 frames times channels, scaled to the context rate', () => {
    const p = normalizePreset(base());
    expect(decodedBytes(p.files[0]!, 44100)).toBe(4000);
    expect(presetDecodedBytes(p)).toBe(4000 + 4000);
    expect(decodedBytes(p.files[0]!, 44100, 48000)).toBe(Math.ceil((1000 * 48000) / 44100) * 4);
  });
});
