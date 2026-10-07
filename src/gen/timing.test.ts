import { describe, expect, it } from 'vitest';
import { createTimingRecorder } from './timing';

describe('timing recorder', () => {
  it('records stage spans relative to creation', async () => {
    let t = 1000;
    const rec = createTimingRecorder(() => t);
    t = 1010;
    rec.begin('a');
    t = 1040;
    rec.end('a');
    await rec.run('b', () => {
      t = 1100;
    });
    expect(rec.stages()).toEqual([
      { name: 'a', startMs: 10, endMs: 40 },
      { name: 'b', startMs: 40, endMs: 100 },
    ]);
  });
  it('ends a stage when its function throws', async () => {
    const rec = createTimingRecorder(() => 0);
    await expect(rec.run('x', () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(rec.stages().map((s) => s.name)).toEqual(['x']);
  });
  it('ignores end without begin', () => {
    const rec = createTimingRecorder(() => 0);
    rec.end('nope');
    expect(rec.stages()).toEqual([]);
  });
});
