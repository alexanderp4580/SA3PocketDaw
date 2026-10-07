import { describe, expect, it } from 'vitest';
import { createRepeater } from './repeater';

function setup() {
  let t = 0;
  let id = 0;
  const timers: Array<{ id: number; at: number; fn: () => void }> = [];
  const r = createRepeater({
    setTimer: (fn, ms) => { timers.push({ id: ++id, at: t + ms, fn }); return id; },
    clearTimer: (h) => { const i = timers.findIndex((x) => x.id === h); if (i >= 0) timers.splice(i, 1); },
    delay: 300,
    interval: 100,
  });
  const advance = (ms: number) => {
    const end = t + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const next = timers[0];
      if (!next || next.at > end) break;
      timers.shift();
      t = next.at;
      next.fn();
    }
    t = end;
  };
  return { r, advance };
}

describe('repeater', () => {
  it('fires once on press and repeats only after the delay', () => {
    const { r, advance } = setup();
    let n = 0;
    r.start(() => n++);
    expect(n).toBe(1);
    advance(299);
    expect(n).toBe(1);
    advance(1);
    expect(n).toBe(2);
    advance(200);
    expect(n).toBe(4);
  });
  it('stops on release', () => {
    const { r, advance } = setup();
    let n = 0;
    r.start(() => n++);
    advance(450);
    r.stop();
    const at = n;
    advance(1000);
    expect(n).toBe(at);
    expect(r.active).toBe(false);
  });
});
