import * as ort from 'onnxruntime-web/webgpu';
import type { ScopedLogger } from '../log';
import type { OpenFile } from '../gen/layout';
import type { Manifest } from '../store/modelManager';
import { chooseThreads } from './threads';
import type { Heads } from './notes';
import { modelPath } from './pack';
import type { HeadsSession } from './pipeline';
import { SEGMENT_SAMPLES } from './segments';

export interface OrtSessionOptions {
  /** Reads a stored model file (modelManager.openFile); model bytes never come from the network. */
  openFile: OpenFile;
  loadManifest: () => Promise<Manifest>;
  /** Absolute URL of the app base (ends with a slash); locates `ort/`. */
  appBase: string;
  log: ScopedLogger;
}

export interface LoadedSession {
  session: HeadsSession;
  threads: number;
  loadMs: number;
  reused: boolean;
}

/** The browser-only side of transcription: one ONNX Runtime WASM (CPU) session, created once and reused. Not run by unit tests. */
export function createOrtSession(options: OrtSessionOptions) {
  const { log } = options;
  let created: { session: ort.InferenceSession; threads: number; requested: number | undefined; wrapper: HeadsSession } | null = null;
  let configuredThreads: number | null = null;

  function configure(requested: number | undefined): number {
    const threads = chooseThreads({ crossOriginIsolated: self.crossOriginIsolated, hardwareConcurrency: navigator.hardwareConcurrency, requested });
    // The WASM runtime reads these once, when its first session starts.
    if (configuredThreads === null) {
      ort.env.wasm.numThreads = threads;
      ort.env.wasm.simd = true;
      ort.env.wasm.initTimeout = 45000;
      ort.env.wasm.wasmPaths = new URL('ort/', options.appBase).href;
      configuredThreads = threads;
      log.info('ONNX Runtime configured', { threads, crossOriginIsolated: self.crossOriginIsolated, hardwareConcurrency: navigator.hardwareConcurrency, wasmPaths: ort.env.wasm.wasmPaths });
    }
    return configuredThreads;
  }

  async function load(requested: number | undefined, progress: (message: string) => void): Promise<LoadedSession> {
    if (created && created.requested === requested) return { session: created.wrapper, threads: created.threads, loadMs: 0, reused: true };
    if (created) await release();
    const threads = configure(requested);
    const t0 = performance.now();
    const path = modelPath(await options.loadManifest());
    progress('Reading the model from storage');
    let bytes: Uint8Array | null = new Uint8Array(await (await options.openFile(path)).arrayBuffer());
    log.info(`read ${path} (${(bytes.byteLength / 1e6).toFixed(1)} MB)`);
    progress('Starting the model');
    const session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    bytes = null;
    const loadMs = performance.now() - t0;
    log.info(`piano transcriber ready in ${Math.round(loadMs)} ms`, { threads, inputs: session.inputNames, outputs: session.outputNames });
    const wrapper: HeadsSession = {
      async run(window: Float32Array): Promise<Heads> {
        const out = await session.run({ audio: new ort.Tensor('float32', window, [1, SEGMENT_SAMPLES]) });
        const get = (name: string) => new Float32Array(out[name]!.data as Float32Array);
        return { onset: get('reg_onset_output'), offset: get('reg_offset_output'), frame: get('frame_output'), velocity: get('velocity_output') };
      },
    };
    created = { session, threads, requested, wrapper };
    return { session: wrapper, threads, loadMs, reused: false };
  }

  async function release(): Promise<void> {
    const c = created;
    created = null;
    if (c) {
      await c.session.release();
      log.info('piano transcriber session released');
    }
  }

  return { load, release, isLoaded: () => created !== null };
}
