import type { Logger, LogEntry } from './logger';

declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;

export type ProviderName = 'compat' | 'gpu' | 'installedPacks';

export interface Report {
  app: { version: string; buildTime: string };
  generatedAt: string;
  userAgent: string;
  compat: unknown;
  gpu: unknown;
  storage: unknown;
  installedPacks: unknown;
  generations: unknown[];
  log: LogEntry[];
  [extra: string]: unknown;
}

export interface ReporterOptions {
  version: string;
  buildTime: string;
  userAgent: () => string;
  storageEstimate: () => Promise<unknown>;
  now: () => string;
}

export const GENERATION_RECORDS_IN_REPORT = 5;

export function createReporter(logger: Logger, options: ReporterOptions) {
  const scope = logger.scope('report');
  const providers = new Map<ProviderName, () => unknown | Promise<unknown>>();
  let generations: unknown[] = [];

  async function fromProvider(name: ProviderName, fallback: unknown) {
    const p = providers.get(name);
    if (!p) return fallback;
    try {
      return await p();
    } catch (e) {
      scope.warn(`provider ${name} failed`, String(e));
      return fallback;
    }
  }

  return {
    /** Modules that own report data register a provider; the reporter never imports them. */
    setProvider(name: ProviderName, fn: () => unknown | Promise<unknown>) {
      providers.set(name, fn);
    },
    recordGeneration(record: unknown) {
      generations = [...generations, record].slice(-GENERATION_RECORDS_IN_REPORT);
    },
    generations(): unknown[] {
      return generations.slice();
    },
    async buildReport(extra: Record<string, unknown> = {}): Promise<Report> {
      let storage: unknown = null;
      try {
        storage = await options.storageEstimate();
      } catch (e) {
        scope.warn('storage estimate failed', String(e));
      }
      return {
        app: { version: options.version, buildTime: options.buildTime },
        generatedAt: options.now(),
        userAgent: options.userAgent(),
        compat: await fromProvider('compat', null),
        gpu: await fromProvider('gpu', null),
        storage,
        installedPacks: await fromProvider('installedPacks', []),
        generations: generations.slice(),
        log: logger.entries(),
        ...extra,
      };
    },
  };
}

export function defaultReporterOptions(): ReporterOptions {
  return {
    version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev',
    buildTime: typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : 'unknown',
    userAgent: () => (typeof navigator !== 'undefined' ? navigator.userAgent : ''),
    storageEstimate: async () => (typeof navigator !== 'undefined' && navigator.storage?.estimate ? navigator.storage.estimate() : null),
    now: () => new Date().toISOString(),
  };
}
