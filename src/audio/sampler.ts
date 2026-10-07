import {resolveSampleControls,SAMPLE_ATTACK_SEC,SAMPLE_RELEASE_SEC,type SampleControls} from './sampleControls';
import {brightnessHz} from './instrument/controls';
import { log } from '../log';

const scope = log.scope('audio.sampler');

export const ATTACK_SEC = SAMPLE_ATTACK_SEC;
export const RELEASE_SEC = SAMPLE_RELEASE_SEC;
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
  readonly sampleRate?:number;
  createBiquadFilter?():AudioNodeLike&{type:BiquadFilterType;frequency:AudioParamLike;Q:AudioParamLike};
}

export function playbackRate(note: number, root: number): number {
  return Math.pow(2, (note - root) / 12);
}

export interface PlayNoteArgs {
  controls?:Partial<SampleControls>;
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
  const controls=resolveSampleControls(a.controls);
  const rate = playbackRate(a.note, a.root);
  const vel = Math.min(1, Math.max(0, a.velocity ?? 1));
  const when = Math.max(a.when, ctx.currentTime);
  const sampleEnd = when + a.buffer.duration / rate;
  const noteEnd = Math.max(when + Math.min(ATTACK_SEC,sampleEnd-when), Math.min(when + a.duration, sampleEnd));
  const attackEnd=Math.min(when+controls.attack,noteEnd);
  const peak=vel*Math.min(1,(attackEnd-when)/controls.attack);
  const stopAt = noteEnd + controls.release;

  const src = ctx.createBufferSource();
  src.buffer = a.buffer;
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(peak, attackEnd);
  g.gain.setValueAtTime(peak, noteEnd);
  g.gain.linearRampToValueAtTime(0, stopAt);
  let filter:ReturnType<NonNullable<AudioContextLike['createBiquadFilter']>>|undefined;
  if(controls.brightness<1){
    if(!ctx.createBiquadFilter)throw Error('Sample brightness requires a BiquadFilter');
    filter=ctx.createBiquadFilter();filter.type='lowpass';filter.Q.value=0;filter.frequency.value=brightnessHz(controls.brightness,ctx.sampleRate??44100);
    src.connect(filter);filter.connect(g);
  }else src.connect(g);
  g.connect(a.output ?? ctx.destination);
  src.onended = () => {
    src.disconnect?.();
    g.disconnect?.();
    filter?.disconnect?.();
  };
  src.start(when);
  src.stop(stopAt);
  scope.debug('note', { note: a.note, root: a.root, rate, when, noteEnd });
  return {
    endTime: stopAt,
    stop(at = ctx.currentTime,fade=controls.release) {
      g.gain.cancelScheduledValues?.(at);
      if(at<when){g.gain.setValueAtTime(0,at);src.stop(at);return;}
      const level=at<attackEnd?vel*Math.max(0,at-when)/controls.attack:at<noteEnd?peak:peak*Math.max(0,stopAt-at)/controls.release;
      if(at<attackEnd||at>=noteEnd)g.gain.linearRampToValueAtTime(level,at);
      else g.gain.setValueAtTime(level, at);
      g.gain.linearRampToValueAtTime(0, at + fade);
      src.stop(at + fade);
    },
  };
}

/** One-shot preview of a note, used by the piano keys. */
export function audition(ctx: AudioContextLike, a: Omit<PlayNoteArgs, 'when' | 'duration'> & { duration?: number }): Voice {
  return playNote(ctx, { ...a, when: ctx.currentTime, duration: a.duration ?? AUDITION_SEC });
}
