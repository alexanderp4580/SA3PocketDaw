import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createModelManager, MODEL_CACHE_NAME, type Manifest, type ModelManager, type DownloadProgress } from './modelManager';
import { createLogger } from '../log';

class FakeCache {
  store = new Map<string, { body: ArrayBuffer; headers: [string, string][] }>();
  async match(url: string) {
    const e = this.store.get(url);
    return e ? new Response(e.body.slice(0), { headers: e.headers }) : undefined;
  }
  async put(url: string, res: Response) {
    this.store.set(url, { body: await res.arrayBuffer(), headers: [...res.headers.entries()] });
  }
  async delete(url: string) {
    return this.store.delete(url);
  }
  async keys() {
    return [...this.store.keys()].map((url) => ({ url }));
  }
}
class FakeCaches {
  caches = new Map<string, FakeCache>();
  async open(n: string) {
    if (!this.caches.has(n)) this.caches.set(n, new FakeCache());
    return this.caches.get(n)!;
  }
  async delete(n: string) {
    return this.caches.delete(n);
  }
  async has(n: string) {
    return this.caches.has(n);
  }
}

const BASE = 'https://host/models/';
const manifest: Manifest = {
  version: 1,
  packs: [
    { id: 'encoder', label: 'Encoder', requires: [], files: [{ path: 'enc/a.onnx', bytes: 10 }, { path: 'enc/b.data', bytes: 6 }], totalBytes: 16 },
    { id: 'small-music', label: 'Small', requires: ['encoder'], files: [{ path: 'small/dit.onnx', bytes: 8 }], totalBytes: 8 },
    { id: 'medium', label: 'Medium', requires: ['encoder'], files: [{ path: 'medium/dit.onnx', bytes: 12 }], totalBytes: 12 },
  ],
};

function makeFetch(opts: { online?: boolean; corrupt?: string; abortAfter?: { signal?: AbortController; path: string } } = {}) {
  const calls: string[] = [];
  const f = vi.fn(async (input: any, init?: any) => {
    const url = String(input);
    calls.push(url);
    if (opts.online === false) throw new TypeError('offline');
    if (url === BASE + 'manifest.json') return new Response(JSON.stringify(manifest), { status: 200 });
    const path = url.slice(BASE.length);
    const spec = manifest.packs.flatMap((p) => p.files).find((x) => x.path === path);
    if (!spec) return new Response('nope', { status: 404 });
    const size = opts.corrupt === path ? spec.bytes - 1 : spec.bytes;
    const half = Math.floor(size / 2);
    const signal: AbortSignal | undefined = init?.signal;
    const body = new ReadableStream<Uint8Array>({
      async start(c) {
        c.enqueue(new Uint8Array(half));
        if (opts.abortAfter && opts.abortAfter.path === path) opts.abortAfter.signal?.abort();
        await new Promise((r) => setTimeout(r, 0));
        if (signal?.aborted) return c.error(new DOMException('aborted', 'AbortError'));
        c.enqueue(new Uint8Array(size - half));
        c.close();
      },
    });
    return new Response(body, { status: 200, headers: { 'content-length': String(size) } });
  });
  return Object.assign(f, { calls });
}

let caches: FakeCaches;
let mm: ModelManager;
function make(fetchImpl = makeFetch(), extra = {}) {
  caches = new FakeCaches();
  mm = createModelManager({ fetch: fetchImpl as any, caches: caches as any, baseUrl: BASE, log: createLogger({ console: null }), ...extra });
  return fetchImpl;
}
const modelCache = () => caches.open(MODEL_CACHE_NAME) as Promise<FakeCache>;

describe('manifest', () => {
  it('fetches and caches the manifest, then serves it offline', async () => {
    make();
    expect(await mm.loadManifest()).toEqual(manifest);
    const offline = makeFetch({ online: false });
    const mm2 = createModelManager({ fetch: offline as any, caches: caches as any, baseUrl: BASE, log: createLogger({ console: null }) });
    expect(await mm2.loadManifest()).toEqual(manifest);
  });
  it('throws when offline with nothing cached', async () => {
    make(makeFetch({ online: false }));
    await expect(mm.loadManifest()).rejects.toThrow(/manifest/i);
  });
});

describe('install state', () => {
  beforeEach(() => make());
  it('is missing, partial, then installed only when every file has its exact size', async () => {
    await mm.loadManifest();
    expect((await mm.packStates() as Record<string, any>).encoder).toMatchObject({ status: 'missing', presentFiles: 0, totalFiles: 2 });
    const c = await modelCache();
    await c.put(BASE + 'enc/a.onnx', new Response(new Uint8Array(10), { headers: { 'content-length': '10' } }));
    expect((await mm.packStates() as Record<string, any>).encoder.status).toBe('partial');
    await c.put(BASE + 'enc/b.data', new Response(new Uint8Array(5), { headers: { 'content-length': '5' } }));
    expect((await mm.packStates() as Record<string, any>).encoder.status).toBe('partial');
    await c.put(BASE + 'enc/b.data', new Response(new Uint8Array(6), { headers: { 'content-length': '6' } }));
    expect((await mm.packStates() as Record<string, any>).encoder.status).toBe('installed');
  });
});

describe('download', () => {
  it('installs required packs first and reports per-file and per-pack progress', async () => {
    const f = make();
    await mm.loadManifest();
    const events: DownloadProgress[] = [];
    await mm.download('small-music', { onProgress: (p) => events.push(p) });
    const s = (await mm.packStates()) as Record<string, any>;
    expect(s.encoder.status).toBe('installed');
    expect(s['small-music'].status).toBe('installed');
    expect(f.calls.filter((u) => u.endsWith('.onnx') || u.endsWith('.data'))).toEqual([BASE + 'enc/a.onnx', BASE + 'enc/b.data', BASE + 'small/dit.onnx']);
    const last = events.at(-1)!;
    expect(last).toMatchObject({ packBytes: 24, packTotal: 24, file: 'small/dit.onnx', fileBytes: 8, fileTotal: 8 });
    for (let i = 1; i < events.length; i++) expect(events[i]!.packBytes).toBeGreaterThanOrEqual(events[i - 1]!.packBytes);
    expect(events.some((e) => e.fileBytes > 0 && e.fileBytes < e.fileTotal)).toBe(true);
  });

  it('skips files that are already stored with the right size', async () => {
    const f = make();
    await mm.loadManifest();
    await mm.download('encoder');
    f.calls.length = 0;
    const events: DownloadProgress[] = [];
    await mm.download('small-music', { onProgress: (p) => events.push(p) });
    expect(f.calls.filter((u) => u.includes('/enc/'))).toEqual([]);
    expect(events[0]!.packBytes).toBeGreaterThanOrEqual(16);
  });

  it('rejects a file with the wrong size and stores nothing for it', async () => {
    make(makeFetch({ corrupt: 'enc/b.data' }));
    await mm.loadManifest();
    await expect(mm.download('encoder')).rejects.toThrow(/size/i);
    const c = await modelCache();
    expect(c.store.has(BASE + 'enc/b.data')).toBe(false);
    expect(c.store.has(BASE + 'enc/a.onnx')).toBe(true);
    expect((await mm.packStates() as Record<string, any>).encoder.status).toBe('partial');
  });

  it('rejects on an HTTP error', async () => {
    const f = makeFetch();
    make(f);
    const bad: Manifest = { version: 1, packs: [{ id: 'x', label: 'x', requires: [], files: [{ path: 'missing.onnx', bytes: 1 }], totalBytes: 1 }] };
    await mm.loadManifest();
    mm.setManifest(bad);
    await expect(mm.download('x')).rejects.toThrow(/404/);
  });

  it('abort stops the download, keeps finished files and a re-run fetches only the rest', async () => {
    const ac = new AbortController();
    const f = make(makeFetch({ abortAfter: { signal: ac, path: 'enc/b.data' } }));
    await mm.loadManifest();
    await expect(mm.download('encoder', { signal: ac.signal })).rejects.toMatchObject({ name: 'AbortError' });
    const c = await modelCache();
    expect(c.store.has(BASE + 'enc/a.onnx')).toBe(true);
    expect(c.store.has(BASE + 'enc/b.data')).toBe(false);
    const f2 = makeFetch();
    const mm2 = createModelManager({ fetch: f2 as any, caches: caches as any, baseUrl: BASE, log: createLogger({ console: null }) });
    await mm2.loadManifest();
    await mm2.download('encoder');
    expect(f2.calls.filter((u) => u.includes('/enc/'))).toEqual([BASE + 'enc/b.data']);
    void f;
  });

  it('logs the steps', async () => {
    const logger = createLogger({ console: null });
    make(makeFetch(), { log: logger });
    await mm.loadManifest();
    await mm.download('encoder');
    const msgs = logger.entries().map((e) => e.message).join('\n');
    expect(msgs).toMatch(/manifest/i);
    expect(msgs).toMatch(/download/i);
    expect(logger.entries().every((e) => e.scope === 'models')).toBe(true);
  });
});

describe('delete', () => {
  beforeEach(async () => {
    make();
    await mm.loadManifest();
    await mm.download('small-music');
    await mm.download('medium');
  });
  it('keeps the shared encoder while another model needs it', async () => {
    await mm.deletePack('small-music');
    const s = (await mm.packStates()) as Record<string, any>;
    expect(s['small-music'].status).toBe('missing');
    expect(s.medium.status).toBe('installed');
    expect(s.encoder.status).toBe('installed');
  });
  it('removes the encoder with the last model that needs it', async () => {
    await mm.deletePack('small-music');
    await mm.deletePack('medium');
    const s = (await mm.packStates()) as Record<string, any>;
    expect(s.encoder.status).toBe('missing');
  });
  it('does not delete a pack another installed pack requires', async () => {
    await mm.deletePack('encoder');
    expect((await mm.packStates() as Record<string, any>).encoder.status).toBe('installed');
  });
  it('deleteAll removes every model file', async () => {
    await mm.deleteAll();
    expect(Object.values(await mm.packStates() as Record<string, any>).every((p) => p.status === 'missing')).toBe(true);
  });
  it('clearAllAppData removes models and manifest and runs registered hooks', async () => {
    const hook = vi.fn(async () => {});
    mm.addClearHook(hook);
    await mm.clearAllAppData();
    expect(hook).toHaveBeenCalledOnce();
    expect(await caches.has(MODEL_CACHE_NAME)).toBe(false);
    expect(caches.caches.size).toBe(0);
  });
});

describe('storage and files', () => {
  it('openFile returns the stored response and throws when missing', async () => {
    make();
    await mm.loadManifest();
    await mm.download('encoder');
    const res = await mm.openFile('enc/a.onnx');
    expect((await res.arrayBuffer()).byteLength).toBe(10);
    await expect(mm.openFile('nope')).rejects.toThrow(/not installed/i);
  });
  it('requestPersistence reports support and the result', async () => {
    const storage = { persist: vi.fn(async () => true), persisted: vi.fn(async () => false), estimate: vi.fn(async () => ({ quota: 100, usage: 3 })) };
    make(makeFetch(), { storage });
    expect(await mm.requestPersistence()).toEqual({ supported: true, persisted: true });
    expect(await mm.storageInfo()).toEqual({ quota: 100, usage: 3, persisted: false });
  });
  it('requestPersistence copes with a missing API', async () => {
    make(makeFetch(), { storage: null });
    expect(await mm.requestPersistence()).toEqual({ supported: false, persisted: false });
    expect(await mm.storageInfo()).toEqual({ quota: undefined, usage: undefined, persisted: false });
  });
});
