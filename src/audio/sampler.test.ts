import { describe, it, expect } from 'vitest';
import { playbackRate, playNote, audition, ATTACK_SEC, RELEASE_SEC, type AudioContextLike } from './sampler';

type Call = [string, ...unknown[]];
function fakeCtx(currentTime = 0) {
  const sources: Array<{ buffer: unknown; rate: number; calls: Call[]; onended: (() => void) | null; loop?: boolean; loopStart?: number; loopEnd?: number }> = [];
  const gains: Array<{ calls: Call[] }> = [];
  const ctx: AudioContextLike = {
    currentTime,
    destination: 'dest',
    createBufferSource() {
      const rec = { buffer: null as unknown, rate: 1, calls: [] as Call[], onended: null as null | (() => void), loop: undefined as boolean | undefined, loopStart: undefined as number | undefined, loopEnd: undefined as number | undefined };
      sources.push(rec);
      return {
        get buffer() { return rec.buffer as never; },
        set buffer(b) { rec.buffer = b; },
        playbackRate: { get value() { return rec.rate; }, set value(v: number) { rec.rate = v; }, setValueAtTime() {}, linearRampToValueAtTime() {} },
        get onended() { return rec.onended; },
        set onended(f) { rec.onended = f; },
        get loop() { return rec.loop as boolean; }, set loop(v: boolean) { rec.loop = v; },
        get loopStart() { return rec.loopStart as number; }, set loopStart(v: number) { rec.loopStart = v; },
        get loopEnd() { return rec.loopEnd as number; }, set loopEnd(v: number) { rec.loopEnd = v; },
        connect(d: unknown) { rec.calls.push(['connect', d]); },
        start(w?: number) { rec.calls.push(['start', w]); },
        stop(w?: number) { rec.calls.push(['stop', w]); },
      };
    },
    createGain() {
      const rec = { calls: [] as Call[] };
      gains.push(rec);
      return {
        gain: {
          value: 1,
          setValueAtTime(v: number, t: number) { rec.calls.push(['set', v, t]); },
          linearRampToValueAtTime(v: number, t: number) { rec.calls.push(['ramp', v, t]); },
        },
        connect(d: unknown) { rec.calls.push(['connect', d]); },
      };
    },
  };
  return { ctx, sources, gains };
}

describe('playbackRate', () => {
  it('is 2^((note-root)/12)', () => {
    expect(playbackRate(60, 60)).toBe(1);
    expect(playbackRate(72, 60)).toBeCloseTo(2);
    expect(playbackRate(48, 60)).toBeCloseTo(0.5);
    expect(playbackRate(67, 60)).toBeCloseTo(1.4983, 3);
  });
});

describe('playNote', () => {
  it('schedules rate, attack, release and stop', () => {
    const { ctx, sources, gains } = fakeCtx(0);
    playNote(ctx, { buffer: { duration: 2 }, root: 60, note: 72, when: 1, duration: 0.5, velocity: 0.8 });
    expect(sources[0]!.rate).toBeCloseTo(2);
    expect(sources[0]!.calls).toContainEqual(['start', 1]);
    const stop = sources[0]!.calls.find((c) => c[0] === 'stop')!;
    expect(stop[1]).toBeCloseTo(1.5 + RELEASE_SEC);
    expect(gains[0]!.calls).toEqual([
      ['set', 0, 1],
      ['ramp', 0.8, 1 + ATTACK_SEC],
      ['set', 0.8, 1.5],
      ['ramp', 0, 1.5 + RELEASE_SEC],
      ['connect', 'dest'],
    ] as Call[]);
  });

  it('ends at the sample end when the note is longer', () => {
    const { ctx, gains } = fakeCtx(0);
    // 1 s buffer at rate 2 lasts 0.5 s
    const v = playNote(ctx, { buffer: { duration: 1 }, root: 60, note: 72, when: 0, duration: 10 });
    expect(v.endTime).toBeCloseTo(0.5 + RELEASE_SEC);
    expect(gains[0]!.calls.find((c) => c[0] === 'set' && c[2] !== 0)![2]).toBeCloseTo(0.5);
  });

  it('lower notes play longer', () => {
    const { ctx } = fakeCtx(0);
    const v = playNote(ctx, { buffer: { duration: 1 }, root: 60, note: 48, when: 0, duration: 10 });
    expect(v.endTime).toBeCloseTo(2 + RELEASE_SEC);
  });

  it('routes to the given output node', () => {
    const { ctx, gains } = fakeCtx();
    playNote(ctx, { buffer: { duration: 1 }, root: 60, note: 60, when: 0, duration: 1, output: 'master' });
    expect(gains[0]!.calls).toContainEqual(['connect', 'master']);
  });

  it('audition starts now', () => {
    const { ctx, sources } = fakeCtx(3);
    audition(ctx, { buffer: { duration: 5 }, root: 60, note: 60 });
    expect(sources[0]!.calls).toContainEqual(['start', 3]);
  });
});

it('cancels queued sources before their start time',()=>{const {ctx,sources,gains}=fakeCtx(0);const voice=playNote(ctx,{buffer:{duration:1},root:60,note:60,when:.02,duration:1});voice.stop();expect(sources[0]!.calls.at(-1)).toEqual(['stop',0]);expect(gains[0]!.calls.at(-1)).toEqual(['set',0,0]);});

it('uses each sample voice attack and release, including an early stop during attack',()=>{
 const {ctx,gains,sources}=fakeCtx();const voice=playNote(ctx,{buffer:{duration:3},root:60,note:60,when:0,duration:1,velocity:.8,controls:{attack:.2,release:.4}});
 expect(gains[0]!.calls).toContainEqual(['ramp',.8,.2]);expect(voice.endTime).toBeCloseTo(1.4);
 voice.stop(.1);expect(gains[0]!.calls.at(-2)![1]).toBeCloseTo(.4);expect(gains[0]!.calls.at(-2)![2]).toBe(.1);expect(gains[0]!.calls.at(-1)).toEqual(['ramp',0,.5]);expect(sources[0]!.calls.at(-1)).toEqual(['stop',.5]);
});
it('releases a short note at its requested end while a longer attack is still rising',()=>{
 const {ctx,gains}=fakeCtx();const v=playNote(ctx,{buffer:{duration:3},root:60,note:60,when:0,duration:.1,controls:{attack:1,release:.2}});
 expect(gains[0]!.calls).toContainEqual(['ramp',.1,.1]);expect(v.endTime).toBeCloseTo(.3);
});

describe('looped playback', () => {
  const loop = { start: 0.5, end: 1.25 };
  it('loops the region in buffer time whatever the playback rate', () => {
    const { ctx, sources } = fakeCtx(0);
    playNote(ctx, { buffer: { duration: 2 }, root: 60, note: 72, when: 0, duration: 1, loop });
    expect(sources[0]!.rate).toBeCloseTo(2);
    expect(sources[0]!.loop).toBe(true);
    expect(sources[0]!.loopStart).toBe(0.5);
    expect(sources[0]!.loopEnd).toBe(1.25);
  });
  it('sustains past the end of the recording until the note ends, then releases', () => {
    const { ctx, sources, gains } = fakeCtx(0);
    playNote(ctx, { buffer: { duration: 2 }, root: 60, note: 60, when: 1, duration: 6, loop });
    expect(sources[0]!.calls.find((c) => c[0] === 'stop')![1]).toBeCloseTo(7 + RELEASE_SEC);
    expect(gains[0]!.calls).toContainEqual(['set', 1, 7]);
    expect(gains[0]!.calls).toContainEqual(['ramp', 0, 7 + RELEASE_SEC]);
  });
  it('lets a note shorter than the attack part end normally', () => {
    const { ctx, sources } = fakeCtx(0);
    playNote(ctx, { buffer: { duration: 2 }, root: 60, note: 60, when: 0, duration: 0.2, loop });
    expect(sources[0]!.calls.find((c) => c[0] === 'stop')![1]).toBeCloseTo(0.2 + RELEASE_SEC);
  });
  it('keeps one-shot behaviour without a loop', () => {
    const { ctx, sources } = fakeCtx(0);
    playNote(ctx, { buffer: { duration: 2 }, root: 60, note: 60, when: 0, duration: 6 });
    expect(sources[0]!.loop).toBeUndefined();
    expect(sources[0]!.calls.find((c) => c[0] === 'stop')![1]).toBeCloseTo(2 + RELEASE_SEC);
  });
  it('stops a held looped voice with a fade at the requested time', () => {
    const { ctx, sources } = fakeCtx(0);
    const v = playNote(ctx, { buffer: { duration: 2 }, root: 60, note: 60, when: 0, duration: 6, loop });
    v.stop(3, 0.01);
    expect(sources[0]!.calls.filter((c) => c[0] === 'stop').at(-1)![1]).toBeCloseTo(3.01);
  });
});
