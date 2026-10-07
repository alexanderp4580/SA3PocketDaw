import type { ModelId } from './protocol';
import type { GenerationMode } from './mode';

export const MODEL_LABELS: Record<ModelId, string> = {
  'small-music': 'Small Music',
  'small-sfx': 'Small SFX',
  medium: 'Medium',
};

export interface ModelDefaults {
  steps: number;
  seconds: number;
}

export const MODEL_DEFAULTS: Record<ModelId, ModelDefaults> = {
  'small-music': { steps: 8, seconds: 2 },
  'small-sfx': { steps: 8, seconds: 2 },
  medium: { steps: 8, seconds: 2 },
};

export const PROMPT_SUFFIX: Record<ModelId, string> = {
  'small-music': 'single sustained note, dry, no reverb, no drums',
  medium: 'single sustained note, dry, no reverb, no drums',
  'small-sfx': 'single isolated sound, dry',
};

export function buildPrompt(userPrompt: string, model: ModelId, mode?: GenerationMode): string {
  const text = userPrompt.trim().replace(/[,\s]+$/, '');
  if (!text) throw new Error('Prompt is empty');
  // Missing mode retains the established API for old callers and records.
  if (!mode) return `${text}, ${PROMPT_SUFFIX[model]}`;
  if (mode === 'sample') {
    const tag=model==='small-music'?'TrackType: Instrument':'TrackType: SFX';
    return `${tag}, ${text}, single isolated sound, dry recording, no accompaniment, no repeating sequence`;
  }
  const tag=model==='small-sfx'?'': 'TrackType: Instrument, ';
  return `${tag}${text}, one isolated single note, steady pitch, dry recording, no chords, no melody, no accompaniment, no drums, no reverb`;
}

/** Random unsigned 32-bit seed. */
export function randomSeed(random: () => number = Math.random): number {
  return Math.floor(random() * 0x100000000) >>> 0;
}
