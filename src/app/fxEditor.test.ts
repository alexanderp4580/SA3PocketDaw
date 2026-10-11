import {describe,expect,it} from 'vitest';
import {addPlugin,addTrack,createProject,masterChain} from '../store/projectModel';
import {MASTER_ID} from '../audio/mixer/plugins';
import {defaultFx} from '../audio/mixer/fx/spec';
import {fxEditorState,masterTrack,resetFx,setFxParam,visibleParams} from './pluginEditor';
function fixture(){let p=addTrack(createProject(),'Lead');const tid=p.tracks[0]!.id;p=addPlugin(p,tid,'compressor',()=>'comp');p=addPlugin(p,MASTER_ID,'limiter',()=>'lim');return {p,tid};}
describe('generic effect editor',()=>{
 it('reads normalised state of a track insert and of a master insert',()=>{
  const {p,tid}=fixture();
  expect(fxEditorState(p.tracks[0]!,'comp')).toEqual({kind:'compressor',settings:defaultFx('compressor'),bypass:false});
  expect(fxEditorState(masterTrack(p),'lim')).toEqual({kind:'limiter',settings:defaultFx('limiter'),bypass:false});
  expect(fxEditorState(p.tracks[0]!,'missing')).toBeNull();expect(tid).toBeTruthy();
 });
 it('sets a clamped parameter on a track insert only',()=>{
  const {p,tid}=fixture();const q=setFxParam(p,tid,'comp','ratio',500);
  expect(fxEditorState(q.tracks[0]!,'comp')!.settings.ratio).toBe(20);expect(masterChain(q)).toEqual(masterChain(p));
 });
 it('sets a parameter on the master chain and reports no change for unknown ids',()=>{
  const {p}=fixture();const q=setFxParam(p,MASTER_ID,'lim','ceiling',-6);
  expect(fxEditorState(masterTrack(q),'lim')!.settings.ceiling).toBe(-6);
  expect(setFxParam(p,MASTER_ID,'nope','ceiling',-6)).toBe(p);expect(setFxParam(p,MASTER_ID,'lim','nope',1)).toBe(p);
 });
 it('reset restores defaults and enables the plugin',()=>{
  const {p,tid}=fixture();let q=setFxParam(p,tid,'comp','threshold',-40);q={...q,tracks:q.tracks.map(t=>({...t,mix:{...t.mix!,plugins:t.mix!.plugins.map(x=>({...x,bypass:true}))}}))};
  const r=resetFx(q,tid,'comp');expect(fxEditorState(r.tracks[0]!,'comp')).toEqual({kind:'compressor',settings:defaultFx('compressor'),bypass:false});
 });
 it('hides parameters that do not apply',()=>{
  expect(visibleParams('delay',{...defaultFx('delay'),sync:0}).map(s=>s.id)).toContain('time');
  expect(visibleParams('delay',{...defaultFx('delay'),sync:3}).map(s=>s.id)).not.toContain('time');
  const off=visibleParams('filter',{...defaultFx('filter'),sweep:0}).map(s=>s.id);expect(off).not.toContain('rate');expect(off).not.toContain('note');expect(off).not.toContain('depth');
  expect(visibleParams('filter',{...defaultFx('filter'),sweep:1}).map(s=>s.id)).toContain('rate');
  expect(visibleParams('filter',{...defaultFx('filter'),sweep:2}).map(s=>s.id)).toContain('note');
 });
});
