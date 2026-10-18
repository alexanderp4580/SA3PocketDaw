import type { Manifest, PackState, PackStatus } from '../store/modelManager';

export const PACK_ID = 'piano-transcriber';
export const PACK_LABEL = 'Piano transcriber (ByteDance)';
export const CREDIT_LINE = 'Piano transcription model by Qiuqiang Kong et al. (ByteDance), CC BY 4.0, https://zenodo.org/records/4034264';

/** Path of the ONNX graph inside the pack. */
export function modelPath(manifest: { packs: Manifest['packs'] }): string {
  const pack = manifest.packs.find((p) => p.id === PACK_ID);
  if (!pack) throw new Error(`Pack ${PACK_ID} is not listed in the model list (not available)`);
  const file = pack.files.find((f) => f.path.endsWith('.onnx'));
  if (!file) throw new Error(`Pack ${PACK_ID} has no ONNX graph in the model list`);
  return file.path;
}

export interface TranscriberPack {
  available: boolean;
  status: PackStatus;
  bytes: number;
  presentFiles: number;
  totalFiles: number;
}

export function transcriberPack(manifest: Manifest | null, states: Record<string, PackState>): TranscriberPack {
  const pack = manifest?.packs.find((p) => p.id === PACK_ID);
  if (!pack) return { available: false, status: 'missing', bytes: 0, presentFiles: 0, totalFiles: 0 };
  const st = states[PACK_ID];
  return { available: true, status: st?.status ?? 'missing', bytes: pack.totalBytes, presentFiles: st?.presentFiles ?? 0, totalFiles: pack.files.length };
}
