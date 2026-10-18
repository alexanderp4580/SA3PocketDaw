import { describe, expect, it } from 'vitest';
import { createSampleCache } from './cache';

const deferred = <T>() => { let resolve!: (v: T) => void; let reject!: (e: Error) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

function setup(budget: number, sizes: Record<string, number> = {}) {
  const loads: string[] = [];
  const cache = createSampleCache<{ id: string; bytes: number }>({
    budgetBytes: budget,
    load: async (key) => { loads.push(key); return { id: key, bytes: sizes[key] ?? 100 }; },
    bytesOf: (b) => b.bytes,
  });
  return { cache, loads };
}

describe('sample cache', () => {
  it('loads once and serves later requests from memory', async () => {
    const { cache, loads } = setup(1000);
    const a = await cache.get('a');
    expect(await cache.get('a')).toBe(a);
    expect(loads).toEqual(['a']);
    expect(cache.peek('a')).toBe(a);
    expect(cache.bytes()).toBe(100);
  });

  it('shares one load between concurrent requests', async () => {
    const d = deferred<{ id: string; bytes: number }>();
    let calls = 0;
    const cache = createSampleCache<{ id: string; bytes: number }>({ budgetBytes: 1000, load: () => { calls++; return d.promise; }, bytesOf: (b) => b.bytes });
    const p1 = cache.get('a'), p2 = cache.get('a');
    d.resolve({ id: 'a', bytes: 10 });
    expect(await p1).toBe(await p2);
    expect(calls).toBe(1);
  });

  it('evicts the least recently used entries beyond the budget', async () => {
    const { cache } = setup(250);
    await cache.get('a'); await cache.get('b');
    await cache.get('a');
    await cache.get('c');
    expect(cache.peek('b')).toBeUndefined();
    expect(cache.peek('a')).toBeDefined();
    expect(cache.peek('c')).toBeDefined();
    expect(cache.bytes()).toBe(200);
  });

  it('never evicts retained entries or the newest one, even over budget', async () => {
    const { cache } = setup(150);
    cache.retain(new Set(['a', 'b']));
    await cache.get('a'); await cache.get('b'); await cache.get('c');
    expect(cache.peek('a')).toBeDefined();
    expect(cache.peek('b')).toBeDefined();
    expect(cache.peek('c')).toBeDefined();
    cache.retain(new Set());
    await cache.get('d');
    expect(cache.bytes()).toBeLessThanOrEqual(150);
    expect(cache.peek('d')).toBeDefined();
    expect(cache.peek('a')).toBeUndefined();
  });

  it('keeps the entry that was just loaded when it alone exceeds the budget', async () => {
    const { cache } = setup(50);
    const a = await cache.get('a');
    expect(cache.peek('a')).toBe(a);
  });

  it('does not keep a failed load', async () => {
    let fail = true;
    const cache = createSampleCache<{ bytes: number }>({ budgetBytes: 100, load: async () => { if (fail) throw new Error('boom'); return { bytes: 1 }; }, bytesOf: (b) => b.bytes });
    await expect(cache.get('a')).rejects.toThrow('boom');
    fail = false;
    await expect(cache.get('a')).resolves.toEqual({ bytes: 1 });
  });

  it('clear drops everything', async () => {
    const { cache } = setup(1000);
    await cache.get('a');
    cache.clear();
    expect(cache.peek('a')).toBeUndefined();
    expect(cache.bytes()).toBe(0);
  });
});
