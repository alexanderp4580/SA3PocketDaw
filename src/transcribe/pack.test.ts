import { describe, expect, it } from 'vitest';
import type { Manifest, PackState } from '../store/modelManager';
import { CREDIT_LINE, PACK_ID, PACK_LABEL, modelPath, transcriberPack } from './pack';

const manifest = (withPack = true): Manifest => ({
  version: 1,
  packs: [
    { id: 'encoder', label: 'Text encoder (shared)', requires: [], files: [{ path: 'tokenizer/tokenizer.json', bytes: 10 }], totalBytes: 10 },
    ...(withPack ? [{ id: PACK_ID, label: PACK_LABEL, requires: [], files: [{ path: 'piano-transcriber/note_fp16.onnx', bytes: 58281588 }], totalBytes: 58281588 }] : []),
  ],
});
const state = (status: PackState['status'], present: number): PackState => ({ status, presentFiles: present, totalFiles: 1 });

describe('transcriber pack', () => {
  it('has the agreed id, label and credit line', () => {
    expect(PACK_ID).toBe('piano-transcriber');
    expect(PACK_LABEL).toBe('Piano transcriber (ByteDance)');
    expect(CREDIT_LINE).toBe('Piano transcription model by Qiuqiang Kong et al. (ByteDance), CC BY 4.0, https://zenodo.org/records/4034264');
  });
  it('resolves the ONNX path from the manifest', () => {
    expect(modelPath(manifest())).toBe('piano-transcriber/note_fp16.onnx');
  });
  it('reports a missing pack as not available', () => {
    expect(() => modelPath(manifest(false))).toThrow(/not listed/);
    expect(transcriberPack(manifest(false), {})).toMatchObject({ available: false, status: 'missing', bytes: 0 });
    expect(transcriberPack(null, {})).toMatchObject({ available: false });
  });
  it('summarises size and install state', () => {
    expect(transcriberPack(manifest(), {})).toMatchObject({ available: true, status: 'missing', bytes: 58281588, totalFiles: 1, presentFiles: 0 });
    expect(transcriberPack(manifest(), { [PACK_ID]: state('installed', 1) })).toMatchObject({ status: 'installed', presentFiles: 1 });
    expect(transcriberPack(manifest(), { [PACK_ID]: state('partial', 0) }).status).toBe('partial');
  });
});
