import { describe,expect,it } from 'vitest';
import { generationPresets, generationHint, lengthHint, modeLabel, loadModeSettings, saveModeSettings } from './mode';
import { buildPrompt } from './prompt';
import { MAX_STEPS } from './protocol';

describe('generation paths',()=>{
 it('allows drums in Sample but asks for one isolated note in Instrument',()=>{
  const kick=buildPrompt('deep kick','small-sfx','sample');
  expect(kick).toContain('TrackType: SFX');expect(kick).not.toContain('no drums');expect(kick).not.toContain('sustained');
  const piano=buildPrompt('piano struck once','medium','instrument');
  expect(piano).toContain('TrackType: Instrument');expect(piano).toContain('single note');expect(piano).not.toContain('sustained');
 });
 it('offers editable source lengths and useful prompt descriptions',()=>{
  expect(generationPresets('sample').find(p=>p.id==='kick')).toMatchObject({seconds:1});
  expect(generationPresets('instrument').find(p=>p.id==='piano')).toMatchObject({seconds:4});
  expect(generationHint('instrument')).toContain('one note');
 });
 it('keeps different settings per mode and tolerates invalid storage',()=>{
  const values=new Map<string,string>();const storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>void values.set(k,v)};
  expect(loadModeSettings(storage,'sample')).toEqual({seconds:2,steps:8});
  expect(loadModeSettings(storage,'instrument')).toEqual({seconds:4,steps:16});
  saveModeSettings(storage,'sample',{seconds:1.25,steps:7});
  expect(loadModeSettings(storage,'sample')).toEqual({seconds:1.25,steps:7});
  expect(loadModeSettings(storage,'instrument').seconds).toBe(4);
  storage.setItem('sa3daw.gen.instrument','{"seconds":null,"steps":-1}');
  expect(loadModeSettings(storage,'instrument')).toEqual({seconds:4,steps:16});
 });
});

describe('step range in stored settings',()=>{
 const make=()=>{const values=new Map<string,string>();return {values,getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>void values.set(k,v)};};
 it('accepts steps above 16 up to MAX_STEPS',()=>{
  const storage=make();
  saveModeSettings(storage,'sample',{seconds:2,steps:MAX_STEPS});
  expect(loadModeSettings(storage,'sample')).toEqual({seconds:2,steps:MAX_STEPS});
  storage.values.set('sa3daw.gen.instrument','{"seconds":4,"steps":40}');
  expect(loadModeSettings(storage,'instrument').steps).toBe(40);
 });
 it('still loads older settings and rejects steps beyond MAX_STEPS or below 4',()=>{
  const storage=make();
  storage.values.set('sa3daw.gen.sample','{"seconds":3,"steps":16}');
  expect(loadModeSettings(storage,'sample')).toEqual({seconds:3,steps:16});
  storage.values.set('sa3daw.gen.sample',JSON.stringify({seconds:3,steps:MAX_STEPS+1}));
  expect(loadModeSettings(storage,'sample')).toEqual({seconds:2,steps:8});
  storage.values.set('sa3daw.gen.sample','{"seconds":3,"steps":3}');
  expect(loadModeSettings(storage,'sample')).toEqual({seconds:2,steps:8});
 });
});

describe('looped path',()=>{
 it('asks for one isolated sustained note with the instrument guidance',()=>{
  const p=buildPrompt('warm analog pad','medium','loop');
  expect(p).toContain('TrackType: Instrument');expect(p).toContain('sustained note');expect(p).toContain('no chords');expect(p).toContain('no reverb');
  expect(buildPrompt('warm analog pad','small-sfx','loop')).not.toContain('TrackType');
 });
 it('has presets with 4 s sources and its own hints',()=>{
  expect(generationPresets('loop').length).toBeGreaterThan(2);
  for(const p of generationPresets('loop'))expect(p.seconds).toBe(4);
  expect(generationHint('loop')).toContain('sustain');
  expect(lengthHint('loop')).toContain('loop');
 });
 it('defaults to 4 s and 16 steps and stores its own settings under sa3daw.gen.loop',()=>{
  const values=new Map<string,string>();const storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>void values.set(k,v)};
  expect(loadModeSettings(storage,'loop')).toEqual({seconds:4,steps:16});
  saveModeSettings(storage,'loop',{seconds:5,steps:12});
  expect(values.has('sa3daw.gen.loop')).toBe(true);
  expect(loadModeSettings(storage,'loop')).toEqual({seconds:5,steps:12});
  expect(loadModeSettings(storage,'instrument')).toEqual({seconds:4,steps:16});
  storage.setItem('sa3daw.gen.loop','garbage');
  expect(loadModeSettings(storage,'loop')).toEqual({seconds:4,steps:16});
 });
});

it('labels every mode, treating a missing one as a sample',()=>{
 expect(modeLabel('loop')).toBe('Looped');expect(modeLabel('instrument')).toBe('Instrument');expect(modeLabel('sample')).toBe('Sample');expect(modeLabel(undefined)).toBe('Sample');
});
