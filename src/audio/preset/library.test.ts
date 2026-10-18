import { describe, expect, it } from 'vitest';
import { normalizePreset } from '../sfz/format';
import { BUILTIN_PRESETS, decodedBudgetBytes, isBuiltinPreset, packIdOf, presetIdOfPack } from './catalog';
import { FakePresetContext } from './fakes';
import { createPresetHost } from './host';
import { createPresetLibrary } from './library';

const presetJson = (id: string) => ({
  version: 1, id, name: id, sampleRate: 44100, credits: ['c'], license: 'x',
  files: [{ path: 'samples/a.m4a', frames: 100, channels: 1 }, { path: 'samples/b.m4a', frames: 100, channels: 1 }],
  regions: [{ file: 0, lokey: 0, hikey: 60, center: 40, lovel: 1, hivel: 127 }, { file: 1, lokey: 61, hikey: 127, center: 70, lovel: 1, hivel: 127 }],
});

describe('catalog', () => {
  it('maps preset ids to pack ids and back', () => {
    expect(packIdOf('grand')).toBe('inst-grand');
    expect(presetIdOfPack('inst-ep-cp80')).toBe('ep-cp80');
    expect(presetIdOfPack('medium')).toBeNull();
    expect(presetIdOfPack('inst-')).toBeNull();
  });
  it('knows the bundled presets', () => {
    expect(BUILTIN_PRESETS.map((p) => p.id)).toEqual(['mini-piano']);
    expect(isBuiltinPreset('mini-piano')).toBe(true);
    expect(isBuiltinPreset('grand')).toBe(false);
  });
  it('shrinks the decoded budget on small devices', () => {
    expect(decodedBudgetBytes(undefined)).toBe(96 * 1024 * 1024);
    expect(decodedBudgetBytes(2)).toBeLessThan(decodedBudgetBytes(4));
    expect(decodedBudgetBytes(8)).toBe(96 * 1024 * 1024);
  });
});

describe('preset host', () => {
  const json = (v: unknown) => new Response(JSON.stringify(v));
  it('reads bundled presets from the app and installed ones from the pack cache', async () => {
    const urls: string[] = [];
    const opened: string[] = [];
    const host = createPresetHost({
      appBase: 'https://app.test/base/',
      fetch: (async (u: string) => { urls.push(u); return json(presetJson('mini-piano')); }) as unknown as typeof fetch,
      openPackFile: async (p) => { opened.push(p); return json(presetJson('grand')); },
    });
    expect((await host.load('mini-piano'))!.id).toBe('mini-piano');
    expect((await host.load('grand'))!.id).toBe('grand');
    expect(urls).toEqual(['https://app.test/base/instruments/mini-piano/preset.json']);
    expect(opened).toEqual(['inst-grand/preset.json']);
  });
  it('an uninstalled pack loads as null and is asked again after invalidate', async () => {
    let installed = false;
    const host = createPresetHost({ appBase: '/', openPackFile: async () => { if (!installed) throw new Error('not installed'); return json(presetJson('grand')); } });
    expect(await host.load('grand')).toBeNull();
    installed = true;
    expect(await host.load('grand')).toBeNull();
    host.invalidate('grand');
    expect((await host.load('grand'))!.id).toBe('grand');
  });
  it('a corrupt preset loads as null', async () => {
    const host = createPresetHost({ appBase: '/', openPackFile: async () => json({ version: 9 }) });
    expect(await host.load('grand')).toBeNull();
  });
});

describe('preset library', () => {
  it('decodes a file through the host when a note needs it and counts decoded bytes', async () => {
    const reads: string[] = [];
    const host = {
      load: async () => normalizePreset(presetJson('grand')),
      read: async (id: string, path: string) => { reads.push(`${id}:${path}`); return new ArrayBuffer(8); },
      invalidate: () => {},
    };
    const lib = createPresetLibrary({ host, decode: async () => ({ duration: 1, length: 1000, numberOfChannels: 2 }), budgetBytes: 1e6 });
    const preset = (await lib.preset('grand'))!;
    const ctx = new FakePresetContext();
    const player = lib.player(ctx, {}, preset, 't1');
    await player.note(70, 0, 1, 1);
    expect(reads).toEqual(['grand:samples/b.m4a']);
    expect(lib.cacheBytes()).toBe(8000);
    expect(ctx.sources).toHaveLength(1);
  });

  it('keeps what a player retains when the budget is exceeded, and invalidate empties the cache', async () => {
    const host = { load: async () => normalizePreset(presetJson('grand')), read: async () => new ArrayBuffer(8), invalidate: () => {} };
    const lib = createPresetLibrary({ host, decode: async () => ({ duration: 1, length: 1000, numberOfChannels: 1 }), budgetBytes: 4000 });
    const preset = (await lib.preset('grand'))!;
    const ctx = new FakePresetContext();
    const a = lib.player(ctx, {}, preset, 'a');
    a.retain([{ midi: 10, velocity: 1 }]);
    await a.prepare([{ midi: 10, velocity: 1 }, { midi: 70, velocity: 1 }]);
    expect(lib.cacheBytes()).toBe(8000);
    lib.invalidate();
    expect(lib.cacheBytes()).toBe(0);
  });
});

describe('bundled mini piano', () => {
  const dir = new URL('../../../public/instruments/mini-piano/', import.meta.url);
  it('matches its catalog entry and stays small', async () => {
    const { existsSync, readFileSync, readdirSync, statSync } = await import('node:fs');
    if (!existsSync(new URL('preset.json', dir))) return;
    const preset = normalizePreset(JSON.parse(readFileSync(new URL('preset.json', dir), 'utf8')));
    const entry = BUILTIN_PRESETS[0]!;
    expect({ id: preset.id, name: preset.name, credits: preset.credits, license: preset.license }).toEqual(entry);
    const total = (d: URL): number => readdirSync(d, { withFileTypes: true }).reduce((s, e) => s + (e.isDirectory() ? total(new URL(`${e.name}/`, d)) : statSync(new URL(e.name, d)).size), 0);
    expect(total(dir)).toBeLessThan(3 * 1024 * 1024);
    for (const f of preset.files) expect(existsSync(new URL(f.path, dir))).toBe(true);
  });
});
