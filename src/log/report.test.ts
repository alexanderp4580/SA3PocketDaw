import { describe, it, expect } from 'vitest';
import { createLogger } from './logger';
import { createReporter } from './report';

function setup() {
  const logger = createLogger({ console: null, now: () => 1 });
  const reporter = createReporter(logger, {
    version: '1.2.3',
    buildTime: '2026-01-01T00:00:00Z',
    userAgent: () => 'UA',
    storageEstimate: async () => ({ quota: 100, usage: 5 }),
    now: () => '2026-10-07T00:00:00Z',
  });
  return { logger, reporter };
}

describe('report', () => {
  it('contains version, build time, user agent, storage and log', async () => {
    const { logger, reporter } = setup();
    logger.scope('a').info('hello');
    const r = await reporter.buildReport();
    expect(r).toMatchObject({
      app: { version: '1.2.3', buildTime: '2026-01-01T00:00:00Z' },
      generatedAt: '2026-10-07T00:00:00Z',
      userAgent: 'UA',
      storage: { quota: 100, usage: 5 },
      compat: null, gpu: null, installedPacks: [], generations: [],
    });
    expect(r.log).toHaveLength(1);
  });

  it('includes registered providers (compat, gpu, installed packs)', async () => {
    const { reporter } = setup();
    reporter.setProvider('compat', () => ({ verdict: 'ok', checks: [] }));
    reporter.setProvider('gpu', async () => ({ vendor: 'v' }));
    reporter.setProvider('installedPacks', () => ['encoder']);
    const r = await reporter.buildReport();
    expect(r.compat).toEqual({ verdict: 'ok', checks: [] });
    expect(r.gpu).toEqual({ vendor: 'v' });
    expect(r.installedPacks).toEqual(['encoder']);
  });

  it('keeps the last 5 generation timing records', async () => {
    const { reporter } = setup();
    for (let i = 0; i < 7; i++) reporter.recordGeneration({ id: i });
    const r = await reporter.buildReport();
    expect(r.generations.map((g: any) => g.id)).toEqual([2, 3, 4, 5, 6]);
    expect(reporter.generations()).toHaveLength(5);
  });

  it('merges extra fields and survives a failing provider', async () => {
    const { reporter, logger } = setup();
    reporter.setProvider('gpu', () => { throw new Error('x'); });
    const r = await reporter.buildReport({ note: 'n' });
    expect(r.note).toBe('n');
    expect(r.gpu).toBeNull();
    expect(logger.entries().some((e) => e.level === 'warn' && e.scope === 'report')).toBe(true);
  });
});
