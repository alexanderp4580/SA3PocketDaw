import { midiToHz } from '../audio/pitch';
import type { TranscribedNote } from './notes';

export const MAX_PREVIEW_NOTES = 400;
const MIN_DURATION = 0.08;
const LEAD = 0.1;
const RELEASE = 0.1;

export interface PreviewEvent {
  when: number;
  midi: number;
  duration: number;
  gain: number;
}

export function previewEvents(notes: TranscribedNote[]): PreviewEvent[] {
  return notes.slice(0, MAX_PREVIEW_NOTES).map((n) => ({
    when: n.onset,
    midi: n.pitch,
    duration: Math.max(MIN_DURATION, n.offset - n.onset),
    gain: 0.02 + (Math.max(0, Math.min(127, n.velocity)) / 127) * 0.18,
  }));
}

interface ParamLike {
  value: number;
  setValueAtTime(v: number, t: number): unknown;
  linearRampToValueAtTime(v: number, t: number): unknown;
  exponentialRampToValueAtTime(v: number, t: number): unknown;
}
interface OscLike {
  type: string;
  frequency: { value: number };
  connect(node: unknown): unknown;
  start(t: number): void;
  stop(t: number): void;
}
export interface PreviewContext {
  currentTime: number;
  destination: unknown;
  createOscillator(): OscLike;
  createGain(): { gain: ParamLike; connect(node: unknown): unknown };
}

/** Plays notes as short triangle-wave tones. Returns the length in seconds and a stop function. */
export function playPreview(ctx: PreviewContext, notes: TranscribedNote[]): { seconds: number; stop(): void } {
  const t0 = ctx.currentTime + LEAD;
  const oscs: OscLike[] = [];
  let seconds = 0;
  for (const e of previewEvents(notes)) {
    const start = t0 + e.when;
    const end = start + e.duration;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = midiToHz(e.midi);
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.linearRampToValueAtTime(e.gain, start + 0.01);
    amp.gain.setValueAtTime(e.gain, end);
    amp.gain.exponentialRampToValueAtTime(0.0001, end + RELEASE);
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(start);
    osc.stop(end + RELEASE + 0.02);
    oscs.push(osc);
    seconds = Math.max(seconds, e.when + e.duration + RELEASE);
  }
  return {
    seconds,
    stop() {
      for (const o of oscs) {
        try {
          o.stop(ctx.currentTime);
        } catch {
          // already stopped
        }
      }
    },
  };
}
