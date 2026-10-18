import { describe, expect, it } from 'vitest';
import { CancelledError, transcribe, type HeadsSession } from './pipeline';
import { FRAMES_PER_SEGMENT, PITCHES, SAMPLE_RATE, SEGMENT_SAMPLES } from './segments';

const size = FRAMES_PER_SEGMENT * PITCHES;
const zeroHeads = () => ({ onset: new Float32Array(size), offset: new Float32Array(size), frame: new Float32Array(size), velocity: new Float32Array(size) });

function fakeSession(calls: Float32Array[] = []): HeadsSession {
  return {
    async run(audio) {
      calls.push(audio);
      return zeroHeads();
    },
  };
}
function clock() {
  let t = 0;
  return () => (t += 10);
}

describe('transcribe', () => {
  it('runs one window per hop, reports progress and timings', async () => {
    const calls: Float32Array[] = [];
    const progress: Array<[number, number]> = [];
    const audio = new Float32Array(12 * SAMPLE_RATE).fill(0.1);
    const r = await transcribe(audio, fakeSession(calls), { now: clock(), onProgress: (done, total) => progress.push([done, total]) });
    expect(calls).toHaveLength(3);
    expect(calls.every((c) => c.length === SEGMENT_SAMPLES)).toBe(true);
    expect(calls[0]![0]).toBe(0); // 1 s of silence in front
    expect(calls[0]![SAMPLE_RATE]).toBeCloseTo(0.1);
    expect(progress).toEqual([[0, 3], [1, 3], [2, 3], [3, 3]]);
    expect(r.frames).toBe(2000);
    expect(r.notes).toEqual([]);
    expect(r.windowMs).toHaveLength(3);
    expect(r.windowMs.every((m) => m > 0)).toBe(true);
    expect(r.audioSeconds).toBe(12);
    expect(r.totalMs).toBeGreaterThanOrEqual(r.inferMs + r.postMs);
  });

  it('turns a head peak into a note', async () => {
    const session: HeadsSession = {
      async run() {
        const h = zeroHeads();
        const key = 39;
        [[0.1, 198], [0.4, 199], [0.8, 200], [0.4, 201], [0.1, 202]].forEach(([v, f]) => (h.onset[f! * PITCHES + key] = v!));
        for (let f = 200; f < 240; f++) h.frame[f * PITCHES + key] = 0.9;
        h.velocity[200 * PITCHES + key] = 0.5;
        return h;
      },
    };
    const r = await transcribe(new Float32Array(2 * SAMPLE_RATE), session, { now: clock() });
    expect(r.notes).toHaveLength(1);
    expect(r.notes[0]!.pitch).toBe(60);
  });

  it('stops between windows when cancelled', async () => {
    let n = 0;
    await expect(
      transcribe(new Float32Array(12 * SAMPLE_RATE), fakeSession(), { now: clock(), isCancelled: () => n++ >= 1 }),
    ).rejects.toBeInstanceOf(CancelledError);
  });

  it('yields to the event loop between windows', async () => {
    let yields = 0;
    await transcribe(new Float32Array(12 * SAMPLE_RATE), fakeSession(), { now: clock(), yieldToEvents: async () => void yields++ });
    expect(yields).toBe(3);
  });

  it('rejects empty audio', async () => {
    await expect(transcribe(new Float32Array(0), fakeSession(), { now: clock() })).rejects.toThrow(/no audio/i);
  });
});
