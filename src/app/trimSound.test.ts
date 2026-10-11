import 'fake-indexeddb/auto';
import {IDBFactory} from 'fake-indexeddb';
import {describe,expect,it} from 'vitest';
import {applyTrackTrim} from './trimSound';
import {createProjectStore} from '../store/projectStore';
import {addTrack,createProject,setTrackSample} from '../store/projectModel';
import {createEngine} from '../audio/engine';
import {analyse} from '../audio/instrument/analysis';

function tone(hz:number,sec:number,rate=44100){const out=new Float32Array(Math.floor(sec*rate));for(let i=0;i<out.length;i++)out[i]=.5*Math.sin(2*Math.PI*hz*i/rate);return out;}
async function setup(instrument:boolean){
 const store=createProjectStore({idb:new IDBFactory(),setTimer:()=>0,clearTimer:()=>{}});
 const engine=createEngine({createContext:()=>{throw new Error('no audio');}});
 const pcm=tone(220,2);
 await store.putSample('s1',{pcm,sampleRate:44100,meta:{},...(instrument?{instrument:analyse(pcm,44100,'sustain')}:{})});
 store.set(setTrackSample(addTrack(createProject(),'Lead','t1'),'t1','s1',57,instrument?'instrument':'sample'));
 return {store,engine,pcm};
}
describe('applyTrackTrim',()=>{
 it('stores a sample trim, reloads it and clears it when widened to the full clip',async()=>{
  const d=await setup(false);
  await applyTrackTrim(d,'t1',{start:.5,end:1.25});
  expect(d.store.get()!.tracks[0]!.trim).toEqual({start:.5,end:1.25});
  await d.store.flush();await d.store.load();expect(d.store.get()!.tracks[0]!.trim).toEqual({start:.5,end:1.25});
  expect((await d.store.getSample('s1'))!.pcm.length).toBe(d.pcm.length);
  await applyTrackTrim(d,'t1',{start:0,end:2});
  expect(d.store.get()!.tracks[0]!.trim).toBeUndefined();
 });
 it('re-analyses an instrument from the cut source and keeps the original source',async()=>{
  const d=await setup(true);const seen:Array<{length:number;rate:number;first:number}>=[];
  await applyTrackTrim({...d,analyseInstrument:async(pcm,rate,dyn)=>{seen.push({length:pcm.length,rate,first:pcm[0]!});return analyse(pcm,rate,dyn);}},'t1',{start:.5,end:1.5});
  expect(seen).toEqual([{length:44100,rate:44100,first:0}]);
  const stored=(await d.store.getSample('s1'))!;
  expect(stored.pcm.length).toBe(d.pcm.length);
  expect(stored.instrument!.pcm.length).toBeLessThanOrEqual(44100);
  expect(d.store.get()!.tracks[0]!.trim).toEqual({start:.5,end:1.5});
 });
 it('keeps the old sound and trim when analysis fails',async()=>{
  const d=await setup(true);const before=(await d.store.getSample('s1'))!.instrument;
  await expect(applyTrackTrim({...d,analyseInstrument:async()=>{throw new Error('Not a single note');}},'t1',{start:.5,end:1.5})).rejects.toThrow('single note');
  expect(d.store.get()!.tracks[0]!.trim).toBeUndefined();
  expect((await d.store.getSample('s1'))!.instrument!.hz).toBe(before!.hz);
 });
 it('drops a plain trim when the sound is replaced while the sample is being read',async()=>{
  const d=await setup(false);let release=()=>{};const gate=new Promise<void>(r=>{release=r;});
  const slow={...d.store,getSample:async(id:string)=>{const s=await d.store.getSample(id);await gate;return s;}} as typeof d.store;
  const run=applyTrackTrim({...d,store:slow},'t1',{start:.5,end:1.25});
  d.store.set(setTrackSample(d.store.get()!,'t1','s2',60,'sample'));
  release();await run;
  const t=d.store.get()!.tracks[0]!;expect(t.sampleId).toBe('s2');expect(t.trim).toBeUndefined();
 });
 it('leaves no orphan sample or trim when the sound is replaced during instrument analysis',async()=>{
  const d=await setup(true);let release=()=>{};const gate=new Promise<void>(r=>{release=r;});
  const run=applyTrackTrim({...d,analyseInstrument:async(pcm,rate,dyn)=>{await gate;return analyse(pcm,rate,dyn);}},'t1',{start:.5,end:1.5});
  await new Promise(r=>setTimeout(r,0));
  d.store.set(setTrackSample(d.store.get()!,'t1','s2',60,'sample'));
  release();await run;await d.store.flush();
  expect(d.store.get()!.tracks[0]!.trim).toBeUndefined();
  expect(await d.store.listSampleIds()).not.toContain('s1');
 });
 it('removes the written profile when the sound is replaced while it is being stored',async()=>{
  const d=await setup(true);
  const racing={...d.store,putSample:async(id:string,sample:Parameters<typeof d.store.putSample>[1])=>{d.store.set(setTrackSample(d.store.get()!,'t1','s2',60,'sample'));await d.store.putSample(id,sample);}} as typeof d.store;
  await applyTrackTrim({...d,store:racing,analyseInstrument:async(p,r,y)=>analyse(p,r,y)},'t1',{start:.5,end:1.5});
  await d.store.flush();
  expect(d.store.get()!.tracks[0]!.trim).toBeUndefined();
  expect(await d.store.listSampleIds()).not.toContain('s1');
 });
 it('persists the new profile and the trim together',async()=>{
  const d=await setup(true);
  await applyTrackTrim({...d,analyseInstrument:async(p,r,y)=>analyse(p,r,y)},'t1',{start:.5,end:1.5});
  await d.store.load();
  expect(d.store.get()!.tracks[0]!.trim).toEqual({start:.5,end:1.5});
 });
});
