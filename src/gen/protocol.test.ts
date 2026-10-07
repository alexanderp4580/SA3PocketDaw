import { describe, expect, it } from 'vitest';
import { isGenerateParams, isWorkerEvent, isWorkerRequest } from './protocol';

const ok = { model: 'small-music', prompt: 'x', seconds: 2, steps: 8, seed: 5 };

describe('request guards', () => {
  it('accepts valid requests', () => {
    expect(isWorkerRequest({ type: 'generate', id: 1, ...ok })).toBe(true);
    expect(isWorkerRequest({ type: 'cancel', id: 1 })).toBe(true);
    expect(isWorkerRequest({ type: 'unload' })).toBe(true);
  });
  it('rejects malformed requests', () => {
    expect(isWorkerRequest(null)).toBe(false);
    expect(isWorkerRequest({ type: 'nope' })).toBe(false);
    expect(isWorkerRequest({ type: 'cancel' })).toBe(false);
    expect(isWorkerRequest({ type: 'generate', id: 1, ...ok, model: 'huge' })).toBe(false);
    expect(isWorkerRequest({ type: 'generate', ...ok })).toBe(false);
  });
  it('validates generate params ranges', () => {
    expect(isGenerateParams({ ...ok, seconds: 0 })).toBe(false);
    expect(isGenerateParams({ ...ok, seconds: NaN })).toBe(false);
    expect(isGenerateParams({ ...ok, steps: 0 })).toBe(false);
    expect(isGenerateParams({ ...ok, steps: 2.5 })).toBe(false);
    expect(isGenerateParams({ ...ok, seed: -1 })).toBe(false);
    expect(isGenerateParams({ ...ok, seed: 2 ** 32 })).toBe(false);
    expect(isGenerateParams({ ...ok, prompt: '  ' })).toBe(false);
  });
});

describe('event guard', () => {
  it('accepts each event type', () => {
    expect(isWorkerEvent({ type: 'progress', id: 1, stage: 'encode', fraction: 0.2, message: 'm' })).toBe(true);
    expect(isWorkerEvent({ type: 'log', entry: { t: 1, level: 'info', scope: 's', message: 'm' } })).toBe(true);
    expect(isWorkerEvent({ type: 'timing', id: 1, stages: [] })).toBe(true);
    expect(isWorkerEvent({ type: 'error', id: 1, message: 'x' })).toBe(true);
    expect(isWorkerEvent({ type: 'unloaded' })).toBe(true);
    expect(
      isWorkerEvent({ type: 'complete', id: 1, channels: [new Float32Array(2)], sampleRate: 44100, stats: {}, timings: [] }),
    ).toBe(true);
  });
  it('rejects bad events', () => {
    expect(isWorkerEvent({ type: 'progress', id: 1 })).toBe(false);
    expect(isWorkerEvent({ type: 'complete', id: 1, channels: [], sampleRate: 1, stats: {}, timings: [] })).toBe(false);
    expect(isWorkerEvent({ type: 'complete', id: 1, channels: [[1]], sampleRate: 1, stats: {}, timings: [] })).toBe(false);
    expect(isWorkerEvent('x')).toBe(false);
  });
});
