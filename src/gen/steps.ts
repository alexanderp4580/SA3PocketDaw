import { MAX_STEPS } from './protocol';

export const MIN_STEPS = 4;
export const CLOUD_MAX_STEPS = 8;

/** Allowed sampling steps: on-device up to the pipeline maximum, the cloud up to its own maximum. */
export function stepLimits(cloud: boolean): { min: number; max: number } {
  return { min: MIN_STEPS, max: cloud ? CLOUD_MAX_STEPS : MAX_STEPS };
}

export function clampSteps(v: number, cloud: boolean): number {
  const { min, max } = stepLimits(cloud);
  return Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : 8;
}
