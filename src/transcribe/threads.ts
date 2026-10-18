export const MAX_THREADS = 4;
export const THREAD_CHOICES = ['auto', 1, 2, 4] as const;
export type ThreadChoice = (typeof THREAD_CHOICES)[number];

export interface ThreadEnv {
  crossOriginIsolated: boolean;
  hardwareConcurrency: number | undefined;
  /** Explicit thread count from the UI; missing = automatic. */
  requested?: number;
}

/** WASM threads need cross-origin isolation (SharedArrayBuffer); without it the session runs on one thread. */
export function chooseThreads(env: ThreadEnv): number {
  if (!env.crossOriginIsolated) return 1;
  const cores = Math.max(1, env.hardwareConcurrency || 1);
  const limit = Math.min(MAX_THREADS, cores);
  return env.requested ? Math.max(1, Math.min(limit, Math.floor(env.requested))) : limit;
}
