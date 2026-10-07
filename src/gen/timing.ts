import type { StageTiming } from './protocol';

export interface TimingRecorder {
  begin(name: string): void;
  end(name: string): void;
  run<T>(name: string, fn: () => Promise<T> | T): Promise<T>;
  stages(): StageTiming[];
}

/** Records stage start/end in ms relative to the recorder's creation. */
export function createTimingRecorder(now: () => number = () => performance.now()): TimingRecorder {
  const t0 = now();
  const open = new Map<string, number>();
  const done: StageTiming[] = [];
  const rel = () => now() - t0;
  const rec: TimingRecorder = {
    begin(name) {
      open.set(name, rel());
    },
    end(name) {
      const start = open.get(name);
      if (start === undefined) return;
      open.delete(name);
      done.push({ name, startMs: start, endMs: rel() });
    },
    async run(name, fn) {
      rec.begin(name);
      try {
        return await fn();
      } finally {
        rec.end(name);
      }
    },
    stages() {
      return done.slice();
    },
  };
  return rec;
}
