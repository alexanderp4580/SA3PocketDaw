import { describe, expect, it, vi } from 'vitest';
import { audioUnlockOnce } from './unlock';

describe('audioUnlockOnce', () => {
  it('unlocks on the first gesture only', () => {
    const handlers = new Map<string, () => void>();
    const target = {
      addEventListener: (n: string, h: () => void) => void handlers.set(n, h),
      removeEventListener: (n: string) => void handlers.delete(n),
    };
    const unlock = vi.fn(async () => {});
    audioUnlockOnce(unlock, target as never);
    handlers.get('pointerdown')!();
    expect(unlock).toHaveBeenCalledTimes(1);
    expect(handlers.size).toBe(0);
  });
});
