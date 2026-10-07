import { log as defaultLog, type Logger } from '../log';
import type { Project } from './projectModel';
import type { InstrumentProfile } from '../audio/instrument/types';

export const DB_NAME = 'sa3daw';
export const PROJECT_STORE = 'project';
export const SAMPLE_STORE = 'samples';
export const PROJECT_KEY = 'current';
export const SAVE_DEBOUNCE_MS = 500;

export interface SampleMeta {
  mode?: 'sample'|'instrument';
  fullPrompt?:string;
  prompt?: string;
  model?: string;
  seed?: number;
  steps?: number;
  seconds?: number;
  generatedAt?: number;
  detectedMidi?: number;
  confidence?: number;
}
export interface StoredSample {
  instrument?:InstrumentProfile;
  pcm: Float32Array;
  sampleRate: number;
  meta: SampleMeta;
}

export interface ProjectStoreOptions {
  idb?: IDBFactory;
  debounceMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (h: unknown) => void;
  log?: Logger;
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function done(tx: IDBTransaction): Promise<void> {
  return new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error ?? new Error('transaction aborted'));
  });
}

const sampleIds = (p: Project | null): Set<string> =>
  new Set((p?.tracks ?? []).map((t) => t.sampleId).filter((s): s is string => !!s));

export function createProjectStore(options: ProjectStoreOptions = {}) {
  const idb = options.idb ?? globalThis.indexedDB;
  const debounceMs = options.debounceMs ?? SAVE_DEBOUNCE_MS;
  const setTimer = options.setTimer ?? ((fn, ms) => globalThis.setTimeout(fn, ms));
  const clearTimer = options.clearTimer ?? ((h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>));
  const scope = (options.log ?? defaultLog).scope('project');

  let dbPromise: Promise<IDBDatabase> | null = null;
  let current: Project | null = null;
  let dirty = false;
  let timer: unknown = null;
  let saving: Promise<void> = Promise.resolve();
  const subs = new Set<(p: Project | null) => void>();

  function db(): Promise<IDBDatabase> {
    dbPromise ??= new Promise((res, rej) => {
      const r = idb.open(DB_NAME, 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains(PROJECT_STORE)) d.createObjectStore(PROJECT_STORE);
        if (!d.objectStoreNames.contains(SAMPLE_STORE)) d.createObjectStore(SAMPLE_STORE);
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbPromise;
  }

  async function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const d = await db();
    const tx = d.transaction(store, mode);
    const result = req(fn(tx.objectStore(store)));
    const [value] = await Promise.all([result, done(tx)]);
    return value;
  }

  function emit() {
    for (const f of subs) f(current);
  }

  function cancelTimer() {
    if (timer !== null) clearTimer(timer);
    timer = null;
  }

  async function writeProject(p: Project) {
    await run(PROJECT_STORE, 'readwrite', (s) => s.put(structuredClone(p), PROJECT_KEY));
    scope.debug('saved', { id: p.id, tracks: p.tracks.length });
  }

  const store = {
    subscribe(fn: (p: Project | null) => void): () => void {
      subs.add(fn);
      fn(current);
      return () => subs.delete(fn);
    },
    get(): Project | null {
      return current;
    },

    /** Reads the saved project into the store and removes samples no track references. */
    async load(): Promise<Project | null> {
      const p = ((await run(PROJECT_STORE, 'readonly', (s) => s.get(PROJECT_KEY))) as Project | undefined) ?? null;
      current = p;
      dirty = false;
      if (p) {
        const keep = sampleIds(p);
        const keys = (await run(SAMPLE_STORE, 'readonly', (s) => s.getAllKeys())) as string[];
        for (const k of keys) {
          if (!keep.has(k)) {
            await store.deleteSample(k);
            scope.info('removed orphan sample', { id: k });
          }
        }
      }
      scope.info('loaded', { found: !!p, tracks: p?.tracks.length ?? 0 });
      emit();
      return p;
    },

    /** Replaces the current project, schedules a save and drops samples no longer referenced. */
    set(next: Project): void {
      const before = sampleIds(current);
      const after = sampleIds(next);
      current = next;
      emit();
      store.save(next);
      for (const id of before) {
        if (!after.has(id)) void store.deleteSample(id).catch((e) => scope.error('orphan delete failed', { id, error: String(e) }));
      }
    },
    update(fn: (p: Project) => Project): void {
      if (current) store.set(fn(current));
    },

    /** Debounced save. */
    save(p: Project): void {
      current = p;
      dirty = true;
      cancelTimer();
      timer = setTimer(() => {
        timer = null;
        void store.flush();
      }, debounceMs);
    },
    /** Writes any pending project now. */
    async flush(): Promise<void> {
      cancelTimer();
      if (dirty && current) {
        dirty = false;
        const p = current;
        saving = saving.then(() => writeProject(p));
      }
      await saving;
    },

    async putSample(id: string, sample: StoredSample): Promise<void> {
      await run(SAMPLE_STORE, 'readwrite', (s) => s.put(sample, id));
      scope.debug('sample saved', { id, samples: sample.pcm.length });
    },
    async getSample(id: string): Promise<StoredSample | null> {
      return ((await run(SAMPLE_STORE, 'readonly', (s) => s.get(id))) as StoredSample | undefined) ?? null;
    },
    async deleteSample(id: string): Promise<void> {
      await run(SAMPLE_STORE, 'readwrite', (s) => s.delete(id));
    },
    async listSampleIds(): Promise<string[]> {
      return (await run(SAMPLE_STORE, 'readonly', (s) => s.getAllKeys())) as string[];
    },

    async deleteProject(): Promise<void> {
      cancelTimer();
      dirty = false;
      await saving;
      current = null;
      await run(PROJECT_STORE, 'readwrite', (s) => s.delete(PROJECT_KEY));
      for (const id of await store.listSampleIds()) await store.deleteSample(id);
      scope.info('project deleted');
      emit();
    },
    async clearAll(): Promise<void> {
      cancelTimer();
      dirty = false;
      await saving;
      current = null;
      await run(PROJECT_STORE, 'readwrite', (s) => s.clear());
      await run(SAMPLE_STORE, 'readwrite', (s) => s.clear());
      scope.info('cleared');
      emit();
    },

    /** Hooks clearAll into a registry such as the model manager's addClearHook. */
    registerClear(addClearHook: (hook: () => Promise<void> | void) => void): void {
      addClearHook(() => store.clearAll());
    },

    async close(): Promise<void> {
      await store.flush();
      if (dbPromise) (await dbPromise).close();
      dbPromise = null;
    },
  };
  return store;
}

export type ProjectStore = ReturnType<typeof createProjectStore>;
