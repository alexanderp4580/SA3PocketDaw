import { describe, it, expect } from 'vitest';
import {
  createProject, addTrack, removeTrack, renameTrack, toggleMute, setRoot, setTrackSample, setTrackTrim,
  addNote, removeNote, moveNote, resizeNote, transposeNote, setBars, setBpm, MIDI_MIN, MIDI_MAX,
  setNoteVelocity, noteVelocity, velocityGain, DEFAULT_VELOCITY,
} from './projectModel';

function withTrack(bars: 1 | 2 | 3 | 4 = 1) {
  let p = createProject({ bars });
  p = addTrack(p, 'Lead');
  return { p, tid: p.tracks[0]!.id };
}

describe('projectModel', () => {
  it('creates a project with defaults', () => {
    const p = createProject();
    expect(p.bpm).toBe(120);
    expect(p.bars).toBe(2);
    expect(p.tracks).toEqual([]);
    expect(p.id).toBeTruthy();
  });

  it('adds, renames, mutes, re-roots and removes tracks immutably', () => {
    const { p, tid } = withTrack();
    expect(p.tracks[0]).toMatchObject({ name: 'Lead', muted: false, sampleId: null, rootMidi: 60, notes: [] });
    const p2 = renameTrack(p, tid, 'Bass');
    expect(p2.tracks[0]!.name).toBe('Bass');
    expect(p.tracks[0]!.name).toBe('Lead');
    expect(toggleMute(p2, tid).tracks[0]!.muted).toBe(true);
    expect(setRoot(p2, tid, 48).tracks[0]!.rootMidi).toBe(48);
    expect(setRoot(p2, tid, 500).tracks[0]!.rootMidi).toBe(MIDI_MAX);
    expect(setTrackSample(p2, tid, 's1').tracks[0]!.sampleId).toBe('s1');
    expect(removeTrack(p2, tid).tracks).toEqual([]);
  });

  it('adds notes snapped to 16ths', () => {
    const { p, tid } = withTrack();
    const p2 = addNote(p, tid, { midi: 60, start: 3.4, length: 1.6 });
    expect(p2.tracks[0]!.notes[0]).toMatchObject({ midi: 60, start: 3, length: 2 });
    expect(p2.tracks[0]!.notes[0]!.id).toBeTruthy();
  });

  it('rejects notes out of range, and duplicates at the same midi+start', () => {
    const { p, tid } = withTrack();
    expect(addNote(p, tid, { midi: MIDI_MIN - 1, start: 0, length: 1 })).toBe(p);
    expect(addNote(p, tid, { midi: MIDI_MAX + 1, start: 0, length: 1 })).toBe(p);
    expect(addNote(p, tid, { midi: 60, start: 16, length: 1 })).toBe(p);
    expect(addNote(p, tid, { midi: 60, start: -1, length: 1 })).toBe(p);
    const p2 = addNote(p, tid, { midi: 60, start: 0, length: 4 });
    expect(addNote(p2, tid, { midi: 60, start: 0, length: 2 })).toBe(p2);
    expect(addNote(p2, tid, { midi: 62, start: 0, length: 2 }).tracks[0]!.notes).toHaveLength(2);
  });

  it('clamps length to the loop end', () => {
    const { p, tid } = withTrack();
    const p2 = addNote(p, tid, { midi: 60, start: 14, length: 8 });
    expect(p2.tracks[0]!.notes[0]!.length).toBe(2);
  });

  it('moves, resizes, transposes and removes notes within bounds', () => {
    const { p, tid } = withTrack();
    const p1 = addNote(p, tid, { midi: 60, start: 0, length: 2 });
    const nid = p1.tracks[0]!.notes[0]!.id;
    expect(moveNote(p1, tid, nid, { midi: 64, start: 5 }).tracks[0]!.notes[0]).toMatchObject({ midi: 64, start: 5, length: 2 });
    expect(moveNote(p1, tid, nid, { midi: 64, start: 15 }).tracks[0]!.notes[0]!.start).toBe(p1.tracks[0]!.notes[0]!.start);
    expect(resizeNote(p1, tid, nid, 20).tracks[0]!.notes[0]!.length).toBe(16);
    expect(resizeNote(p1, tid, nid, 0).tracks[0]!.notes[0]!.length).toBe(1);
    expect(transposeNote(p1, tid, nid, 12).tracks[0]!.notes[0]!.midi).toBe(72);
    expect(transposeNote(p1, tid, nid, 100)).toBe(p1);
    expect(removeNote(p1, tid, nid).tracks[0]!.notes).toEqual([]);
  });

  it('move onto an existing same midi+start note is rejected', () => {
    const { p, tid } = withTrack();
    let q = addNote(p, tid, { midi: 60, start: 0, length: 1 });
    q = addNote(q, tid, { midi: 62, start: 0, length: 1 });
    const id = q.tracks[0]!.notes[1]!.id;
    expect(transposeNote(q, tid, id, -2)).toBe(q);
  });

  it('shrinking bars drops notes past the end and clamps lengths', () => {
    let { p, tid } = withTrack(2);
    p = addNote(p, tid, { midi: 60, start: 20, length: 2 });
    p = addNote(p, tid, { midi: 62, start: 14, length: 8 });
    const q = setBars(p, 1);
    expect(q.tracks[0]!.notes).toHaveLength(1);
    expect(q.tracks[0]!.notes[0]).toMatchObject({ midi: 62, start: 14, length: 2 });
  });

  it('clamps bpm', () => {
    const p = createProject();
    expect(setBpm(p, 1000).bpm).toBe(240);
    expect(setBpm(p, 10).bpm).toBe(40);
  });

  it('stores velocity: default 96, clamped 1..127, settable', () => {
    const { p, tid } = withTrack(1);
    const a = addNote(p, tid, { midi: 60, start: 0, length: 1, id: 'a' });
    expect(a.tracks[0]!.notes[0]!.velocity).toBe(DEFAULT_VELOCITY);
    const b = addNote(a, tid, { midi: 62, start: 0, length: 1, id: 'b', velocity: 500 });
    expect(b.tracks[0]!.notes[1]!.velocity).toBe(127);
    const c = setNoteVelocity(b, tid, 'a', 0);
    expect(c.tracks[0]!.notes[0]!.velocity).toBe(1);
    expect(b.tracks[0]!.notes[0]!.velocity).toBe(DEFAULT_VELOCITY);
    expect(setNoteVelocity(b, tid, 'zz', 5)).toEqual(b);
  });

  it('treats a missing velocity as 96', () => {
    expect(noteVelocity({})).toBe(96);
    expect(velocityGain(undefined)).toBeCloseTo(96 / 127);
    expect(velocityGain(127)).toBe(1);
  });
 it('clears the trim when a track gets a different sound, also without a sound type, and keeps it for the same sound', () => {
  let p = addTrack(createProject(), 'A', 't1');
  p = setTrackTrim(setTrackSample(p, 't1', 's1', 60, 'sample'), 't1', { start: .1, end: .5 });
  expect(setTrackSample(p, 't1', 's1').tracks[0]!.trim).toEqual({ start: .1, end: .5 });
  expect(setTrackSample(p, 't1', 's2').tracks[0]!.trim).toBeUndefined();
  expect(setTrackSample(p, 't1', null).tracks[0]!.trim).toBeUndefined();
 });
});

import {MASTER_ID as MASTER_ID_TEST} from '../audio/mixer/plugins';
import {addPlugin,movePlugin,removePlugin,setPluginBypass,updatePluginSettings,masterChain} from './projectModel';
describe('master insert chain',()=>{
 it('adds, moves, bypasses, updates and removes inserts through the reserved id',()=>{
  let p=createProject();expect(masterChain(p)).toEqual([]);
  p=addPlugin(p,MASTER_ID_TEST,'eq',()=>'a');p=addPlugin(p,MASTER_ID_TEST,'limiter',()=>'b');
  expect(masterChain(p).map(x=>x.id)).toEqual(['a','b']);
  p=movePlugin(p,MASTER_ID_TEST,'b',-1);expect(masterChain(p).map(x=>x.id)).toEqual(['b','a']);
  p=setPluginBypass(p,MASTER_ID_TEST,'b',true);expect(masterChain(p)[0]!.bypass).toBe(true);
  p=updatePluginSettings(p,MASTER_ID_TEST,'b',{ceiling:-3});expect(masterChain(p)[0]!.settings).toMatchObject({ceiling:-3});
  p=removePlugin(p,MASTER_ID_TEST,'a');expect(masterChain(p).map(x=>x.id)).toEqual(['b']);
  expect(p.tracks).toEqual([]);expect(removePlugin(p,MASTER_ID_TEST,'zzz')).toBe(p);
 });
 it('limits the master chain to the plugin maximum',()=>{let p=createProject();for(let i=0;i<9;i++)p=addPlugin(p,MASTER_ID_TEST,'chorus',()=>`c${i}`);expect(masterChain(p)).toHaveLength(6);});
});

describe('sound types', () => {
  it('stores the looped type on the track and labels every type', async () => {
    const { setTrackSample, soundTypeLabel, addTrack, createProject } = await import('./projectModel');
    let p = addTrack(createProject(), 'A', 't1');
    p = setTrackSample(p, 't1', 's1', 60, 'loop');
    expect(p.tracks[0]!.soundType).toBe('loop');
    expect(soundTypeLabel(p.tracks[0]!)).toBe('Looped');
    expect(soundTypeLabel({ ...p.tracks[0]!, soundType: 'instrument' })).toBe('Instrument');
    expect(soundTypeLabel({ ...p.tracks[0]!, soundType: 'sample' })).toBe('Sample');
    expect(soundTypeLabel({ ...p.tracks[0]!, soundType: undefined })).toBe('Sample');
  });
});

describe('preset tracks', () => {
  it('gives a track a preset, keeping its notes and dropping the stored sound', async () => {
    const { setTrackPreset, setTrackSample, setTrackTrim, addNote, addTrack, createProject, isPresetTrack, soundTypeLabel } = await import('./projectModel');
    let p = addTrack(createProject(), 'A', 't1');
    p = setTrackSample(p, 't1', 's1', 55, 'instrument');
    p = setTrackTrim(p, 't1', { start: 0.1, end: 0.5 });
    p = addNote(p, 't1', { midi: 60, start: 0, length: 2 });
    p = setTrackPreset(p, 't1', 'grand');
    const t = p.tracks[0]!;
    expect(t).toMatchObject({ soundType: 'preset', presetId: 'grand', sampleId: null });
    expect(t.trim).toBeUndefined();
    expect(t.notes).toHaveLength(1);
    expect(isPresetTrack(t)).toBe(true);
    expect(soundTypeLabel(t)).toBe('Preset');
    expect(setTrackPreset(p, 't1', 'upright').tracks[0]!.presetId).toBe('upright');
    expect(setTrackPreset(p, 'missing', 'grand')).toBe(p);
  });
  it('a new sample replaces the preset', async () => {
    const { setTrackPreset, setTrackSample, addTrack, createProject, isPresetTrack } = await import('./projectModel');
    let p = setTrackPreset(addTrack(createProject(), 'A', 't1'), 't1', 'grand');
    p = setTrackSample(p, 't1', 's9', 60, 'sample');
    expect(p.tracks[0]!.presetId).toBeUndefined();
    expect(p.tracks[0]!.soundType).toBe('sample');
    expect(isPresetTrack(p.tracks[0]!)).toBe(false);
    p = setTrackSample(setTrackPreset(p, 't1', 'grand'), 't1', 's9');
    expect(isPresetTrack(p.tracks[0]!)).toBe(false);
  });
  it('is not a preset track without an id', async () => {
    const { isPresetTrack } = await import('./projectModel');
    expect(isPresetTrack({ soundType: 'preset' })).toBe(false);
    expect(isPresetTrack(undefined)).toBe(false);
  });
});
