import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error plain JS modules
import { instrumentPacks } from './manifest.mjs';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'inst-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function pack(id: string, preset: object = { name: 'Grand piano', credits: ['By A'], license: 'CC BY 3.0' }) {
  mkdirSync(join(dir, id, 'samples'), { recursive: true });
  writeFileSync(join(dir, id, 'preset.json'), JSON.stringify(preset));
  writeFileSync(join(dir, id, 'samples', '000.m4a'), Buffer.alloc(100));
  writeFileSync(join(dir, id, 'LICENSE.txt'), 'x'.repeat(7));
  mkdirSync(join(dir, id, '.work'), { recursive: true });
  writeFileSync(join(dir, id, '.work', 'tmp.f32'), Buffer.alloc(5));
}

describe('instrument packs in the manifest', () => {
  it('lists every inst-* folder with its files, sizes, label and credits', () => {
    pack('inst-grand');
    pack('inst-upright', { name: 'Upright piano', credits: [], license: 'CC0 1.0' });
    mkdirSync(join(dir, 'other'));
    const packs = instrumentPacks(dir);
    expect(packs.map((p: any) => p.id)).toEqual(['inst-grand', 'inst-upright']);
    const g = packs[0];
    expect(g).toMatchObject({ label: 'Grand piano', requires: [], credits: ['By A'], license: 'CC BY 3.0' });
    expect(g.files.map((f: any) => f.path)).toEqual(['inst-grand/LICENSE.txt', 'inst-grand/preset.json', 'inst-grand/samples/000.m4a']);
    expect(g.files.find((f: any) => f.path.endsWith('000.m4a')).bytes).toBe(100);
    expect(g.totalBytes).toBe(g.files.reduce((s: number, f: any) => s + f.bytes, 0));
  });

  it('follows a symlinked pack folder', () => {
    const real = mkdtempSync(join(tmpdir(), 'real-'));
    try {
      writeFileSync(join(real, 'preset.json'), JSON.stringify({ name: 'Linked' }));
      symlinkSync(real, join(dir, 'inst-linked'));
      expect(instrumentPacks(dir).map((p: any) => [p.id, p.label])).toEqual([['inst-linked', 'Linked']]);
    } finally {
      rmSync(real, { recursive: true, force: true });
    }
  });

  it('skips folders without a preset.json and a missing models directory', () => {
    mkdirSync(join(dir, 'inst-empty'));
    expect(instrumentPacks(dir)).toEqual([]);
    expect(instrumentPacks(join(dir, 'nope'))).toEqual([]);
  });
});
