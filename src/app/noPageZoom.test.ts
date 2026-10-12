import { describe, expect, it, vi } from 'vitest';
import { installNoPageZoom } from './noPageZoom';

describe('installNoPageZoom', () => {
  it('cancels Safari pinch gesture events and can be removed', () => {
    const handlers = new Map<string, (e: Event) => void>();
    const target = {
      addEventListener: (n: string, h: (e: Event) => void) => void handlers.set(n, h),
      removeEventListener: (n: string) => void handlers.delete(n),
    };
    const stop = installNoPageZoom(target as never);
    for (const name of ['gesturestart', 'gesturechange', 'gestureend']) {
      const e = { preventDefault: vi.fn() };
      handlers.get(name)!(e as never);
      expect(e.preventDefault).toHaveBeenCalledTimes(1);
    }
    stop();
    expect(handlers.size).toBe(0);
  });
});
