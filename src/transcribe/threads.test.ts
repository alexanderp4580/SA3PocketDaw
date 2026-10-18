import { describe, expect, it } from 'vitest';
import { chooseThreads, THREAD_CHOICES } from './threads';

describe('chooseThreads', () => {
  it('uses one thread without cross-origin isolation', () => {
    expect(chooseThreads({ crossOriginIsolated: false, hardwareConcurrency: 8 })).toBe(1);
  });
  it('uses min(4, cores) when isolated', () => {
    expect(chooseThreads({ crossOriginIsolated: true, hardwareConcurrency: 8 })).toBe(4);
    expect(chooseThreads({ crossOriginIsolated: true, hardwareConcurrency: 2 })).toBe(2);
    expect(chooseThreads({ crossOriginIsolated: true, hardwareConcurrency: undefined })).toBe(1);
  });
  it('honours an explicit request, capped by what the page allows', () => {
    expect(chooseThreads({ crossOriginIsolated: true, hardwareConcurrency: 8, requested: 2 })).toBe(2);
    expect(chooseThreads({ crossOriginIsolated: true, hardwareConcurrency: 2, requested: 4 })).toBe(2);
    expect(chooseThreads({ crossOriginIsolated: false, hardwareConcurrency: 8, requested: 4 })).toBe(1);
  });
  it('lists the choices offered in the UI', () => {
    expect(THREAD_CHOICES).toEqual(['auto', 1, 2, 4]);
  });
});
