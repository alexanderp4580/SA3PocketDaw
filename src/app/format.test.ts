import { describe, expect, it } from 'vitest';
import { canContinue, failedReasons, filterLog, formatBytes, formatElapsed, formatPosition, modelCards, modelHint, parseBpm, peaksOf, timingRows } from './format';
import type { Manifest } from '../store/modelManager';

const manifest: Manifest = {
  version: 1,
  packs: [
    { id: 'encoder', label: 'e', requires: [], files: [{ path: 'a', bytes: 1 }], totalBytes: 100 },
    { id: 'small-music', label: 's', requires: ['encoder'], files: [{ path: 'b', bytes: 1 }, { path: 'c', bytes: 1 }], totalBytes: 400 },
  ],
};

describe('format', () => {
  it('formats bytes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(433_426_045)).toBe('413 MB');
    expect(formatBytes(undefined)).toBe('unknown');
  });
  it('formats elapsed time', () => {
    expect(formatElapsed(12_340)).toBe('12.3 s');
    expect(formatElapsed(125_000)).toBe('2:05');
  });
  it('formats position as bar.beat.sixteenth', () => {
    expect(formatPosition(0)).toBe('1.1.1');
    expect(formatPosition(5)).toBe('1.2.2');
    expect(formatPosition(16 * 2 + 15.9)).toBe('3.4.4');
  });
  it('parses bpm', () => {
    expect(parseBpm(' 96 ')).toBe(96);
    expect(parseBpm('abc')).toBeNull();
    expect(parseBpm('0')).toBeNull();
  });
  it('builds model cards from manifest and states', () => {
    const states = {
      encoder: { status: 'installed' as const, presentFiles: 1, totalFiles: 1 },
      'small-music': { status: 'partial' as const, presentFiles: 1, totalFiles: 2 },
    };
    const cards = modelCards(manifest, states);
    const music = cards.find((c) => c.id === 'small-music')!;
    expect(music).toMatchObject({ available: true, status: 'partial', bytes: 500, presentFiles: 2, totalFiles: 3 });
    expect(modelHint(music)).toBe('Download on Models screen');
    const sfx = cards.find((c) => c.id === 'small-sfx')!;
    expect(sfx.available).toBe(false);
    expect(modelHint(sfx)).toBe('not available');
    const full = modelCards(manifest, { ...states, 'small-music': { status: 'installed', presentFiles: 2, totalFiles: 2 } });
    expect(full.find((c) => c.id === 'small-music')!.status).toBe('installed');
    expect(modelHint(full.find((c) => c.id === 'small-music')!)).toBeNull();
  });
  it('handles a missing manifest', () => {
    expect(modelCards(null, {}).every((c) => !c.available)).toBe(true);
  });
  it('computes waveform peaks', () => {
    const pcm = Float32Array.from([0, 0.5, -1, 0.2]);
    expect(Array.from(peaksOf(pcm, 2))).toEqual([0.5, 1]);
    expect(peaksOf(new Float32Array(0), 4).length).toBe(4);
  });
  it('filters log by level and scope', () => {
    const e = (level: any, scope: string) => ({ t: 0, level, scope, message: 'm' });
    const entries = [e('info', 'gen'), e('debug', 'gen'), e('error', 'audio.engine'), e('info', 'models')];
    expect(filterLog(entries, new Set(['info', 'error']), '').length).toBe(3);
    expect(filterLog(entries, new Set(['info', 'error', 'debug']), 'audio').length).toBe(1);
    expect(filterLog(entries, new Set(['info']), 'gen').length).toBe(1);
  });
  it('folds denoise steps in timing rows', () => {
    const rows = timingRows({
      stages: [
        { name: 'load-dit', startMs: 0, endMs: 100 },
        { name: 'denoise-step-0', startMs: 100, endMs: 200 },
        { name: 'denoise-step-1', startMs: 200, endMs: 350 },
        { name: 'total', startMs: 0, endMs: 400 },
      ],
    });
    expect(rows).toEqual([
      { stage: 'load-dit', ms: 100 },
      { stage: 'denoise (2 steps)', ms: 250 },
      { stage: 'total', ms: 400 },
    ]);
    expect(timingRows(null)).toEqual([]);
  });
  it('derives compat gate state', () => {
    const r = { verdict: 'no' as const, checks: [{ id: 'a', label: 'WebGPU', status: 'fail' as const, detail: 'missing' }, { id: 'b', label: 'x', status: 'pass' as const, detail: '' }] };
    expect(failedReasons(r)).toEqual(['WebGPU: missing']);
    expect(canContinue(r)).toBe(false);
    expect(canContinue({ ...r, verdict: 'maybe' })).toBe(true);
    expect(canContinue(null)).toBe(false);
  });
});
