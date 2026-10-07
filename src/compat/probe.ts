import { log, reporter } from '../log';
import { PROBE_TIMEOUT_MS, type CompatEnv, type CompatResult } from './evaluate';
import { evaluate } from './evaluate';

const scope = log.scope('compat');

export interface ProbeOptions {
  requiredBytes?: number | null;
  timeoutMs?: number;
  /** Runs the tiny ONNX model on WebGPU; rejects on failure. Defaults to the real onnxruntime-web test. */
  runProbe?: () => Promise<void>;
  globals?: any;
}

/** Tiny ONNX graph (z = x @ y) run through onnxruntime-web on WebGPU; checks the result. */
export async function runOnnxGpuProbe(): Promise<void> {
  const ort = await import('onnxruntime-web/webgpu');
  const base = new URL(import.meta.env.BASE_URL, globalThis.location.href);
  ort.env.wasm.wasmPaths = new URL('ort/', base).href;
  ort.env.wasm.numThreads = /Android/i.test(navigator.userAgent) ? 1 : globalThis.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 4) : 1;
  const response = await fetch(new URL('gpu-probe.onnx', base));
  if (!response.ok) throw new Error(`gpu-probe.onnx unavailable (HTTP ${response.status})`);
  const graph = new Uint8Array(await response.arrayBuffer());
  const session = await ort.InferenceSession.create(graph, { executionProviders: ['webgpu'] });
  try {
    const out = await session.run({
      x: new ort.Tensor('float32', Float32Array.of(1, 2, 3, 4), [2, 2]),
      y: new ort.Tensor('float32', Float32Array.of(1, 0, 0, 1), [2, 2]),
    });
    const z = out.z?.data as Float32Array | undefined;
    if (!z || !Array.from(z).every((v, i) => Math.abs(v - (i + 1)) < 1e-5)) throw new Error('probe returned wrong values');
  } finally {
    await session.release();
  }
}

export async function probeEnvironment(options: ProbeOptions = {}): Promise<CompatEnv> {
  const g = options.globals ?? globalThis;
  const nav = g.navigator ?? {};
  const t0 = performance.now();
  const timings: Record<string, number> = {};

  const webgpuApi = !!nav.gpu;
  let adapter: CompatEnv['adapter'] = null;
  let features: string[] = [];
  let limits: CompatEnv['limits'] = {};
  if (webgpuApi) {
    const t = performance.now();
    try {
      const a = await nav.gpu.requestAdapter();
      if (a) {
        const info = a.info ?? {};
        adapter = { vendor: info.vendor ?? '', architecture: info.architecture ?? '', description: info.description ?? '', device: info.device ?? '' };
        features = Array.from(a.features as Iterable<string>);
        limits = { maxBufferSize: a.limits?.maxBufferSize, maxStorageBufferBindingSize: a.limits?.maxStorageBufferBindingSize };
      }
    } catch (e) {
      scope.warn('requestAdapter failed', String(e));
    }
    timings.adapter = performance.now() - t;
  }

  let storage: CompatEnv['storage'] = null;
  try {
    if (nav.storage?.estimate) {
      const est = await nav.storage.estimate();
      storage = { quota: est.quota, usage: est.usage };
    }
  } catch (e) {
    scope.warn('storage.estimate failed', String(e));
  }

  let probe: CompatEnv['probe'] = { status: 'skipped' };
  if (adapter) {
    const t = performance.now();
    const timeoutMs = options.timeoutMs ?? PROBE_TIMEOUT_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<'timeout'>((resolve) => { timer = setTimeout(() => resolve('timeout'), timeoutMs); });
    try {
      const r = await Promise.race([(options.runProbe ?? runOnnxGpuProbe)().then(() => 'pass' as const), timeout]);
      probe = r === 'timeout' ? { status: 'timeout' } : { status: 'pass', ms: performance.now() - t };
    } catch (e) {
      probe = { status: 'fail', error: e instanceof Error ? e.message : String(e) };
    } finally {
      clearTimeout(timer);
    }
    timings.probe = performance.now() - t;
  }
  timings.total = performance.now() - t0;

  const env: CompatEnv = {
    userAgent: nav.userAgent ?? '',
    platform: nav.platform,
    maxTouchPoints: nav.maxTouchPoints,
    secureContext: !!g.isSecureContext,
    webgpuApi,
    adapter,
    features,
    limits,
    probe,
    moduleWorkers: typeof g.Worker === 'function',
    cacheStorage: !!g.caches,
    indexedDB: !!g.indexedDB,
    storage,
    requiredBytes: options.requiredBytes ?? null,
    deviceMemoryGB: nav.deviceMemory,
    webAudio: typeof g.AudioContext === 'function' || typeof g.webkitAudioContext === 'function',
    timings,
  };
  scope.info('environment probed', env);
  return env;
}

let last: { env: CompatEnv; result: CompatResult } | null = null;

/** Probe, evaluate and remember the outcome for the report and Debug screen. */
export async function runCompat(options: ProbeOptions = {}): Promise<{ env: CompatEnv; result: CompatResult }> {
  const env = await probeEnvironment(options);
  const result = evaluate(env);
  last = { env, result };
  scope.info(`verdict ${result.verdict}`, result.checks.filter((c) => c.status !== 'pass'));
  return last;
}

export function lastCompat() {
  return last;
}

reporter.setProvider('compat', () => (last ? { verdict: last.result.verdict, checks: last.result.checks } : null));
reporter.setProvider('gpu', () =>
  last
    ? { adapter: last.env.adapter, features: last.env.features, limits: last.env.limits, probe: last.env.probe, timings: last.env.timings }
    : null,
);
