/** Decoded-sample cache with a byte budget: least recently used entries leave first, retained keys stay. */
export interface SampleCacheOptions<B> {
  budgetBytes: number;
  load: (key: string) => Promise<B>;
  bytesOf: (value: B) => number;
}

export function createSampleCache<B>(options: SampleCacheOptions<B>) {
  /** Map order is recency: the first key is the least recently used. */
  const entries = new Map<string, { value: B; bytes: number }>();
  const pending = new Map<string, Promise<B>>();
  let retained = new Set<string>();
  let total = 0;

  function evict(keep?: string) {
    for (const [key, e] of entries) {
      if (total <= options.budgetBytes) break;
      if (key === keep || retained.has(key)) continue;
      entries.delete(key);
      total -= e.bytes;
    }
  }
  function touch(key: string) {
    const e = entries.get(key);
    if (e) { entries.delete(key); entries.set(key, e); }
    return e;
  }

  return {
    peek(key: string): B | undefined {
      return touch(key)?.value;
    },
    get(key: string): Promise<B> {
      const hit = touch(key);
      if (hit) return Promise.resolve(hit.value);
      let p = pending.get(key);
      if (!p) {
        p = options.load(key).then(
          (value) => {
            pending.delete(key);
            const bytes = options.bytesOf(value);
            entries.set(key, { value, bytes });
            total += bytes;
            evict(key);
            return value;
          },
          (e) => { pending.delete(key); throw e; },
        );
        pending.set(key, p);
      }
      return p;
    },
    /** Keys that must not be evicted (what the tracks play). */
    retain(keys: Set<string>) {
      retained = keys;
    },
    bytes: () => total,
    clear() {
      entries.clear();
      total = 0;
    },
  };
}
export type SampleCache<B> = ReturnType<typeof createSampleCache<B>>;
