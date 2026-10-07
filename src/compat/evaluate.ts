export type CheckStatus = 'pass' | 'warn' | 'fail';
export type Verdict = 'ok' | 'maybe' | 'no';

export interface CompatCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface CompatResult {
  verdict: Verdict;
  checks: CompatCheck[];
}

export interface GpuAdapterInfo {
  vendor: string;
  architecture: string;
  description: string;
  device: string;
}

export interface CompatEnv {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
  secureContext: boolean;
  webgpuApi: boolean;
  adapter: GpuAdapterInfo | null;
  features: string[];
  limits: { maxBufferSize?: number; maxStorageBufferBindingSize?: number };
  probe: { status: 'pass' | 'fail' | 'timeout' | 'skipped'; error?: string; ms?: number };
  moduleWorkers: boolean;
  cacheStorage: boolean;
  indexedDB: boolean;
  storage: { quota?: number; usage?: number } | null;
  /** Bytes the chosen model needs to install; null when no model is chosen yet. */
  requiredBytes: number | null;
  deviceMemoryGB?: number;
  webAudio: boolean;
  timings?: Record<string, number>;
}

const MIB = 1024 * 1024;
export const MIN_STORAGE_BUFFER = 128 * MIB;
export const PROBE_TIMEOUT_MS = 60_000;

const mib = (b: number) => `${Math.round(b / MIB)} MiB`;

export function isIosWebKit(env: Pick<CompatEnv, 'userAgent' | 'platform' | 'maxTouchPoints'>): boolean {
  if (/iPhone|iPad|iPod/.test(env.userAgent)) return true;
  // iPadOS Safari reports a Macintosh user agent but has a touch screen.
  return /Macintosh/.test(env.userAgent) && (env.maxTouchPoints ?? 0) > 1;
}

export function evaluate(env: CompatEnv): CompatResult {
  const checks: CompatCheck[] = [];
  const add = (id: string, label: string, status: CheckStatus, detail: string) => checks.push({ id, label, status, detail });

  add('secure-context', 'Secure context (HTTPS)', env.secureContext ? 'pass' : 'fail',
    env.secureContext
      ? 'The page is served over HTTPS or localhost.'
      : 'This page is not in a secure context (HTTPS), so the browser blocks WebGPU. Open the https:// address instead.');

  add('webgpu-api', 'WebGPU', env.webgpuApi ? 'pass' : 'fail',
    env.webgpuApi ? 'WebGPU is available.' : 'WebGPU is not available in this browser, so the SA3 model cannot run on this device.');

  if (!env.webgpuApi) add('gpu-adapter', 'GPU adapter', 'fail', 'No GPU adapter was requested because WebGPU is missing.');
  else if (!env.adapter) add('gpu-adapter', 'GPU adapter', 'fail', 'WebGPU exists but the browser returned no GPU adapter, so the model cannot use this device\'s graphics chip.');
  else add('gpu-adapter', 'GPU adapter', 'pass', [env.adapter.vendor, env.adapter.architecture, env.adapter.description].filter(Boolean).join(' ') || 'Adapter found.');

  const f16 = env.features.includes('shader-f16');
  add('shader-f16', 'GPU 16-bit float (shader-f16)', f16 ? 'pass' : 'warn',
    f16 ? 'Supported.' : 'This GPU does not report 16-bit float support. Generation may be slower, and the Medium model may not run.');

  const sb = env.limits.maxStorageBufferBindingSize;
  if (sb === undefined) add('storage-buffer', 'GPU storage buffer size', 'fail', 'The GPU limits are unknown, so a 128 MiB storage buffer cannot be confirmed.');
  else if (sb < MIN_STORAGE_BUFFER) add('storage-buffer', 'GPU storage buffer size', 'fail', `The GPU allows only ${mib(sb)} per storage buffer; the model needs at least 128 MiB.`);
  else add('storage-buffer', 'GPU storage buffer size', 'pass', `${mib(sb)} per storage buffer (at least 128 MiB needed).`);

  const p = env.probe;
  if (p.status === 'pass') add('onnx-probe', 'ONNX WebGPU test', 'pass', `The small test model ran on the GPU${p.ms !== undefined ? ` in ${Math.round(p.ms)} ms` : ''}.`);
  else if (p.status === 'timeout') add('onnx-probe', 'ONNX WebGPU test', 'fail', 'The small ONNX test model did not finish within 60 seconds, so the GPU cannot run the SA3 model reliably.');
  else if (p.status === 'skipped') add('onnx-probe', 'ONNX WebGPU test', 'fail', 'The small ONNX test was not run because no GPU adapter is available.');
  else add('onnx-probe', 'ONNX WebGPU test', 'fail', `The small ONNX test model failed on the GPU${p.error ? `: ${p.error}` : '.'}`);

  add('module-workers', 'Module web workers', env.moduleWorkers ? 'pass' : 'fail',
    env.moduleWorkers ? 'Supported.' : 'This browser cannot run module web workers, so generation cannot run in the background.');
  add('cache-storage', 'Cache Storage', env.cacheStorage ? 'pass' : 'fail',
    env.cacheStorage ? 'Available.' : 'Cache Storage is not available, so models cannot be saved on this device.');
  add('indexeddb', 'IndexedDB', env.indexedDB ? 'pass' : 'fail',
    env.indexedDB ? 'Available.' : 'IndexedDB is not available, so projects and samples cannot be saved on this device.');

  const st = env.storage;
  const available = st && st.quota !== undefined ? st.quota - (st.usage ?? 0) : undefined;
  if (env.requiredBytes === null) {
    add('storage-quota', 'Storage space', 'pass', available !== undefined ? `${mib(available)} available; no model chosen yet.` : 'No model chosen yet.');
  } else if (available === undefined) {
    add('storage-quota', 'Storage space', 'warn', `The browser does not report free storage; the chosen model needs ${mib(env.requiredBytes)}.`);
  } else if (available < env.requiredBytes) {
    add('storage-quota', 'Storage space', 'fail', `The browser offers ${mib(available)} of storage but the chosen model needs ${mib(env.requiredBytes)}.`);
  } else if (available < env.requiredBytes * 1.2) {
    add('storage-quota', 'Storage space', 'warn', `${mib(available)} available for a ${mib(env.requiredBytes)} model; very little room is left.`);
  } else {
    add('storage-quota', 'Storage space', 'pass', `${mib(available)} available for a ${mib(env.requiredBytes)} model.`);
  }

  const mem = env.deviceMemoryGB;
  if (mem === undefined) add('device-memory', 'Device memory', 'pass', 'This browser does not report device memory.');
  else if (mem < 4) add('device-memory', 'Device memory', 'warn', `The browser reports ${mem} GB of memory; the model may run out of memory.`);
  else add('device-memory', 'Device memory', 'pass', `The browser reports ${mem} GB (the value is capped by the browser).`);

  add('web-audio', 'Web Audio', env.webAudio ? 'pass' : 'fail',
    env.webAudio ? 'Available.' : 'Web Audio is not available, so no sound can be played in this browser.');

  if (isIosWebKit(env)) {
    add('browser-family', 'Browser family', 'warn', 'iPhone and iPad browsers all use Apple\'s WebKit engine. WebGPU and memory limits there are unverified, to check. You can continue and see whether it runs.');
  } else {
    add('browser-family', 'Browser family', 'pass', 'Not an iOS/iPadOS WebKit browser.');
  }

  const verdict: Verdict = checks.some((c) => c.status === 'fail') ? 'no' : checks.some((c) => c.status === 'warn') ? 'maybe' : 'ok';
  return { verdict, checks };
}
