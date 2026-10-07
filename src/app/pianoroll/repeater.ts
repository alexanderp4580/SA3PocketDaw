export interface RepeaterOptions {
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (h: unknown) => void;
  delay?: number;
  interval?: number;
}

/** Fires once on press, then repeats after `delay` every `interval` until released. */
export function createRepeater(opts: RepeaterOptions) {
  const delay = opts.delay ?? 350;
  const interval = opts.interval ?? 90;
  let handle: unknown = null;
  let active = false;
  function stop() {
    active = false;
    if (handle !== null) opts.clearTimer(handle);
    handle = null;
  }
  return {
    start(fn: () => void) {
      stop();
      active = true;
      fn();
      const loop = () => {
        if (!active) return;
        fn();
        handle = opts.setTimer(loop, interval);
      };
      handle = opts.setTimer(loop, delay);
    },
    stop,
    get active() {
      return active;
    },
  };
}
