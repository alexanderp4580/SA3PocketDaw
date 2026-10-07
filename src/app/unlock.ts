/** Runs `unlock` on the first user gesture (browsers keep audio suspended until then). */
export function audioUnlockOnce(unlock: () => Promise<void>, target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window): void {
  const handler = () => {
    target.removeEventListener('pointerdown', handler, true);
    target.removeEventListener('keydown', handler, true);
    void unlock().catch(() => {});
  };
  target.addEventListener('pointerdown', handler, true);
  target.addEventListener('keydown', handler, true);
}
