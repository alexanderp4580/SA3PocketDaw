const GESTURES = ['gesturestart', 'gesturechange', 'gestureend'] as const;

/** Page pinch zoom stays off app-wide (Safari ignores `user-scalable`). */
export function installNoPageZoom(target: Pick<Document, 'addEventListener' | 'removeEventListener'> = document): () => void {
  const cancel = (e: Event) => e.preventDefault();
  for (const name of GESTURES) target.addEventListener(name, cancel, { passive: false });
  return () => {
    for (const name of GESTURES) target.removeEventListener(name, cancel);
  };
}
