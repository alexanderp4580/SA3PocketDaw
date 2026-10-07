import { describe, it, expect } from 'vitest';
import { evaluate, type CompatEnv } from './evaluate';

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;

function goodEnv(over: Partial<CompatEnv> = {}): CompatEnv {
  return {
    userAgent: 'Mozilla/5.0 (Linux; Android 16; Pixel 10 Pro XL) Chrome/140 Mobile Safari/537.36',
    platform: 'Linux armv8l',
    maxTouchPoints: 5,
    secureContext: true,
    webgpuApi: true,
    adapter: { vendor: 'arm', architecture: 'x', description: 'g', device: 'd' },
    features: ['shader-f16', 'timestamp-query'],
    limits: { maxBufferSize: 2 * GIB, maxStorageBufferBindingSize: 1 * GIB },
    probe: { status: 'pass', ms: 800 },
    moduleWorkers: true,
    cacheStorage: true,
    indexedDB: true,
    storage: { quota: 20 * GIB, usage: 0 },
    requiredBytes: 683 * MIB,
    deviceMemoryGB: 8,
    webAudio: true,
    ...over,
  };
}
const status = (r: ReturnType<typeof evaluate>, id: string) => r.checks.find((c) => c.id === id)!;

describe('evaluate', () => {
  it('passes everything on a capable device', () => {
    const r = evaluate(goodEnv());
    expect(r.verdict).toBe('ok');
    expect(r.checks.every((c) => c.status === 'pass')).toBe(true);
    expect(r.checks.map((c) => c.id)).toEqual([
      'secure-context', 'webgpu-api', 'gpu-adapter', 'shader-f16', 'storage-buffer', 'onnx-probe',
      'module-workers', 'cache-storage', 'indexeddb', 'storage-quota', 'device-memory', 'web-audio', 'browser-family',
    ]);
  });

  const hard: [string, string, Partial<CompatEnv>][] = [
    ['secure-context', 'secure', { secureContext: false }],
    ['webgpu-api', 'WebGPU is not available in this browser, so the SA3 model cannot run on this device.', { webgpuApi: false, adapter: null, features: [], limits: {}, probe: { status: 'skipped' } }],
    ['gpu-adapter', 'adapter', { adapter: null, probe: { status: 'skipped' } }],
    ['storage-buffer', '128 MiB', { limits: { maxBufferSize: 2 * GIB, maxStorageBufferBindingSize: 64 * MIB } }],
    ['onnx-probe', 'did not finish', { probe: { status: 'timeout' } }],
    ['onnx-probe', 'boom', { probe: { status: 'fail', error: 'boom' } }],
    ['module-workers', 'worker', { moduleWorkers: false }],
    ['cache-storage', 'Cache Storage', { cacheStorage: false }],
    ['indexeddb', 'IndexedDB', { indexedDB: false }],
    ['storage-quota', 'storage', { storage: { quota: 100 * MIB, usage: 0 } }],
    ['web-audio', 'audio', { webAudio: false }],
  ];
  it.each(hard)('fails on %s -> verdict no, plain-language reason', (id, text, over) => {
    const r = evaluate(goodEnv(over));
    expect(r.verdict).toBe('no');
    const c = status(r, id);
    expect(c.status).toBe('fail');
    expect(c.detail.toLowerCase()).toContain(text.toLowerCase());
  });

  it('uses the exact WebGPU sentence', () => {
    const r = evaluate(goodEnv({ webgpuApi: false, adapter: null, probe: { status: 'skipped' } }));
    expect(status(r, 'webgpu-api').detail).toBe('WebGPU is not available in this browser, so the SA3 model cannot run on this device.');
  });

  it('subtracts existing usage from the quota', () => {
    const r = evaluate(goodEnv({ storage: { quota: 1 * GIB, usage: 600 * MIB } }));
    expect(status(r, 'storage-quota').status).toBe('fail');
  });

  const warns: [string, Partial<CompatEnv>][] = [
    ['shader-f16', { features: [] }],
    ['storage-quota', { storage: { quota: 750 * MIB, usage: 0 } }],
    ['storage-quota', { storage: null }],
    ['device-memory', { deviceMemoryGB: 2 }],
    ['browser-family', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130 Mobile/15E148 Safari/604.1' }],
  ];
  it.each(warns)('warns on %s -> verdict maybe', (id, over) => {
    const r = evaluate(goodEnv(over));
    expect(r.verdict).toBe('maybe');
    expect(status(r, id).status).toBe('warn');
  });

  it('treats iPadOS desktop-class Safari as WebKit on iOS', () => {
    const r = evaluate(goodEnv({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18 Safari/605.1.15', platform: 'MacIntel', maxTouchPoints: 5 }));
    const c = status(r, 'browser-family');
    expect(c.status).toBe('warn');
    expect(c.detail).toContain('to check');
  });

  it('does not flag desktop Safari on macOS without touch', () => {
    const r = evaluate(goodEnv({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18 Safari/605.1.15', platform: 'MacIntel', maxTouchPoints: 0 }));
    expect(status(r, 'browser-family').status).toBe('pass');
  });

  it('passes the memory check quietly when the browser does not expose it', () => {
    const r = evaluate(goodEnv({ deviceMemoryGB: undefined }));
    expect(status(r, 'device-memory').status).toBe('pass');
  });

  it('a hard failure wins over warnings', () => {
    expect(evaluate(goodEnv({ features: [], webAudio: false })).verdict).toBe('no');
  });

  it('skips the quota comparison when no pack size is chosen', () => {
    const r = evaluate(goodEnv({ requiredBytes: null, storage: { quota: 1 * MIB, usage: 0 } }));
    expect(status(r, 'storage-quota').status).toBe('pass');
  });
});
