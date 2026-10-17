import { MIDI_MAX, MIDI_MIN, type Track } from '../../store/projectModel';
import { SCALES, findTarget, type Scale } from './cursor';
import { place, type EditContext } from './edit';

export type ChordQuality = 'major' | 'minor' | 'diminished';

export interface Chord {
  /** 1..7 */
  degree: number;
  /** Roman numeral: upper case major, lower case minor, lower case with ° diminished. */
  roman: string;
  /** Chord name, e.g. "Dm", "B°". */
  name: string;
  /** Root pitch class 0..11. */
  rootPc: number;
  /** Semitones above the root: root, third, fifth. */
  offsets: [number, number, number];
  quality: ChordQuality;
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const PC_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const mod12 = (n: number) => ((n % 12) + 12) % 12;

/** Diatonic triads of the key, from the same scale tables the In-key filter uses. */
export function chordStrip(keyRoot: number, scale: Scale): Chord[] {
  const steps = SCALES[scale === 'minor' ? 'minor' : 'major'];
  return steps.map((s, i) => {
    const third = mod12(steps[(i + 2) % 7]! - s);
    const fifth = mod12(steps[(i + 4) % 7]! - s);
    const quality: ChordQuality = fifth === 6 ? 'diminished' : third === 3 ? 'minor' : 'major';
    const rootPc = mod12(keyRoot + s);
    const base = PC_NAMES[rootPc]!;
    const suffix = quality === 'minor' ? 'm' : quality === 'diminished' ? '°' : '';
    const numeral = quality === 'major' ? ROMAN[i]! : ROMAN[i]!.toLowerCase() + (quality === 'diminished' ? '°' : '');
    return { degree: i + 1, roman: numeral, name: base + suffix, rootPc, offsets: [0, third, fifth], quality };
  });
}

/** Close-position triad with the root nearest `near` (the lower one on a tie), moved by octaves into the roll range. */
export function voiceChord(chord: Chord, near: number): number[] {
  let root = near - mod12(near - chord.rootPc);
  if (near - root > 6) root += 12;
  let notes = chord.offsets.map((o) => root + o);
  while (Math.max(...notes) > MIDI_MAX) notes = notes.map((n) => n - 12);
  while (Math.min(...notes) < MIDI_MIN) notes = notes.map((n) => n + 12);
  return notes;
}

export function chordPlacedLabel(chord: Chord, placed: number): string {
  return `${placed === 0 ? 'Already there' : 'Placed'} ${chord.name} · ${placed} ${placed === 1 ? 'note' : 'notes'}`;
}

export function chordAriaLabel(chord: Chord): string {
  const word = chord.quality === 'diminished' ? 'diminished' : chord.quality;
  const base = chord.name.replace(/[m°]$/, '');
  return `Place ${base} ${word} chord, ${chord.roman}`;
}

/**
 * Places the chord at the cursor start. Pitches that already have a note under the cursor are left alone,
 * as a single note is. Returns the voiced pitches (for audition) and how many notes were added.
 */
export function placeChord(
  c: EditContext,
  chord: Chord,
  length: number,
  velocity: number,
  nextId?: () => string,
): { track: Track; midis: number[]; placed: number } {
  const midis = voiceChord(chord, c.cell.midi);
  let track = c.track;
  let placed = 0;
  for (const midi of midis) {
    const cell = { step: c.cell.step, midi };
    if (findTarget(track.notes, cell, c.grid)) continue;
    const next = place({ ...c, track, cell }, length, velocity, nextId?.()).track;
    if (next !== track) placed++;
    track = next;
  }
  return { track, midis, placed };
}
