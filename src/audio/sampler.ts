import { log } from '../log';

const scope = log.scope('audio.sampler');

export const ATTACK_SEC = 0.004;
export const RELEASE_SEC = 0.05;
export const AUDITION_SEC = 0.6;

export interface AudioParamLike {
  value: number;
  setValueAtTime(v: number, t: number): unknown;
  linearRampToValueAtTime(v: number, t: number): unknown;
  cancelScheduledValues?(t: number): unknown;
}
export interface AudioNodeLike {
  connect(dest: unknown): unknown;
  disconnect?(): unknown;
}
export interface BufferLike {
  duration: number;
}
export interface BufferSourceLike extends AudioNodeLike {
  buffer: BufferLike | null;
  playbackRate: AudioParamLike;
  onended: (() => void) | null;
  start(when?: number): void;
  stop(when?: number): void;
}
export interface GainLike extends AudioNodeLike {
  gain: AudioParamLike;
}
export interface AudioContextLike {
  readonly currentTime: number;
  readonly destination: unknown;
  createBufferSource(): BufferSourceLike;
  createGain(): GainLike;
}

export function playbackRate(note: number, root: number): number {
  return Math.pow(2, (note - root) / 12);
}

export interface PlayNoteArgs {
  buffer: BufferLike;
  root: number;
  note: number;
  /** Context time in seconds. */
  when: number;
  /** Note length in seconds. */
  duration: number;
  /** 0..1 */
  velocity?: number;
  /** Node to connect to; defaults to ctx.destination. */
  output?: unknown;
}

export interface Voice {
  /** Context time at which the note stops sounding (including release). */
  endTime: number;
  stop(at?: number,fade?:number): void;
}

export function playNote(ctx: AudioContextLike, a: PlayNoteArgs): Voice {
  const rate = playbackRate(a.note, a.root);
  const vel = Math.min(1, Math.max(0, a.velocity ?? 1));
  const when = Math.max(a.when, ctx.currentTime);
  const sampleEnd = when + a.buffer.duration / rate;
  const noteEnd = Math.max(when + ATTACK_SEC, Math.min(when + a.duration, sampleEnd));
  const stopAt = noteEnd + RELEASE_SEC;

  const src = ctx.createBufferSource();
  src.buffer = a.buffer;
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(vel, when + ATTACK_SEC);
  g.gain.setValueAtTime(vel, noteEnd);
  g.gain.linearRampToValueAtTime(0, stopAt);
  src.connect(g);
  g.connect(a.output ?? ctx.destination);
  src.onended = () => {
    src.disconnect?.();
    g.disconnect?.();
  };
  src.start(when);
  src.stop(stopAt);
  scope.debug('note', { note: a.note, root: a.root, rate, when, noteEnd });
  return {
    endTime: stopAt,
    stop(at = ctx.currentTime,fade=RELEASE_SEC) {
      g.gain.cancelScheduledValues?.(at);
      if(at<when){g.gain.setValueAtTime(0,at);src.stop(at);return;}
      g.gain.setValueAtTime(vel, at);
      g.gain.linearRampToValueAtTime(0, at + fade);
      src.stop(at + fade);
    },
  };
}

/** One-shot preview of a note, used by the piano keys. */
export function audition(ctx: AudioContextLike, a: Omit<PlayNoteArgs, 'when' | 'duration'> & { duration?: number }): Voice {
  return playNote(ctx, { ...a, when: ctx.currentTime, duration: a.duration ?? AUDITION_SEC });
}
