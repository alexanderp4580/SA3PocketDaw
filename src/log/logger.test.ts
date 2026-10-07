import { describe, it, expect, vi } from 'vitest';
import { createLogger, forwardLogs, type LogEntry } from './logger';

function make(capacity = 5000, extra: Parameters<typeof createLogger>[0] = {}) {
  let t = 0;
  const sink = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const logger = createLogger({ capacity, now: () => ++t, console: sink, ...extra });
  return { logger, sink };
}

describe('logger', () => {
  it('records entries with time, level, scope, message and data', () => {
    const { logger } = make();
    logger.scope('models').info('start', { id: 'small' });
    expect(logger.entries()).toEqual([{ t: 1, level: 'info', scope: 'models', message: 'start', data: { id: 'small' } }]);
  });

  it('omits data when none given', () => {
    const { logger } = make();
    logger.scope('a').debug('x');
    expect('data' in logger.entries()[0]!).toBe(false);
  });

  it('keeps only the newest entries when the ring is full', () => {
    const { logger } = make(3);
    for (let i = 0; i < 5; i++) logger.scope('s').info(`m${i}`);
    expect(logger.entries().map((e) => e.message)).toEqual(['m2', 'm3', 'm4']);
  });

  it('default capacity is 5000', () => {
    const { logger } = make();
    for (let i = 0; i < 5100; i++) logger.scope('s').debug(`m${i}`);
    expect(logger.entries()).toHaveLength(5000);
    expect(logger.entries()[0]!.message).toBe('m100');
  });

  it('mirrors each level to the matching console method', () => {
    const { logger, sink } = make();
    const s = logger.scope('x');
    s.debug('d'); s.info('i'); s.warn('w'); s.error('e');
    expect(sink.debug).toHaveBeenCalledOnce();
    expect(sink.info).toHaveBeenCalledOnce();
    expect(sink.warn).toHaveBeenCalledOnce();
    expect(sink.error).toHaveBeenCalledOnce();
    expect(sink.warn.mock.calls[0]![0]).toContain('[x] w');
  });

  it('notifies subscribers until they unsubscribe', () => {
    const { logger } = make();
    const seen: string[] = [];
    const off = logger.subscribe((e) => seen.push(e.message));
    logger.scope('s').info('a');
    off();
    logger.scope('s').info('b');
    expect(seen).toEqual(['a']);
  });

  it('clear empties the ring and tells subscribers', () => {
    const { logger } = make();
    const cleared = vi.fn();
    logger.subscribe(() => {}, cleared);
    logger.scope('s').info('a');
    logger.clear();
    expect(logger.entries()).toEqual([]);
    expect(cleared).toHaveBeenCalledOnce();
  });

  it('ingest merges entries from another thread in time order without console mirroring', () => {
    const { logger, sink } = make();
    logger.scope('main').info('one'); // t=1
    logger.scope('main').info('three'); // t=2
    const remote: LogEntry = { t: 1.5, level: 'warn', scope: 'worker', message: 'two' };
    logger.ingest(remote);
    expect(logger.entries().map((e) => e.message)).toEqual(['one', 'two', 'three']);
    expect(sink.warn).not.toHaveBeenCalled();
  });

  it('forwardLogs posts every new entry as a log message', () => {
    const { logger } = make();
    const posted: unknown[] = [];
    const stop = forwardLogs(logger, (m) => posted.push(m));
    logger.scope('w').error('boom');
    stop();
    logger.scope('w').error('ignored');
    expect(posted).toEqual([{ type: 'log', entry: expect.objectContaining({ scope: 'w', message: 'boom' }) }]);
  });

  it('captures uncaught errors and unhandled rejections', () => {
    const handlers: Record<string, (e: any) => void> = {};
    const target = { addEventListener: (n: string, h: (e: any) => void) => (handlers[n] = h), removeEventListener: vi.fn() };
    const { logger } = make();
    const stop = logger.captureGlobalErrors(target);
    handlers.error!({ message: 'bad', filename: 'a.js', lineno: 3, colno: 4, error: new Error('bad') });
    handlers.unhandledrejection!({ reason: new Error('nope') });
    const e = logger.entries();
    expect(e[0]).toMatchObject({ level: 'error', scope: 'window', message: 'Uncaught: bad (a.js:3:4)' });
    expect(e[1]).toMatchObject({ level: 'error', scope: 'window', message: 'Unhandled rejection: nope' });
    stop();
    expect(target.removeEventListener).toHaveBeenCalledTimes(2);
  });
});
