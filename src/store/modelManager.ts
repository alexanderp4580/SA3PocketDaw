import { log as defaultLog, reporter, type Logger } from '../log';

export const MODEL_CACHE_NAME = 'sa3-models-v1';
export const MANIFEST_CACHE_NAME = 'sa3-manifest-v1';

export interface ManifestFile {
  path: string;
  bytes: number;
}
export interface Pack {
  id: string;
  label: string;
  requires: string[];
  files: ManifestFile[];
  totalBytes: number;
}
export interface Manifest {
  version: number;
  packs: Pack[];
}

export type PackStatus = 'missing' | 'partial' | 'installed';
export interface PackState {
  status: PackStatus;
  presentFiles: number;
  totalFiles: number;
}

export interface DownloadProgress {
  /** Pack being downloaded when the event fired (a required pack or the requested one). */
  packId: string;
  file: string;
  fileBytes: number;
  fileTotal: number;
  /** Bytes complete across the requested pack and every pack it requires. */
  packBytes: number;
  packTotal: number;
}

export interface DownloadOptions {
  signal?: AbortSignal;
  onProgress?: (p: DownloadProgress) => void;
}

interface CacheLike {
  match(url: string): Promise<Response | undefined>;
  put(url: string, res: Response): Promise<void>;
  delete(url: string): Promise<boolean>;
}
interface CachesLike {
  open(name: string): Promise<CacheLike>;
  delete(name: string): Promise<boolean>;
}
interface StorageLike {
  persist?(): Promise<boolean>;
  persisted?(): Promise<boolean>;
  estimate?(): Promise<{ quota?: number; usage?: number }>;
}

export interface ModelManagerOptions {
  fetch?: typeof fetch;
  caches?: CachesLike;
  /** Absolute URL of the models directory, ending in a slash. */
  baseUrl?: string;
  storage?: StorageLike | null;
  log?: Logger;
}

export function createModelManager(options: ModelManagerOptions = {}) {
  const doFetch: typeof fetch = options.fetch ?? ((...a) => globalThis.fetch(...a));
  const caches = options.caches ?? (globalThis.caches as unknown as CachesLike);
  const baseUrl = options.baseUrl ?? new URL('models/', globalThis.location?.href ?? 'http://localhost/').href;
  const storage: StorageLike | null =
    options.storage !== undefined ? options.storage : typeof navigator !== 'undefined' ? (navigator.storage as StorageLike | undefined) ?? null : null;
  const scope = (options.log ?? defaultLog).scope('models');

  let manifest: Manifest | null = null;
  let lastStates: Record<string, PackState> = {};
  const clearHooks: Array<() => Promise<void> | void> = [];
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());

  const urlFor = (path: string) => baseUrl + path;
  const manifestUrl = baseUrl + 'manifest.json';

  const requireManifest = (): Manifest => {
    if (!manifest) throw new Error('manifest not loaded');
    return manifest;
  };
  const packById = (id: string): Pack => {
    const p = requireManifest().packs.find((x) => x.id === id);
    if (!p) throw new Error(`unknown pack ${id}`);
    return p;
  };

  async function storedSize(cache: CacheLike, path: string): Promise<number | null> {
    const res = await cache.match(urlFor(path));
    if (!res) return null;
    const len = res.headers.get('content-length');
    if (len !== null && /^\d+$/.test(len)) {
      void res.body?.cancel();
      return Number(len);
    }
    return (await res.blob()).size;
  }

  async function fileComplete(cache: CacheLike, f: ManifestFile): Promise<boolean> {
    return (await storedSize(cache, f.path)) === f.bytes;
  }

  async function packStates(): Promise<Record<string, PackState>> {
    const m = requireManifest();
    const cache = await caches.open(MODEL_CACHE_NAME);
    const out: Record<string, PackState> = {};
    for (const p of m.packs) {
      let present = 0;
      for (const f of p.files) if (await fileComplete(cache, f)) present++;
      out[p.id] = {
        status: present === p.files.length && present > 0 ? 'installed' : present > 0 ? 'partial' : 'missing',
        presentFiles: present,
        totalFiles: p.files.length,
      };
    }
    lastStates = out;
    return out;
  }

  async function loadManifest(): Promise<Manifest> {
    const metaCache = await caches.open(MANIFEST_CACHE_NAME);
    try {
      const res = await doFetch(manifestUrl, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      manifest = JSON.parse(text) as Manifest;
      await metaCache.put(manifestUrl, new Response(text, { headers: { 'content-type': 'application/json' } }));
      scope.info('manifest fetched and cached', { packs: manifest.packs.map((p) => p.id) });
      return manifest;
    } catch (e) {
      scope.warn('manifest fetch failed; trying the cached copy', String(e));
      const cached = await metaCache.match(manifestUrl);
      if (!cached) {
        scope.error('manifest unavailable: network failed and nothing is cached');
        throw new Error(`Model manifest unavailable: ${e instanceof Error ? e.message : String(e)}`);
      }
      manifest = (await cached.json()) as Manifest;
      scope.info('manifest loaded from cache');
      return manifest;
    }
  }

  /** Requested pack with every pack it requires, requirements first. */
  function closure(id: string, seen = new Set<string>()): Pack[] {
    if (seen.has(id)) return [];
    seen.add(id);
    const p = packById(id);
    return [...p.requires.flatMap((r) => closure(r, seen)), p];
  }

  async function downloadFile(cache: CacheLike, f: ManifestFile, signal: AbortSignal | undefined, onBytes: (n: number) => void) {
    const res = await doFetch(urlFor(f.path), { signal });
    if (!res.ok) throw new Error(`Download of ${f.path} failed: HTTP ${res.status}`);
    if (!res.body) throw new Error(`Download of ${f.path} failed: no response body`);
    const reader = res.body.getReader();
    const parts: Uint8Array<ArrayBuffer>[] = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value as Uint8Array<ArrayBuffer>);
      got += value.byteLength;
      onBytes(got);
    }
    if (got !== f.bytes) throw new Error(`Size mismatch for ${f.path}: got ${got} bytes, expected ${f.bytes}`);
    await cache.put(urlFor(f.path), new Response(new Blob(parts), { status: 200, headers: { 'content-length': String(f.bytes) } }));
  }

  async function download(id: string, opts: DownloadOptions = {}): Promise<void> {
    const packs = closure(id);
    const cache = await caches.open(MODEL_CACHE_NAME);
    const packTotal = packs.reduce((s, p) => s + p.totalBytes, 0);
    scope.info(`download ${id} started`, { packs: packs.map((p) => p.id), bytes: packTotal });
    let done = 0;
    const t0 = performance.now();
    try {
      for (const p of packs) {
        for (const f of p.files) {
          opts.signal?.throwIfAborted();
          if (await fileComplete(cache, f)) {
            done += f.bytes;
            scope.debug(`skip ${f.path}: already stored`);
            continue;
          }
          scope.debug(`download ${f.path} (${f.bytes} bytes)`);
          const base = done;
          await downloadFile(cache, f, opts.signal, (n) => {
            opts.onProgress?.({ packId: p.id, file: f.path, fileBytes: n, fileTotal: f.bytes, packBytes: base + n, packTotal });
          });
          done += f.bytes;
          opts.onProgress?.({ packId: p.id, file: f.path, fileBytes: f.bytes, fileTotal: f.bytes, packBytes: done, packTotal });
          scope.info(`stored ${f.path}`);
        }
      }
      scope.info(`download ${id} complete in ${Math.round(performance.now() - t0)} ms`);
    } catch (e) {
      const aborted = e instanceof Error && e.name === 'AbortError';
      (aborted ? scope.warn : scope.error)(`download ${id} ${aborted ? 'aborted' : 'failed'}`, String(e));
      throw e;
    } finally {
      await packStates().catch(() => {});
      notify();
    }
  }

  async function removeFiles(paths: string[]) {
    const cache = await caches.open(MODEL_CACHE_NAME);
    for (const path of paths) await cache.delete(urlFor(path));
  }

  async function deletePack(id: string): Promise<void> {
    const m = requireManifest();
    const target = packById(id);
    const states = await packStates();
    const installedOthers = (excluding: string[]) => m.packs.filter((p) => !excluding.includes(p.id) && states[p.id]!.status === 'installed');

    if (installedOthers([id]).some((p) => p.requires.includes(id))) {
      scope.warn(`delete ${id} skipped: another installed pack needs it`);
      return;
    }
    const removed: string[] = [id];
    await removeFiles(target.files.map((f) => f.path));
    // Requirements no remaining installed pack needs go with the last pack that used them.
    for (const reqId of target.requires) {
      const stillNeeded = installedOthers([id, reqId]).some((p) => p.requires.includes(reqId));
      if (!stillNeeded) {
        await removeFiles(packById(reqId).files.map((f) => f.path));
        removed.push(reqId);
      }
    }
    scope.info(`deleted packs ${removed.join(', ')}`);
    await packStates();
    notify();
  }

  async function deleteAll(): Promise<void> {
    await caches.delete(MODEL_CACHE_NAME);
    scope.info('all model files deleted');
    if (manifest) await packStates();
    notify();
  }

  async function clearAllAppData(): Promise<void> {
    scope.warn('clearing all app data');
    await caches.delete(MODEL_CACHE_NAME);
    await caches.delete(MANIFEST_CACHE_NAME);
    for (const hook of clearHooks) {
      try {
        await hook();
      } catch (e) {
        scope.error('clear hook failed', String(e));
      }
    }
    lastStates = {};
    notify();
    scope.info('app data cleared');
  }

  async function requestPersistence(): Promise<{ supported: boolean; persisted: boolean }> {
    if (!storage?.persist) {
      scope.warn('persistent storage API not available');
      return { supported: false, persisted: false };
    }
    const persisted = await storage.persist();
    scope.info(`persistent storage ${persisted ? 'granted' : 'not granted'}`);
    return { supported: true, persisted };
  }

  async function storageInfo(): Promise<{ quota?: number; usage?: number; persisted: boolean }> {
    const est = storage?.estimate ? await storage.estimate() : {};
    const persisted = storage?.persisted ? await storage.persisted() : false;
    return { quota: est.quota, usage: est.usage, persisted };
  }

  async function openFile(path: string): Promise<Response> {
    const cache = await caches.open(MODEL_CACHE_NAME);
    const res = await cache.match(urlFor(path));
    if (!res) {
      scope.error(`openFile: ${path} is not installed`);
      throw new Error(`Model file ${path} is not installed`);
    }
    return res;
  }

  const api = {
    loadManifest,
    packStates,
    download,
    deletePack,
    deleteAll,
    clearAllAppData,
    requestPersistence,
    storageInfo,
    openFile,
    /** Register work to run in clearAllAppData (project and sample stores). */
    addClearHook(hook: () => Promise<void> | void) {
      clearHooks.push(hook);
    },
    onChange(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getManifest: () => manifest,
    setManifest(m: Manifest) {
      manifest = m;
    },
    installedPackIds: () => Object.entries(lastStates).filter(([, s]) => s.status === 'installed').map(([id]) => id),
  };
  return api;
}

export type ModelManager = ReturnType<typeof createModelManager>;

let shared: ModelManager | null = null;
/** App-wide manager; created on first use so tests can build their own. */
export function modelManager(): ModelManager {
  if (!shared) {
    shared = createModelManager();
    reporter.setProvider('installedPacks', () => shared!.installedPackIds());
  }
  return shared;
}
