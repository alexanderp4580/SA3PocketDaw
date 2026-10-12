import { describe, it, expect, vi } from 'vitest';
import { detectWasmSimd, probeEnvironment } from './probe';

function fakeGlobals(over: Record<string, unknown> = {}) {
  const adapter = {
    info: { vendor: 'v', architecture: 'a', description: 'd', device: 'dev' },
    features: new Set(['shader-f16']),
    limits: { maxBufferSize: 100, maxStorageBufferBindingSize: 200 },
  };
  return {
    isSecureContext: true,
    navigator: {
      userAgent: 'UA', platform: 'P', maxTouchPoints: 0, deviceMemory: 8,
      gpu: { requestAdapter: async () => adapter },
      storage: { estimate: async () => ({ quota: 1000, usage: 10 }) },
    },
    caches: {},
    indexedDB: {},
    Worker: class {},
    AudioContext: class {},
    WebAssembly: { validate: () => true },
    ...over,
  } as any;
}

describe('probeEnvironment', () => {
  it('collects a real-shaped environment and runs the probe', async () => {
    const runProbe = vi.fn(async () => {});
    const env = await probeEnvironment({ globals: fakeGlobals(), runProbe, requiredBytes: 5 });
    expect(env).toMatchObject({
      userAgent: 'UA', secureContext: true, webgpuApi: true, features: ['shader-f16'],
      limits: { maxBufferSize: 100, maxStorageBufferBindingSize: 200 },
      storage: { quota: 1000, usage: 10 }, requiredBytes: 5, deviceMemoryGB: 8,
      moduleWorkers: true, cacheStorage: true, indexedDB: true, webAudio: true, webAssembly: true, wasmSimd: true,
    });
    expect(env.adapter).toEqual({ vendor: 'v', architecture: 'a', description: 'd', device: 'dev' });
    expect(env.probe.status).toBe('pass');
    expect(env.timings).toHaveProperty('total');
    expect(runProbe).toHaveBeenCalledOnce();
  });

  it('skips the probe when there is no adapter', async () => {
    const g = fakeGlobals();
    g.navigator.gpu.requestAdapter = async () => null;
    const runProbe = vi.fn();
    const env = await probeEnvironment({ globals: g, runProbe });
    expect(env.adapter).toBeNull();
    expect(env.probe.status).toBe('skipped');
    expect(runProbe).not.toHaveBeenCalled();
  });

  it('reports webgpuApi false when navigator.gpu is missing', async () => {
    const g = fakeGlobals();
    delete g.navigator.gpu;
    const env = await probeEnvironment({ globals: g, runProbe: vi.fn() });
    expect(env.webgpuApi).toBe(false);
    expect(env.probe.status).toBe('skipped');
  });

  it('reports a probe failure with its message', async () => {
    const env = await probeEnvironment({ globals: fakeGlobals(), runProbe: async () => { throw new Error('bad shader'); } });
    expect(env.probe).toMatchObject({ status: 'fail', error: 'bad shader' });
  });

  it('times out a probe that never finishes', async () => {
    const env = await probeEnvironment({ globals: fakeGlobals(), timeoutMs: 20, runProbe: () => new Promise(() => {}) });
    expect(env.probe.status).toBe('timeout');
  });

  it('survives an adapter request that throws', async () => {
    const g = fakeGlobals();
    g.navigator.gpu.requestAdapter = async () => { throw new Error('no'); };
    const env = await probeEnvironment({ globals: g, runProbe: vi.fn() });
    expect(env.adapter).toBeNull();
  });
});

describe('WebAssembly detection', () => {
  it('reports no WebAssembly or no SIMD from the injected globals', async () => {
    const none = await probeEnvironment({ globals: fakeGlobals({ WebAssembly: undefined }), runProbe: vi.fn() });
    expect(none.webAssembly).toBe(false);
    expect(none.wasmSimd).toBe(false);
    const noSimd = await probeEnvironment({ globals: fakeGlobals({ WebAssembly: { validate: () => false } }), runProbe: vi.fn() });
    expect(noSimd.webAssembly).toBe(true);
    expect(noSimd.wasmSimd).toBe(false);
  });
  it('treats a throwing validate as no SIMD', () => {
    expect(detectWasmSimd({ validate: () => { throw new Error('x'); } })).toBe(false);
  });
  it('validates the real SIMD module in this runtime', () => {
    expect(detectWasmSimd(globalThis.WebAssembly)).toBe(true);
  });
});
