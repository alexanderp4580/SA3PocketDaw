import { describe, expect, it, vi } from 'vitest';
import { DEVICE_STORAGE_KEY, loadDevice, parseDevice, saveDevice, shouldFallback, generateWithFallback, effectiveDevice, gpuAllowed } from './device';
import { GenerationError } from './client';

describe('parseDevice', () => {
  it('accepts gpu and cpu values and defaults to webgpu', () => {
    expect(parseDevice('cpu')).toBe('cpu');
    expect(parseDevice('webgpu')).toBe('webgpu');
    for (const v of [null, undefined, '', 'GPU', 'wasm', 'cpu ', 3]) expect(parseDevice(v)).toBe('webgpu');
  });
});

describe('device storage', () => {
  it('round-trips through the storage key and tolerates failing storage', () => {
    const data = new Map<string, string>();
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    expect(loadDevice(storage)).toBe('webgpu');
    saveDevice(storage, 'cpu');
    expect(data.get(DEVICE_STORAGE_KEY)).toBe('cpu');
    expect(loadDevice(storage)).toBe('cpu');
    const broken = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
    expect(loadDevice(broken)).toBe('webgpu');
    expect(() => saveDevice(broken, 'cpu')).not.toThrow();
    expect(loadDevice(null)).toBe('webgpu');
  });
});

describe('shouldFallback', () => {
  const err = (code: ConstructorParameters<typeof GenerationError>[1]) => new GenerationError('m', code);
  it('retries on the CPU after a failed WebGPU run', () => {
    for (const code of ['failed', 'webgpu-lost', 'webgpu-unavailable', 'out-of-memory'] as const) {
      expect(shouldFallback('webgpu', err(code))).toBe(true);
    }
  });
  it('does not retry cancellations, missing models, crashes or CPU runs', () => {
    for (const code of ['cancelled', 'not-installed', 'not-available', 'worker-crashed'] as const) {
      expect(shouldFallback('webgpu', err(code))).toBe(false);
    }
    expect(shouldFallback('cpu', err('failed'))).toBe(false);
    expect(shouldFallback('webgpu', new Error('plain'))).toBe(true);
  });
});

describe('generateWithFallback', () => {
  const params = { model: 'small-music' as const, prompt: 'p', seconds: 1, steps: 4, seed: 1 };
  it('runs once on the chosen device when it succeeds', async () => {
    const gen = vi.fn(async () => 'out');
    const r = await generateWithFallback(gen, { ...params, device: 'webgpu' }, { onFallback: vi.fn() });
    expect(r).toEqual({ output: 'out', device: 'webgpu', fellBack: false });
    expect(gen).toHaveBeenCalledTimes(1);
  });
  it('retries once on cpu after a webgpu failure and reports it', async () => {
    const gen = vi.fn(async (p: { device?: string }) => {
      if (p.device === 'webgpu') throw new GenerationError('boom', 'failed');
      return 'cpu-out';
    });
    const onFallback = vi.fn();
    const r = await generateWithFallback(gen, { ...params, device: 'webgpu' }, { onFallback });
    expect(r).toEqual({ output: 'cpu-out', device: 'cpu', fellBack: true });
    expect(onFallback).toHaveBeenCalledWith('boom');
    expect(gen.mock.calls.map((c) => c[0].device)).toEqual(['webgpu', 'cpu']);
  });
  it('does not retry when cancelled or when the signal is aborted', async () => {
    const gen = vi.fn(async () => { throw new GenerationError('Cancelled', 'cancelled'); });
    await expect(generateWithFallback(gen, { ...params, device: 'webgpu' }, { onFallback: vi.fn() })).rejects.toMatchObject({ code: 'cancelled' });
    expect(gen).toHaveBeenCalledTimes(1);
    const ac = new AbortController();
    const gen2 = vi.fn(async () => { ac.abort(); throw new GenerationError('boom', 'failed'); });
    await expect(generateWithFallback(gen2, { ...params, device: 'webgpu' }, { onFallback: vi.fn(), signal: ac.signal })).rejects.toThrow('boom');
    expect(gen2).toHaveBeenCalledTimes(1);
  });
  it('surfaces the cpu error when the retry fails too', async () => {
    const gen = vi.fn(async (p: { device?: string }) => { throw new GenerationError(p.device === 'cpu' ? 'cpu broke' : 'gpu broke', 'failed'); });
    await expect(generateWithFallback(gen, { ...params, device: 'webgpu' }, { onFallback: vi.fn() })).rejects.toThrow('cpu broke');
    expect(gen).toHaveBeenCalledTimes(2);
  });
});

describe('effectiveDevice', () => {
  it('keeps the stored choice when the GPU is allowed', () => {
    expect(effectiveDevice('webgpu', true)).toBe('webgpu');
    expect(effectiveDevice('cpu', true)).toBe('cpu');
  });
  it('forces the CPU when the GPU is not allowed', () => {
    expect(effectiveDevice('webgpu', false)).toBe('cpu');
    expect(effectiveDevice('cpu', false)).toBe('cpu');
  });
});

describe('gpuAllowed', () => {
  it('needs the WebGPU API and no failed compatibility verdict for the GPU', () => {
    expect(gpuAllowed(true, null)).toBe(true);
    expect(gpuAllowed(true, true)).toBe(true);
    expect(gpuAllowed(true, false)).toBe(false);
    expect(gpuAllowed(false, null)).toBe(false);
    expect(gpuAllowed(false, true)).toBe(false);
  });
});
