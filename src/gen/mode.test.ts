import { describe,expect,it } from 'vitest';
import { generationPresets, generationHint, loadModeSettings, saveModeSettings } from './mode';
import { buildPrompt } from './prompt';

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
