import { describe, expect, it } from 'vitest';
import { readGraphFiles, resolveLayout, wasmThreads } from './layout';

const f = (...paths: string[]) => paths.map((path) => ({ path, bytes: 1 }));
const packs = [
  { id: 'encoder', label: 'e', requires: [], totalBytes: 1, files: f('tokenizer/tokenizer.json', 'tokenizer/tokenizer_config.json', 'onnx/text_encoder_q4.onnx', 'onnx/text_encoder_q4_chunks.json') },
  { id: 'small-music', label: 's', requires: ['encoder'], totalBytes: 1, files: f('onnx/number_conditioner.onnx', 'onnx/dit_q4.onnx', 'onnx/decoder_q4.onnx', 'onnx/dit_q4_chunks.json') },
  { id: 'small-sfx', label: 'x', requires: ['encoder'], totalBytes: 1, files: f('small-sfx/onnx/number_conditioner.onnx', 'small-sfx/onnx/dit_q4.onnx', 'small-sfx/onnx/decoder_q4.onnx') },
  { id: 'medium', label: 'm', requires: ['encoder'], totalBytes: 1, files: f('medium/dit_q4.onnx', 'medium/decoder_fp16.onnx') },
];

describe('resolveLayout', () => {
  it('reads small-music paths from the manifest', () => {
    expect(resolveLayout({ packs }, 'small-music')).toEqual({
      tokenizerJson: 'tokenizer/tokenizer.json',
      tokenizerConfig: 'tokenizer/tokenizer_config.json',
      textEncoder: 'onnx/text_encoder_q4.onnx',
      numberConditioner: 'onnx/number_conditioner.onnx',
      dit: 'onnx/dit_q4.onnx',
      decoder: 'onnx/decoder_q4.onnx',
    });
  });
  it('uses the small-sfx pack directory', () => {
    const l = resolveLayout({ packs }, 'small-sfx');
    expect(l.dit).toBe('small-sfx/onnx/dit_q4.onnx');
    expect(l.numberConditioner).toBe('small-sfx/onnx/number_conditioner.onnx');
  });
  it('has no number conditioner for medium and finds the fp16 decoder', () => {
    const l = resolveLayout({ packs }, 'medium');
    expect(l.numberConditioner).toBeNull();
    expect(l.decoder).toBe('medium/decoder_fp16.onnx');
  });
  it('fails clearly when a pack is not listed', () => {
    expect(() => resolveLayout({ packs: packs.filter((p) => p.id !== 'small-sfx') }, 'small-sfx')).toThrow(/not available/);
    expect(() => resolveLayout({ packs: packs.filter((p) => p.id !== 'encoder') }, 'medium')).toThrow(/encoder/);
  });
});

describe('readGraphFiles', () => {
  const enc = new TextEncoder();
  it('reads the graph and the chunks named by the index', async () => {
    const files: Record<string, Uint8Array> = {
      'medium/dit_q4_chunks.json': enc.encode(JSON.stringify({ chunks: [{ name: 'dit_q4_chunk_0.data' }, { name: 'dit_q4_chunk_1.data' }] })),
      'medium/dit_q4.onnx': Uint8Array.of(1, 2, 3),
      'medium/dit_q4_chunk_0.data': Uint8Array.of(4),
      'medium/dit_q4_chunk_1.data': Uint8Array.of(5, 6),
    };
    const opened: string[] = [];
    const out = await readGraphFiles(async (p) => {
      opened.push(p);
      if (!files[p]) throw new Error(`Model file ${p} is not installed`);
      return new Response(files[p] as unknown as BodyInit);
    }, 'medium/dit_q4.onnx');
    expect(Array.from(out.graph)).toEqual([1, 2, 3]);
    expect(out.externalData.map((e) => [e.path, Array.from(e.data)])).toEqual([
      ['dit_q4_chunk_0.data', [4]],
      ['dit_q4_chunk_1.data', [5, 6]],
    ]);
    expect(opened).toContain('medium/dit_q4_chunk_1.data');
  });
  it('propagates a missing file error', async () => {
    await expect(readGraphFiles(async (p) => { throw new Error(`Model file ${p} is not installed`); }, 'onnx/a.onnx')).rejects.toThrow('is not installed');
  });
});

describe('wasmThreads', () => {
  it('uses 1 thread on Android or without cross-origin isolation', () => {
    expect(wasmThreads({ userAgent: 'Mozilla Android 15', crossOriginIsolated: true, hardwareConcurrency: 8 })).toBe(1);
    expect(wasmThreads({ userAgent: 'X11 Linux', crossOriginIsolated: false, hardwareConcurrency: 8 })).toBe(1);
  });
  it('uses up to 4 threads when isolated', () => {
    expect(wasmThreads({ userAgent: 'X11 Linux', crossOriginIsolated: true, hardwareConcurrency: 8 })).toBe(4);
    expect(wasmThreads({ userAgent: 'X11 Linux', crossOriginIsolated: true, hardwareConcurrency: 2 })).toBe(2);
    expect(wasmThreads({ userAgent: 'X11 Linux', crossOriginIsolated: true })).toBe(4);
  });
});
