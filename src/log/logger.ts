export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  t: number;
  level: LogLevel;
  scope: string;
  message: string;
  data?: unknown;
}

export interface ScopedLogger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
}

export type LogMessage = { type: 'log'; entry: LogEntry };

interface ConsoleSink {
  debug(...a: unknown[]): void;
  info(...a: unknown[]): void;
  warn(...a: unknown[]): void;
  error(...a: unknown[]): void;
}

interface ErrorTarget {
  addEventListener(name: string, handler: (e: any) => void): void;
  removeEventListener(name: string, handler: (e: any) => void): void;
}

export interface LoggerOptions {
  capacity?: number;
  now?: () => number;
  console?: ConsoleSink | null;
}

export const LOG_CAPACITY = 5000;

function describeError(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  return typeof reason === 'string' ? reason : JSON.stringify(reason) ?? String(reason);
}

export function createLogger(options: LoggerOptions = {}) {
  const capacity = options.capacity ?? LOG_CAPACITY;
  const now = options.now ?? (() => Date.now());
  const sink: ConsoleSink | null = options.console === undefined ? console : options.console;
  let ring: LogEntry[] = [];
  const listeners = new Set<(e: LogEntry) => void>();
  const clearListeners = new Set<() => void>();

  function push(entry: LogEntry) {
    ring.push(entry);
    if (ring.length > capacity) ring = ring.slice(ring.length - capacity);
    for (const l of listeners) l(entry);
  }

  function write(level: LogLevel, scope: string, message: string, data?: unknown) {
    const entry: LogEntry = { t: now(), level, scope, message };
    if (data !== undefined) entry.data = data;
    push(entry);
    if (sink) {
      const line = `[${scope}] ${message}`;
      if (data !== undefined) sink[level](line, data);
      else sink[level](line);
    }
  }

  const logger = {
    scope(name: string): ScopedLogger {
      return {
        debug: (m, d) => write('debug', name, m, d),
        info: (m, d) => write('info', name, m, d),
        warn: (m, d) => write('warn', name, m, d),
        error: (m, d) => write('error', name, m, d),
      };
    },
    entries(): LogEntry[] {
      return ring.slice();
    },
    subscribe(listener: (e: LogEntry) => void, onClear?: () => void): () => void {
      listeners.add(listener);
      if (onClear) clearListeners.add(onClear);
      return () => {
        listeners.delete(listener);
        if (onClear) clearListeners.delete(onClear);
      };
    },
    clear() {
      ring = [];
      for (const l of clearListeners) l();
    },
    /** Merge an entry produced on another thread; ordered by time, not mirrored to the console. */
    ingest(entry: LogEntry) {
      let i = ring.length;
      while (i > 0 && ring[i - 1]!.t > entry.t) i--;
      if (i === ring.length) return push(entry);
      ring.splice(i, 0, entry);
      if (ring.length > capacity) ring = ring.slice(ring.length - capacity);
      for (const l of listeners) l(entry);
    },
    captureGlobalErrors(target: ErrorTarget = globalThis as unknown as ErrorTarget): () => void {
      const scope = logger.scope('window');
      const onError = (e: any) => {
        const where = e.filename ? ` (${e.filename}:${e.lineno}:${e.colno})` : '';
        scope.error(`Uncaught: ${e.message}${where}`, e.error instanceof Error ? e.error.stack : undefined);
      };
      const onRejection = (e: any) => {
        scope.error(`Unhandled rejection: ${describeError(e.reason)}`, e.reason instanceof Error ? e.reason.stack : undefined);
      };
      target.addEventListener('error', onError);
      target.addEventListener('unhandledrejection', onRejection);
      return () => {
        target.removeEventListener('error', onError);
        target.removeEventListener('unhandledrejection', onRejection);
      };
    },
  };
  return logger;
}

export type Logger = ReturnType<typeof createLogger>;

/** Worker side: post every new entry to the main thread. Returns a stop function. */
export function forwardLogs(logger: Logger, post: (m: LogMessage) => void): () => void {
  return logger.subscribe((entry) => post({ type: 'log', entry }));
}

/** Main side: true and merged when a worker message is a log message. */
export function ingestWorkerMessage(logger: Logger, data: unknown): boolean {
  const m = data as Partial<LogMessage> | null;
  if (m && m.type === 'log' && m.entry) {
    logger.ingest(m.entry);
    return true;
  }
  return false;
}
