import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, lstatSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error plain JS modules
import { linkModels } from './link-models.mjs';
// @ts-expect-error plain JS modules
import { buildManifest, writeManifest } from './make-manifest.mjs';

let poc: string;
let models: string;

function put(rel: string, content: string | Buffer) {
  const p = join(poc, rel);
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, content);
}
function chunks(name: string, sizes: number[], dir: string, withModel = true) {
  put(`${dir}/${name}_chunks.json`, JSON.stringify({ ...(withModel ? { model: `${name}.onnx` } : {}), chunks: sizes.map((s, i) => ({ name: `${name}_chunk_${i}.data`, size: s })) }));
  sizes.forEach((s, i) => put(`${dir}/${name}_chunk_${i}.data`, Buffer.alloc(s)));
}

beforeEach(() => {
  poc = mkdtempSync(join(tmpdir(), 'poc-'));
  models = mkdtempSync(join(tmpdir(), 'models-'));
  put('models/tokenizer/tokenizer.json', Buffer.alloc(10));
  put('models/tokenizer/tokenizer_config.json', Buffer.alloc(2));
  put('models/onnx/text_encoder_q4.onnx', Buffer.alloc(3));
  chunks('text_encoder_q4', [100, 50], 'models/onnx');
  put('models/onnx/number_conditioner.onnx', Buffer.alloc(4));
  chunks('number_conditioner', [], 'models/onnx');
  put('models/onnx/dit_q4.onnx', Buffer.alloc(5));
  chunks('dit_q4', [20, 30], 'models/onnx');
  put('models/onnx/decoder_q4.onnx', Buffer.alloc(6));
  chunks('decoder_q4', [7], 'models/onnx');
  put('models-medium/dit_q4.onnx', Buffer.alloc(8));
  chunks('dit_q4', [11], 'models-medium', false);
  put('models-medium/decoder_fp16.onnx', Buffer.alloc(9));
  chunks('decoder_fp16', [12, 13], 'models-medium', false);
  put('models-medium/dec_fp16.onnx', Buffer.alloc(99));
  put('models-medium/dit_fp16.onnx', Buffer.alloc(99));
  put('models-medium/dit_fp16.onnx.data', Buffer.alloc(99));
});
afterEach(() => {
  rmSync(poc, { recursive: true, force: true });
  rmSync(models, { recursive: true, force: true });
});

describe('linkModels', () => {
  it('creates symlinks for every pack file and never the unused graphs', () => {
    const linked: string[] = linkModels(poc, models);
    expect(lstatSync(join(models, 'onnx/dit_q4_chunk_1.data')).isSymbolicLink()).toBe(true);
    expect(linked).toContain('medium/decoder_fp16_chunk_1.data');
    expect(linked).toContain('onnx/number_conditioner_chunks.json');
    expect(linked.some((p) => p.includes('dec_fp16') || p.includes('dit_fp16'))).toBe(false);
  });
  it('is repeatable', () => {
    linkModels(poc, models);
    expect(() => linkModels(poc, models)).not.toThrow();
  });
  it('fails on a missing source', () => {
    rmSync(join(poc, 'models/onnx/dit_q4_chunk_1.data'));
    expect(() => linkModels(poc, models)).toThrow(/missing source/);
  });
});

describe('manifest', () => {
  it('lists instrument packs after the model packs and leaves the model packs as they are', () => {
    linkModels(poc, models);
    const before = buildManifest(models);
    mkdirSync(join(models, 'inst-grand/samples'), { recursive: true });
    writeFileSync(join(models, 'inst-grand/preset.json'), JSON.stringify({ name: 'Grand piano', credits: ['Alexander Holm'], license: 'CC BY 3.0' }));
    writeFileSync(join(models, 'inst-grand/samples/000.m4a'), Buffer.alloc(40));
    const after = buildManifest(models);
    expect(after.packs.slice(0, before.packs.length)).toEqual(before.packs);
    const inst = after.packs.slice(before.packs.length);
    expect(inst.map((p: any) => p.id)).toEqual(['inst-grand']);
    expect(inst[0]).toMatchObject({ label: 'Grand piano', requires: [], credits: ['Alexander Holm'], license: 'CC BY 3.0' });
    expect(inst[0].files.map((f: any) => f.path)).toEqual(['inst-grand/preset.json', 'inst-grand/samples/000.m4a']);
  });

  it('lists real sizes with relative paths and per-pack totals', () => {
    linkModels(poc, models);
    const m = buildManifest(models);
    expect(m.version).toBe(1);
    const byId = Object.fromEntries(m.packs.map((p: any) => [p.id, p]));
    expect(byId.encoder.requires).toEqual([]);
    expect(byId['small-music'].requires).toEqual(['encoder']);
    expect(byId.encoder.totalBytes).toBe(10 + 2 + 3 + 150 + byId.encoder.files.find((f: any) => f.path.endsWith('_chunks.json')).bytes);
    expect(byId.medium.files.map((f: any) => f.path)).toContain('medium/dit_q4_chunk_0.data');
    expect(byId['small-music'].files.every((f: any) => !f.path.startsWith('/'))).toBe(true);
    expect(byId['small-music'].totalBytes).toBe(byId['small-music'].files.reduce((s: number, f: any) => s + f.bytes, 0));
  });
  it('lists small-sfx only when models/small-sfx exists', () => {
    linkModels(poc, models);
    expect(buildManifest(models).packs.map((p: any) => p.id)).not.toContain('small-sfx');
    for (const f of ['number_conditioner', 'dit_q4', 'decoder_q4']) {
      mkdirSync(join(models, 'small-sfx/onnx'), { recursive: true });
      writeFileSync(join(models, `small-sfx/onnx/${f}.onnx`), Buffer.alloc(5));
      writeFileSync(join(models, `small-sfx/onnx/${f}_chunks.json`), JSON.stringify({ chunks: [{ name: `${f}_chunk_0.data`, size: 7 }] }));
      writeFileSync(join(models, `small-sfx/onnx/${f}_chunk_0.data`), Buffer.alloc(7));
    }
    const sfx = buildManifest(models).packs.find((p: any) => p.id === 'small-sfx');
    expect(sfx.requires).toEqual(['encoder']);
    expect(sfx.files.map((f: any) => f.path)).toContain('small-sfx/onnx/dit_q4_chunk_0.data');
  });
  it('writes manifest.json', () => {
    linkModels(poc, models);
    writeManifest(models);
    expect(JSON.parse(readFileSync(join(models, 'manifest.json'), 'utf8')).packs).toHaveLength(3);
  });
});

describe('piano transcriber pack', () => {
  it('is listed with no requirements only when models/piano-transcriber exists', () => {
    linkModels(poc, models);
    expect(buildManifest(models).packs.map((p: any) => p.id)).not.toContain('piano-transcriber');
    mkdirSync(join(models, 'piano-transcriber'), { recursive: true });
    writeFileSync(join(models, 'piano-transcriber/piano_note_fp16.onnx'), Buffer.alloc(11));
    const pack = buildManifest(models).packs.find((p: any) => p.id === 'piano-transcriber');
    expect(pack.label).toBe('Piano transcriber (ByteDance)');
    expect(pack.requires).toEqual([]);
    expect(pack.files).toEqual([{ path: 'piano-transcriber/piano_note_fp16.onnx', bytes: 11 }]);
    expect(pack.totalBytes).toBe(11);
  });
  it('is never linked from the PoC folder', () => {
    expect(linkModels(poc, models).some((p: string) => p.startsWith('piano-transcriber'))).toBe(false);
  });
});
