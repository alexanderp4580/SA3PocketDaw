import { GemmaTokenizer, env as transformersEnv } from '@huggingface/transformers';
import * as ort from 'onnxruntime-web/webgpu';
import type { ScopedLogger } from '../log';
import type { Manifest } from '../store/modelManager';
import { type ModelLayout, type OpenFile, readGraphFiles, resolveLayout, wasmThreads } from './layout';
import type { ModelSession, Ports, SessionKind, TensorSpec, Tokenize } from './pipeline';
import type { ModelId } from './protocol';

export interface OrtPortsOptions {
  /** Reads a stored model file (modelManager.openFile); model bytes never come from the network. */
  openFile: OpenFile;
  loadManifest: () => Promise<Manifest>;
  /** Absolute URL of the app base (ends with a slash); locates `ort/` and `gpu-probe.onnx`. */
  appBase: string;
  log: ScopedLogger;
  progress?: (message: string) => void;
}

const PROBE_TIMEOUT_MS = 60_000;
const TEXT_TOKENS = 256;

/** The browser-only side of generation: ONNX Runtime WebGPU sessions and the Gemma tokenizer. Not run by unit tests. */
export function createOrtPorts(options: OrtPortsOptions): Ports {
  const { log, openFile, appBase } = options;
  let configured = false;
  let layouts = new Map<ModelId, ModelLayout>();

  function configure() {
    if (configured) return;
    configured = true;
    transformersEnv.allowLocalModels = false;
    transformersEnv.allowRemoteModels = false;
    ort.env.wasm.numThreads = wasmThreads({
      userAgent: navigator.userAgent,
      crossOriginIsolated: self.crossOriginIsolated,
      hardwareConcurrency: navigator.hardwareConcurrency,
    });
    ort.env.wasm.initTimeout = 45000;
    ort.env.wasm.simd = true;
    ort.env.wasm.wasmPaths = new URL('ort/', appBase).href;
    log.info('ONNX Runtime configured', { threads: ort.env.wasm.numThreads, wasmPaths: ort.env.wasm.wasmPaths, crossOriginIsolated: self.crossOriginIsolated });
  }

  async function layoutFor(model: ModelId): Promise<ModelLayout> {
    let l = layouts.get(model);
    if (!l) {
      l = resolveLayout(await options.loadManifest(), model);
      layouts.set(model, l);
    }
    return l;
  }

  async function readJson(path: string): Promise<unknown> {
    return JSON.parse(new TextDecoder().decode(new Uint8Array(await (await openFile(path)).arrayBuffer())));
  }

  async function createSession(path: string, label: string): Promise<ModelSession> {
    const { graph, externalData } = await readGraphFiles(openFile, path, (p, bytes) => {
      options.progress?.(`Read ${p} (${(bytes / 1e6).toFixed(1)} MB)`);
    });
    log.info(`initializing ${label} on WebGPU; shader compilation can take a while`, { path });
    const t0 = performance.now();
    const session = await ort.InferenceSession.create(graph, { executionProviders: ['webgpu'], externalData });
    externalData.length = 0;
    log.info(`${label} ready in ${Math.round(performance.now() - t0)} ms`);
    return {
      inputNames: session.inputNames,
      outputNames: session.outputNames,
      async run(inputs: Record<string, TensorSpec>) {
        const feeds: Record<string, ort.Tensor> = {};
        for (const [name, t] of Object.entries(inputs)) {
          feeds[name] = new ort.Tensor(t.type as any, t.data as any, t.dims);
        }
        const out = await session.run(feeds);
        const result: Record<string, { data: ArrayLike<number>; dims: readonly number[] }> = {};
        for (const name of session.outputNames) {
          const tensor = out[name]!;
          result[name] = { data: tensor.data as unknown as ArrayLike<number>, dims: tensor.dims };
        }
        return result;
      },
      release: () => session.release(),
    };
  }

  return {
    async probeGpu() {
      configure();
      const gpu = (navigator as Navigator).gpu;
      if (!gpu) throw new Error('WebGPU is unavailable in this browser.');
      const adapter = await gpu.requestAdapter();
      if (!adapter) throw new Error('WebGPU is present, but no usable GPU adapter was returned.');
      const info = adapter.info;
      const description = `${info?.vendor || 'unknown vendor'} ${info?.architecture || ''} ${info?.description || ''}`.trim();
      log.info('GPU adapter', {
        description,
        shaderF16: adapter.features.has('shader-f16'),
        maxBufferSize: adapter.limits.maxBufferSize,
        maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
        threads: ort.env.wasm.numThreads,
      });
      const response = await fetch(new URL('gpu-probe.onnx', appBase));
      if (!response.ok) throw new Error(`GPU diagnostic model unavailable: HTTP ${response.status}`);
      const graph = new Uint8Array(await response.arrayBuffer());
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Tiny ONNX WebGPU initialization timed out after 60 seconds; no large model was loaded.')), PROBE_TIMEOUT_MS);
      });
      let session: ort.InferenceSession;
      try {
        session = await Promise.race([ort.InferenceSession.create(graph, { executionProviders: ['webgpu'] }), deadline]);
      } finally {
        clearTimeout(timer);
      }
      try {
        const out = await session.run({
          x: new ort.Tensor('float32', Float32Array.of(1, 2, 3, 4), [2, 2]),
          y: new ort.Tensor('float32', Float32Array.of(1, 0, 0, 1), [2, 2]),
        });
        if (!Array.from(out.z!.data as Float32Array).every((v, i) => Math.abs(v - (i + 1)) < 1e-5)) {
          throw new Error('GPU diagnostic returned incorrect values.');
        }
      } finally {
        await session.release();
      }
      return description;
    },

    async loadTokenizer(model: ModelId): Promise<Tokenize> {
      configure();
      const enc = await layoutFor(model);
      const tokenizer = new (GemmaTokenizer as any)(await readJson(enc.tokenizerJson), await readJson(enc.tokenizerConfig));
      return async (prompt: string) => {
        const t = await tokenizer(prompt, { padding: 'max_length', truncation: true, max_length: TEXT_TOKENS });
        return {
          ids: BigInt64Array.from(t.input_ids.data as ArrayLike<number | bigint>, BigInt),
          mask: BigInt64Array.from(t.attention_mask.data as ArrayLike<number | bigint>, BigInt),
        };
      };
    },

    async loadSession(model: ModelId, kind: SessionKind) {
      configure();
      const layout = await layoutFor(model);
      const pick: Record<SessionKind, string | null> = {
        'text-encoder': layout.textEncoder,
        'number-conditioner': layout.numberConditioner,
        dit: layout.dit,
        decoder: layout.decoder,
      };
      const path = pick[kind];
      if (!path) throw new Error(`${model} has no ${kind} graph`);
      return createSession(path, `${model} ${kind}`);
    },

    reset() {
      layouts = new Map();
    },
  };
}
