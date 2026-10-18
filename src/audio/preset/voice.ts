import type { AudioContextLike, AudioNodeLike, AudioParamLike, BufferLike } from '../sampler';
import { heldLevel, MIN_ATTACK_SEC, MIN_RELEASE_SEC, type Envelope, type RegionPlay } from '../sfz/select';

export interface PresetContext extends AudioContextLike {
  createStereoPanner?(): AudioNodeLike & { pan: AudioParamLike };
}

export interface RegionVoice {
  startTime: number;
  /** Context time at which the voice is silent. */
  endTime: number;
  /** Fades the voice out from `at` over `fade` seconds. */
  stop(at?: number, fade?: number): void;
}

export interface RegionVoiceArgs {
  play: RegionPlay;
  buffer: BufferLike;
  /** Context time of the note start. */
  when: number;
  /** Seconds the key is held. */
  duration: number;
  output: unknown;
}

/** Writes the attack/hold/decay/sustain/release gain automation of a held note onto `param`. */
export function scheduleEnvelope(param: AudioParamLike, env: Envelope, peak: number, when: number, duration: number) {
  const attack = Math.max(env.attack, MIN_ATTACK_SEC);
  const release = Math.max(env.release, MIN_RELEASE_SEC);
  const noteEnd = when + duration;
  const releaseFrom = peak * heldLevel(env, duration);
  param.setValueAtTime(0, when);
  const stages = [attack, attack + env.hold, attack + env.hold + env.decay];
  let done = 0;
  for (const t of stages) {
    if (t <= done) continue;
    if (t >= duration) { param.linearRampToValueAtTime(releaseFrom, noteEnd); done = duration; break; }
    param.linearRampToValueAtTime(peak * heldLevel(env, t), when + t);
    done = t;
  }
  if (env.decay <= 0 && env.sustain < 1 && attack + env.hold < duration) param.setValueAtTime(peak * env.sustain, when + attack + env.hold);
  param.setValueAtTime(releaseFrom, noteEnd);
  param.linearRampToValueAtTime(0, noteEnd + release);
  const levelAt = (t: number): number => {
    if (t >= noteEnd + release) return 0;
    if (t >= noteEnd) return releaseFrom * (1 - (t - noteEnd) / release);
    return peak * heldLevel(env, Math.max(0, t - when));
  };
  return { noteEnd, stopAt: noteEnd + release, levelAt };
}

/** Starts one region of a note: file at its rate (looped when the region has a loop), envelope, optional filter and pan. */
export function startRegionVoice(ctx: PresetContext, a: RegionVoiceArgs): RegionVoice {
  const { play, buffer } = a;
  const r = play.region;
  const when = Math.max(a.when, ctx.currentTime);
  const releaseTrigger = r.trigger === 'release';
  const naturalEnd = when + buffer.duration / play.rate;

  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = play.rate;
  if (r.loopStart !== undefined && r.loopEnd !== undefined) {
    src.loop = true;
    src.loopStart = r.loopStart;
    src.loopEnd = r.loopEnd;
  }
  const g = ctx.createGain();
  let head: AudioNodeLike = src;
  if (r.cutoff !== undefined && ctx.createBiquadFilter) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 0.707;
    f.frequency.value = Math.min(r.cutoff, (ctx.sampleRate ?? 44100) * 0.45);
    head.connect(f);
    head = f;
  }
  head.connect(g);
  let tail: AudioNodeLike = g;
  if (r.pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = r.pan;
    g.connect(p);
    tail = p;
  }
  tail.connect(a.output);

  let levelAt: (t: number) => number;
  let endTime: number;
  if (releaseTrigger) {
    g.gain.setValueAtTime(play.gain, when);
    levelAt = (t) => (t < naturalEnd ? play.gain : 0);
    endTime = naturalEnd;
  } else {
    const duration = r.oneShot ? buffer.duration / play.rate : a.duration;
    const env = scheduleEnvelope(g.gain, play.envelope, play.gain, when, duration);
    levelAt = env.levelAt;
    endTime = env.stopAt;
  }
  src.onended = () => {
    src.disconnect?.();
    g.disconnect?.();
  };
  src.start(when);
  src.stop(endTime);

  const voice: RegionVoice = {
    startTime: when,
    endTime,
    stop(at = ctx.currentTime, fade = 0.02) {
      if (at >= endTime) return;
      g.gain.cancelScheduledValues?.(at);
      if (at <= when) {
        g.gain.setValueAtTime(0, at);
        src.stop(at);
      } else {
        g.gain.setValueAtTime(levelAt(at), at);
        g.gain.linearRampToValueAtTime(0, at + fade);
        src.stop(at + fade);
      }
      voice.endTime = Math.min(endTime, at + fade);
    },
  };
  return voice;
}
