import { describe,expect,it } from 'vitest';
import { generationPresets, generationHint, loadModeSettings, saveModeSettings } from './mode';
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
