import { describe, it, expect, vi } from 'vitest';
import { registerServiceWorker } from './registerSw';

describe('registerServiceWorker', () => {
  it('registers /sw.js on secure production contexts', async () => {
    const register = vi.fn().mockResolvedValue({ scope: '/' });
    await registerServiceWorker({ secure: true, prod: true, sw: { register } });
    expect(register).toHaveBeenCalledWith('/sw.js');
  });
  it('does nothing on insecure contexts or dev builds', async () => {
    const register = vi.fn();
    await registerServiceWorker({ secure: false, prod: true, sw: { register } });
    await registerServiceWorker({ secure: true, prod: false, sw: { register } });
    expect(register).not.toHaveBeenCalled();
  });
  it('swallows registration failure', async () => {
    const register = vi.fn().mockRejectedValue(new Error('x'));
    await expect(registerServiceWorker({ secure: true, prod: true, sw: { register } })).resolves.toBeUndefined();
  });
});
