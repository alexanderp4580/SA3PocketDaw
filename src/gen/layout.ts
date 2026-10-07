import type { Pack } from '../store/modelManager';
import type { ModelId } from './protocol';

export interface ModelLayout {
  tokenizerJson: string;
  tokenizerConfig: string;
  textEncoder: string;
  /** Small models only; Medium's graph conditions on the duration itself. */
  numberConditioner: string | null;
  dit: string;
  decoder: string;
}

const base = (path: string) => path.slice(path.lastIndexOf('/') + 1);

function find(pack: Pack, test: (name: string) => boolean, what: string): string {
  const f = pack.files.find((x) => test(base(x.path)));
  if (!f) throw new Error(`Pack ${pack.id} has no ${what} in the model list`);
  return f.path;
}

/** Resolve graph and tokenizer paths for a model from the manifest packs (encoder pack + the model's pack). */
export function resolveLayout(manifest: { packs: Pack[] }, model: ModelId): ModelLayout {
  const encoder = manifest.packs.find((p) => p.id === 'encoder');
  const pack = manifest.packs.find((p) => p.id === model);
  if (!encoder) throw new Error('Pack encoder is not listed in the model list (not available)');
  if (!pack) throw new Error(`Pack ${model} is not listed in the model list (not available)`);
  return {
    tokenizerJson: find(encoder, (n) => n === 'tokenizer.json', 'tokenizer.json'),
    tokenizerConfig: find(encoder, (n) => n === 'tokenizer_config.json', 'tokenizer_config.json'),
    textEncoder: find(encoder, (n) => n === 'text_encoder_q4.onnx', 'text encoder graph'),
    numberConditioner: model === 'medium' ? null : find(pack, (n) => n === 'number_conditioner.onnx', 'number conditioner graph'),
    dit: find(pack, (n) => /^dit_[^/]*\.onnx$/.test(n), 'diffusion graph'),
    decoder: find(pack, (n) => /^decoder_[^/]*\.onnx$/.test(n), 'decoder graph'),
  };
}

export interface GraphFiles {
  graph: Uint8Array;
  externalData: Array<{ path: string; data: Uint8Array }>;
}

export type OpenFile = (path: string) => Promise<Response>;

/** Read an ONNX graph and the external-data chunks named by its `<name>_chunks.json` index. */
export async function readGraphFiles(openFile: OpenFile, onnxPath: string, onBytes?: (path: string, bytes: number) => void): Promise<GraphFiles> {
  const dir = onnxPath.slice(0, onnxPath.lastIndexOf('/') + 1);
  const read = async (path: string) => {
    const data = new Uint8Array(await (await openFile(path)).arrayBuffer());
    onBytes?.(path, data.byteLength);
    return data;
  };
  const index = JSON.parse(new TextDecoder().decode(await read(onnxPath.replace(/\.onnx$/, '_chunks.json')))) as {
    chunks?: Array<{ name?: string; path?: string }>;
    files?: Array<{ name?: string; path?: string }>;
  };
  const graph = await read(onnxPath);
  const externalData: GraphFiles['externalData'] = [];
  for (const item of index.chunks ?? index.files ?? []) {
    const name = item.name ?? item.path;
    if (!name) continue;
    externalData.push({ path: name, data: await read(dir + name) });
  }
  return { graph, externalData };
}

/** WASM threads: 1 on Android or when not cross-origin isolated, else up to 4. */
export function wasmThreads(env: { userAgent: string; crossOriginIsolated: boolean; hardwareConcurrency?: number }): number {
  if (/Android/i.test(env.userAgent) || !env.crossOriginIsolated) return 1;
  return Math.min(4, env.hardwareConcurrency || 4);
}
