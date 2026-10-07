import type { TrackMix } from '../audio/mixer/model';
import type { InstrumentControls } from '../audio/instrument/controls';
export const MIDI_MIN = 24;
export const MIDI_MAX = 96;
export const BPM_MIN = 40;
export const BPM_MAX = 240;
export const STEPS_PER_BAR = 16;

export const VELOCITY_MIN = 1;
export const VELOCITY_MAX = 127;
export const DEFAULT_VELOCITY = 96;

export type Bars = 1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16;
export interface LoopRange {startBar:number;endBar:number;}

export interface Note {
  id: string;
  midi: number;
  /** Start in 16th steps. */
  start: number;
  /** Length in 16th steps. */
  length: number;
  /** 1..127; missing means DEFAULT_VELOCITY. */
  velocity?: number;
}

export function clampVelocity(v: number): number {
  if (!Number.isFinite(v)) return DEFAULT_VELOCITY;
  return Math.min(VELOCITY_MAX, Math.max(VELOCITY_MIN, Math.round(v)));
}

export function noteVelocity(n: { velocity?: number }): number {
  return n.velocity === undefined ? DEFAULT_VELOCITY : clampVelocity(n.velocity);
}

/** Linear gain 0..1 for a velocity. */
export function velocityGain(velocity: number | undefined): number {
  return noteVelocity({ velocity }) / VELOCITY_MAX;
}

export interface Track {
  mix?:TrackMix;
  bars?:Bars;
  solo?:boolean;
  instrumentControls?:Partial<InstrumentControls>;
  soundType?:'sample'|'instrument';
  id: string;
  name: string;
  muted: boolean;
  sampleId: string | null;
  rootMidi: number;
  notes: Note[];
}

export interface Project {
  masterDb?:number;
  loop?:LoopRange;
  id: string;
  name: string;
  bpm: number;
  key: string;
  scale?: string;
  bars: Bars;
  tracks: Track[];
}

export function newId(prefix: string): string {
  const c = globalThis.crypto as Crypto | undefined;
  const rand = c?.randomUUID ? c.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rand}`;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function createProject(opts: Partial<Omit<Project, 'tracks'>> = {}): Project {
  return {
    id: opts.id ?? newId('p'),
    name: opts.name ?? 'Untitled',
    bpm: clamp(Math.round(opts.bpm ?? 120), BPM_MIN, BPM_MAX),
    key: opts.key ?? 'C',
    ...(opts.scale !== undefined ? { scale: opts.scale } : {}),
    bars: opts.bars ?? 2,
    tracks: [],
  };
}

export function totalSteps(p: Pick<Project, 'bars'>): number {
  return p.bars * STEPS_PER_BAR;
}

function mapTrack(p: Project, trackId: string, fn: (t: Track) => Track): Project {
  let found = false;
  const tracks = p.tracks.map((t) => {
    if (t.id !== trackId) return t;
    found = true;
    return fn(t);
  });
  return found ? { ...p, tracks } : p;
}

export function setBpm(p: Project, bpm: number): Project {
  return { ...p, bpm: clamp(Math.round(bpm), BPM_MIN, BPM_MAX) };
}
export function setKey(p: Project, key: string, scale?: string): Project {
  const next: Project = { ...p, key };
  if (scale !== undefined) next.scale = scale;
  return next;
}
export function renameProject(p: Project, name: string): Project {
  return { ...p, name };
}

export function setBars(p: Project, bars: Bars): Project {
  const max = bars * STEPS_PER_BAR;
  return {
    ...p,
    bars,
    tracks: p.tracks.map((t) => ({
      ...t,
      bars,
      notes: t.notes
        .filter((n) => n.start < max)
        .map((n) => (n.start + n.length > max ? { ...n, length: max - n.start } : n)),
    })),
  };
}

export function addTrack(p: Project, name?: string, id?: string): Project {
  const track: Track = {
    id: id ?? newId('t'),
    name: name ?? `Track ${p.tracks.length + 1}`,
    muted: false,
    bars:p.bars,
    sampleId: null,
    rootMidi: 60,
    notes: [],
  };
  return { ...p, tracks: [...p.tracks, track] };
}
export function removeTrack(p: Project, trackId: string): Project {
  return { ...p, tracks: p.tracks.filter((t) => t.id !== trackId) };
}
export function renameTrack(p: Project, trackId: string, name: string): Project {
  return mapTrack(p, trackId, (t) => ({ ...t, name }));
}
export function toggleMute(p: Project, trackId: string): Project {
  return mapTrack(p, trackId, (t) => ({ ...t, muted: !t.muted }));
}
export function setRoot(p: Project, trackId: string, rootMidi: number): Project {
  return mapTrack(p, trackId, (t) => ({ ...t, rootMidi: clamp(Math.round(rootMidi), MIDI_MIN, MIDI_MAX) }));
}
export function setTrackSample(p: Project, trackId: string, sampleId: string | null, rootMidi?: number,soundType?:'sample'|'instrument'): Project {
  return mapTrack(p, trackId, (t) => ({
    ...t,
    sampleId,
    ...(soundType?{soundType,instrumentControls:undefined}:{}),
    ...(rootMidi !== undefined ? { rootMidi: clamp(Math.round(rootMidi), MIDI_MIN, MIDI_MAX) } : {}),
  }));
}
export function clearNotes(p: Project, trackId: string): Project {
  return mapTrack(p, trackId, (t) => ({ ...t, notes: [] }));
}

/** Snap and bounds-check a note; returns null when it cannot fit. */
function normalize(p: Project, midi: number, start: number, length: number,trackId:string): { midi: number; start: number; length: number } | null {
  const m = Math.round(midi);
  const s = Math.round(start);
  const max = trackBars(p.tracks.find(t=>t.id===trackId)??{id:trackId},p.bars)*STEPS_PER_BAR;
  if (!Number.isFinite(m) || !Number.isFinite(s) || !Number.isFinite(length)) return null;
  if (m < MIDI_MIN || m > MIDI_MAX || s < 0 || s >= max) return null;
  const l = clamp(Math.round(length), 1, max - s);
  return { midi: m, start: s, length: l };
}

const hasDup = (t: Track, midi: number, start: number, exceptId?: string) =>
  t.notes.some((n) => n.id !== exceptId && n.midi === midi && n.start === start);

export function addNote(p: Project, trackId: string, note: { midi: number; start: number; length: number; id?: string; velocity?: number }): Project {
  const norm = normalize(p, note.midi, note.start, note.length,trackId);
  const track = p.tracks.find((t) => t.id === trackId);
  if (!norm || !track || hasDup(track, norm.midi, norm.start)) return p;
  const n: Note = { id: note.id ?? newId('n'), ...norm, velocity: noteVelocity(note) };
  return mapTrack(p, trackId, (t) => ({ ...t, notes: [...t.notes, n] }));
}

export function removeNote(p: Project, trackId: string, noteId: string): Project {
  return mapTrack(p, trackId, (t) => ({ ...t, notes: t.notes.filter((n) => n.id !== noteId) }));
}

export function moveNote(p: Project, trackId: string, noteId: string, to: { midi: number; start: number }): Project {
  const track = p.tracks.find((t) => t.id === trackId);
  const note = track?.notes.find((n) => n.id === noteId);
  if (!track || !note) return p;
  const norm = normalize(p, to.midi, to.start, note.length,trackId);
  if (!norm || norm.length !== note.length || hasDup(track, norm.midi, norm.start, noteId)) return p;
  return mapTrack(p, trackId, (t) => ({ ...t, notes: t.notes.map((n) => (n.id === noteId ? { ...n, ...norm } : n)) }));
}

export function resizeNote(p: Project, trackId: string, noteId: string, length: number): Project {
  const note = p.tracks.find((t) => t.id === trackId)?.notes.find((n) => n.id === noteId);
  if (!note) return p;
  const norm = normalize(p, note.midi, note.start, length,trackId);
  if (!norm) return p;
  return mapTrack(p, trackId, (t) => ({ ...t, notes: t.notes.map((n) => (n.id === noteId ? { ...n, length: norm.length } : n)) }));
}

export function transposeNote(p: Project, trackId: string, noteId: string, semitones: number): Project {
  const note = p.tracks.find((t) => t.id === trackId)?.notes.find((n) => n.id === noteId);
  if (!note) return p;
  return moveNote(p, trackId, noteId, { midi: note.midi + semitones, start: note.start });
}

export function setNoteVelocity(p: Project, trackId: string, noteId: string, velocity: number): Project {
  const v = clampVelocity(velocity);
  return mapTrack(p, trackId, (t) => ({ ...t, notes: t.notes.map((n) => (n.id === noteId ? { ...n, velocity: v } : n)) }));
}

export function trackBars(t:{id:string;bars?:number},legacy=2):Bars {return clamp(Math.round(Number.isFinite(t.bars)?t.bars!:legacy),1,16) as Bars;}
export function timelineBars(p:{bars:number;tracks:Array<{id:string;bars?:number}>}):Bars {return Math.max(1,...p.tracks.map(t=>trackBars(t,p.bars)),p.tracks.length?1:p.bars) as Bars;}
export function loopRange(p:{bars:number;tracks:Array<{id:string;bars?:number}>;loop?:LoopRange}):LoopRange {const max=timelineBars(p),startBar=clamp(Math.round(p.loop?.startBar??1),1,max),endBar=clamp(Math.round(p.loop?.endBar??max),startBar,max);return {startBar,endBar};}
export function setLoopRange(p:Project,startBar:number,endBar:number):Project {const next={...p,loop:{startBar:Number.isFinite(startBar)?startBar:1,endBar:Number.isFinite(endBar)?endBar:timelineBars(p)}};return {...next,loop:loopRange(next)};}
export function setTrackBars(p:Project,id:string,bars:number):Project {const next=mapTrack(p,id,t=>({...t,bars:trackBars({id,bars},p.bars)}));return next.loop?{...next,loop:loopRange(next)}:next;}
export function toggleSolo(p:Project,id:string):Project {return mapTrack(p,id,t=>({...t,solo:!t.solo}));}
