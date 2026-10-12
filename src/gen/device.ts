import type { GenerateParams } from './protocol';

/** Processor used for model sessions: the GPU (WebGPU) or the CPU (WASM). */
export type GenDevice = 'webgpu' | 'cpu';

export const DEVICE_STORAGE_KEY = 'sa3daw.genDevice';

export const DEVICE_LABELS: Record<GenDevice, string> = { webgpu: 'GPU', cpu: 'CPU' };

export function parseDevice(raw: unknown): GenDevice {
  return raw === 'cpu' ? 'cpu' : 'webgpu';
}

interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

export function loadDevice(storage: StorageLike | null): GenDevice {
  try {
    return parseDevice(storage?.getItem(DEVICE_STORAGE_KEY));
  } catch {
    return 'webgpu';
  }
}

export function saveDevice(storage: StorageLike | null, device: GenDevice): void {
  try {
    storage?.setItem(DEVICE_STORAGE_KEY, device);
  } catch {
    /* storage unavailable */
  }
}

/** The stored choice, or the CPU when the GPU cannot be used on this device. */
export function effectiveDevice(stored: GenDevice, gpuIsAllowed: boolean): GenDevice {
  return gpuIsAllowed ? stored : 'cpu';
}

/** GPU generation needs the WebGPU API and, when the compatibility check ran, its GPU checks passing (null = check did not run). */
export function gpuAllowed(hasWebgpuApi: boolean, compatGpuUsable: boolean | null): boolean {
  return hasWebgpuApi && compatGpuUsable !== false;
}

const NO_RETRY = new Set(['cancelled', 'not-installed', 'not-available', 'worker-crashed']);

/** A failed WebGPU run is retried once on the CPU; cancellations, missing models and worker crashes are not. */
export function shouldFallback(device: GenDevice, error: unknown): boolean {
  if (device !== 'webgpu') return false;
  const code = (error as { code?: unknown } | null)?.code;
  return !(typeof code === 'string' && NO_RETRY.has(code));
}

export interface FallbackOptions {
  /** Called with the WebGPU error message just before the CPU retry starts. */
  onFallback(message: string): void;
  signal?: AbortSignal;
}

export interface FallbackResult<T> {
  output: T;
  device: GenDevice;
  fellBack: boolean;
}

/** Runs a generation on `params.device` (default WebGPU) and retries once on the CPU when a WebGPU run fails. */
export async function generateWithFallback<T>(
  generate: (params: GenerateParams) => Promise<T>,
  params: GenerateParams,
  options: FallbackOptions,
): Promise<FallbackResult<T>> {
  const device = params.device ?? 'webgpu';
  try {
    return { output: await generate({ ...params, device }), device, fellBack: false };
  } catch (e) {
    if (options.signal?.aborted || !shouldFallback(device, e)) throw e;
    options.onFallback(e instanceof Error ? e.message : String(e));
    return { output: await generate({ ...params, device: 'cpu' }), device: 'cpu', fellBack: true };
  }
}
