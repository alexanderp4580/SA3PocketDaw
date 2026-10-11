// Dev-only audio-thread probe: renders the real engine graph (mixer, EQ/reverb worklets, instrument voices) in an
// OfflineAudioContext, stepping the scheduler timers every 25 ms of audio time. wall/audio = realtime cost.
import {createEngine} from '../../src/audio/engine';
import {createProject,addTrack,addNote,setTrackSample,type Project} from '../../src/store/projectModel';
import {updatePluginSettings,addPlugin} from '../../src/store/projectModel';
import type {InstrumentProfile} from '../../src/audio/instrument/types';
const SR=44100;
function profile(n:number,hz=220):InstrumentProfile{const count=Math.ceil(2*SR/512);const pcm=new Float32Array(SR*2);for(let i=0;i<pcm.length;i++)pcm[i]=Math.sin(2*Math.PI*hz*i/SR)*Math.exp(-i/SR);
 return {version:1,hz,sampleRate:SR,hop:512,pcm,residual:new Float32Array(pcm.length).map(()=>Math.random()*.01-.005),partials:Array.from({length:n},(_,i)=>({ratio:i+1,amplitudes:Float32Array.from({length:count},(_,j)=>.15*Math.exp(-j/120)/(i+1)),phase:0,decay:-1})),harmonicEnergy:1,dynamics:'sustain',gain:1};}
export interface Case {tracks:number;instrumentTracks:number;partials:number;eq:boolean;reverb:boolean;seconds:number;notesPerBar:number;}
export async function run(c:Case){
 let p:Project=createProject({bpm:120,bars:2});
 const samples=new Map<string,Float32Array>();
 for(let t=0;t<c.tracks;t++){
  const id=`t${t}`;p=addTrack(p,`Track ${t}`,id);const inst=t<c.instrumentTracks,sid=`s${t}`;
  p=setTrackSample(p,id,sid,57,inst?'instrument':'sample');
  for(let i=0;i<c.notesPerBar*2;i++)p=addNote(p,id,{midi:45+(i*5+t*3)%24,start:i*(32/(c.notesPerBar*2)),length:Math.max(1,Math.round(64/(c.notesPerBar*2))),velocity:100});
  if(c.eq)p=addPlugin(p,id,'eq',()=>`eq${t}`);
  if(c.reverb)p=addPlugin(p,id,'reverb',()=>`rv${t}`);
 }
 const length=c.seconds,ctx=new OfflineAudioContext(2,Math.ceil(length*SR),SR);
 const realResume=ctx.resume.bind(ctx);(ctx as any).resume=async()=>{};
 const timers:Array<()=>void>=[];
 const engine=createEngine({createContext:()=>ctx as any,setTimer:(fn)=>{timers.push(fn);return fn;},clearTimer:h=>{const i=timers.indexOf(h as any);if(i>=0)timers.splice(i,1);}});
 engine.setProject(p);
 for(let t=0;t<c.tracks;t++){const sid=`s${t}`;if(t<c.instrumentTracks)engine.setInstrument(sid,profile(c.partials));else{const pcm=new Float32Array(SR);for(let i=0;i<pcm.length;i++)pcm[i]=Math.sin(2*Math.PI*220*i/SR)*Math.exp(-i/(SR*.3));engine.setSample(sid,pcm,SR);}}
 engine.setProject(p);
 await engine.unlock();
 // let mixer worklets and Dragonfly modules install before rendering
 await new Promise(r=>setTimeout(r,1500));
 await engine.play();
 const t0=performance.now();let ticks=0;
 for(let at=.025;at<length-.05;at+=.025){ctx.suspend(at).then(()=>{const fns=timers.splice(0);for(const f of fns)f();ticks++;void realResume();});}
 const buf=await ctx.startRendering();
 const wall=performance.now()-t0;let peak=0;for(const ch of [0,1])for(const v of buf.getChannelData(ch))peak=Math.max(peak,Math.abs(v));
 return {...c,wallMs:Math.round(wall),audioMs:length*1000,realtimeFactor:+(wall/(length*1000)).toFixed(3),peak:+peak.toFixed(3),ticks};
}
(window as any).run=run;(window as any).ready=true;
