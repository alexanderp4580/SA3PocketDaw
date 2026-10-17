import {afterEach,describe,expect,it,vi} from 'vitest';
import {addNote,addTrack,createProject,setTrackSample,setTrackTrim,type Project} from '../store/projectModel';
import {placeBlock} from './arrangement';
import {FADE_SEC} from '../audio/trim';
import {renderSong} from './render';
const RATE=44100;
interface Played {data:Float32Array;when:number;loop?:boolean;loopStart?:number;loopEnd?:number;until?:number}
/** Minimal OfflineAudioContext: records the buffer and start time of every buffer source. */
function stubContext(played:Played[]){
 const param=()=>({value:1,setValueAtTime(){},linearRampToValueAtTime(){},cancelScheduledValues(){}});
 const node=()=>({connect(){},disconnect(){},gain:param(),pan:param(),playbackRate:param(),frequency:param(),Q:param(),channelCount:2,channelCountMode:'',addEventListener(){}});
 class Ctx{
  length:number;currentTime=0;destination={};audioWorklet={addModule:async()=>{}};
  constructor(_ch:number,length:number){this.length=length;}
  createGain=node;createStereoPanner=node;createBiquadFilter=node;
  createBuffer(_ch:number,length:number){const rec={length,data:new Float32Array(0) as Float32Array,duration:length/RATE,copyToChannel(d:Float32Array){rec.data=d;}};return rec;}
  createBufferSource(){const src:{buffer:{data:Float32Array}|null;when:number;loop?:boolean;loopStart?:number;loopEnd?:number}&ReturnType<typeof node>={...node(),buffer:null,when:-1};
   const rec:Played={data:new Float32Array(0),when:-1};return Object.assign(src,{start(w?:number){src.when=w??0;Object.assign(rec,{data:src.buffer!.data,when:src.when,loop:src.loop,loopStart:src.loopStart,loopEnd:src.loopEnd});played.push(rec);},stop(t?:number){rec.until=t;}});}
  suspend(){return Promise.resolve();}
  resume(){return Promise.resolve();}
  async startRendering(){return {getChannelData:()=>new Float32Array(this.length)};}
 }
 vi.stubGlobal('OfflineAudioContext',Ctx);
}
function songProject(trim?:{start:number;end:number}):Project {
 let p=createProject({bars:2,bpm:120});
 for(const id of ['a','b']){p=addTrack(p,id,id);p=setTrackSample(p,id,'s'+id);p=addNote(p,id,{midi:60,start:0,length:2});p=placeBlock(p,id,1);}
 return trim?setTrackTrim(p,'a',trim):p;
}
const sounds=()=>new Map([['a',{pcm:new Float32Array(RATE*3).fill(1),sampleRate:RATE,meta:{}}],['b',{pcm:new Float32Array(RATE*3).fill(1),sampleRate:RATE,meta:{}}]]);
afterEach(()=>vi.unstubAllGlobals());
describe('export render of chopped sample tracks',()=>{
 it('plays the cut region with edge fades and leaves an unchopped track whole',async()=>{
  const played:Played[]=[];stubContext(played);
  await renderSong(songProject({start:.5,end:1.5}),sounds());
  const lengths=played.map(p=>p.data.length).sort((x,y)=>x-y);
  expect(lengths).toEqual([RATE,RATE*3]);
  const cut=played.find(p=>p.data.length===RATE)!.data,full=played.find(p=>p.data.length===RATE*3)!.data;
  const fade=Math.round(FADE_SEC*RATE);
  expect(cut[0]).toBe(0);expect(cut[cut.length-1]).toBe(0);expect(cut[fade]).toBe(1);expect(cut[cut.length-1-fade]).toBe(1);expect(cut[RATE>>1]).toBe(1);
  expect(full[0]).toBe(1);expect(full[full.length-1]).toBe(1);
 });
 it('without any trim every track is rendered from the whole source',async()=>{
  const played:Played[]=[];stubContext(played);
  await renderSong(songProject(),sounds());
  expect(played.map(p=>p.data.length)).toEqual([RATE*3,RATE*3]);
  expect(played.every(p=>p.data[0]===1)).toBe(true);
 });
});

describe('export render of looped sample tracks',()=>{
 const loopSounds=()=>new Map([['a',{pcm:new Float32Array(RATE*3).fill(1),sampleRate:RATE,loop:{start:1,end:2},meta:{}}],['b',{pcm:new Float32Array(RATE*3).fill(1),sampleRate:RATE,meta:{}}]]);
 it('loops a looped sound like live playback and leaves other tracks as one-shots',async()=>{
  const played:Played[]=[];stubContext(played);
  await renderSong(songProject(),loopSounds());
  const looped=played.filter(p=>p.loop);expect(looped).toHaveLength(1);
  expect(looped[0]!.loopStart).toBe(1);expect(looped[0]!.loopEnd).toBe(2);
  expect(played.filter(p=>!p.loop)).toHaveLength(1);
 });
 it('shifts the loop with the chop and drops it when the chop reaches into it',async()=>{
  let played:Played[]=[];stubContext(played);
  await renderSong(songProject({start:.5,end:2.5}),loopSounds());
  const l=played.find(p=>p.loop)!;expect(l.loopStart).toBeCloseTo(.5,5);expect(l.loopEnd).toBeCloseTo(1.5,5);
  played=[];stubContext(played);
  await renderSong(songProject({start:1.5,end:2.5}),loopSounds());
  expect(played.some(p=>p.loop)).toBe(false);
 });
});
