import { describe, expect, it } from 'vitest';
import { CLOUD_MAX_STEPS } from './cloud';
import { MAX_STEPS } from './protocol';
import { clampSteps, MIN_STEPS, stepLimits } from './steps';

describe('step limits', () => {
  it('on-device runs 4..MAX_STEPS and the cloud 4..8', () => {
    expect(MIN_STEPS).toBe(4);
    expect(stepLimits(false)).toEqual({ min: 4, max: MAX_STEPS });
    expect(stepLimits(true)).toEqual({ min: 4, max: CLOUD_MAX_STEPS });
    expect(CLOUD_MAX_STEPS).toBe(8);
  });
  it('clamps and rounds to the limits', () => {
    expect(clampSteps(2, false)).toBe(4);
    expect(clampSteps(40, false)).toBe(40);
    expect(clampSteps(MAX_STEPS + 1, false)).toBe(MAX_STEPS);
    expect(clampSteps(16, true)).toBe(8);
    expect(clampSteps(2, true)).toBe(4);
    expect(clampSteps(6.4, true)).toBe(6);
    expect(clampSteps(NaN, true)).toBe(8);
    expect(clampSteps(NaN, false)).toBe(8);
  });
});
