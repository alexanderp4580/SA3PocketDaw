import { log } from '../log';
import { velocityGain,trackBars,loopRange,type LoopRange } from '../store/projectModel';
const scope=log.scope('audio.scheduler');
export const STEPS_PER_BAR=16,LOOKAHEAD_SEC=.15,TICK_MS=25,START_DELAY_SEC=.05;
export interface PatternNote {id:string;midi:number;start:number;length:number;velocity?:number}
export interface PatternTrack {id:string;muted:boolean;solo?:boolean;bars?:number;notes:PatternNote[]}
export interface Pattern {bars:number;loop?:LoopRange;tracks:PatternTrack[]}
export interface NoteEvent {trackId:string;noteId:string;midi:number;when:number;duration:number;velocity:number}
export interface SchedulerOptions {now:()=>number;setTimer:(fn:()=>void,ms:number)=>unknown;clearTimer:(h:unknown)=>void;onNote:(e:NoteEvent)=>void;lookahead?:number;tickMs?:number}
export function createScheduler(opts:SchedulerOptions){
 const lookahead=opts.lookahead??LOOKAHEAD_SEC,tickMs=opts.tickMs??TICK_MS;
 let pattern:Pattern={bars:1,tracks:[]},bpm=120,playing=false,timer:unknown=null,anchorTime=0,anchorStep=0,scheduledUntil=0,paused:number|null=null;
 const sps=()=>bpm/60*4;
 const range=()=>{const r=loopRange(pattern);return {start:(r.startBar-1)*16,end:r.endBar*16,len:(r.endBar-r.startBar+1)*16};};
 const stepAt=(t:number)=>anchorStep+(t-anchorTime)*sps();
 const timeAt=(step:number)=>anchorTime+(step-anchorStep)/sps();
 const audible=(track:PatternTrack)=>!track.muted&&(!pattern.tracks.some(t=>t.solo)||track.solo);
 function emit(track:PatternTrack,n:PatternNote,when:number,steps:number){if(steps>0)opts.onNote({trackId:track.id,noteId:n.id,midi:n.midi,when,duration:steps/sps(),velocity:velocityGain(n.velocity)});}
 function schedule(from:number,to:number){
  const r=range();for(let cycle=Math.floor(from/r.len);cycle<=Math.floor((to-1e-9)/r.len);cycle++){
   const begin=r.start+Math.max(0,from-cycle*r.len),end=r.start+Math.min(r.len,to-cycle*r.len);
   for(const track of pattern.tracks){if(!audible(track))continue;const length=trackBars(track,pattern.bars)*16;
    for(let repeat=Math.floor(begin/length);repeat<=Math.floor((end-1e-9)/length);repeat++)for(const n of track.notes){const source=repeat*length+n.start,at=Math.max(source,r.start);if(n.start>=length||at<begin||at>=end)continue;emit(track,n,timeAt(cycle*r.len+at-r.start),Math.min(source+n.length,(repeat+1)*length,r.end)-at);}
   }
  }
 }
 function overlap(step:number){const r=range(),position=r.start+step%r.len;for(const t of pattern.tracks){if(!audible(t))continue;const len=trackBars(t,pattern.bars)*16,local=position%len;for(const n of t.notes)if(n.start<local&&n.start+n.length>local)emit(t,n,anchorTime,Math.min(n.start+n.length-local,len-local,r.end-position));}}
 function clear(){if(timer!==null)opts.clearTimer(timer);timer=null;}
 function tick(){if(!playing)return;const horizon=stepAt(opts.now()+lookahead);if(horizon>scheduledUntil){schedule(scheduledUntil,horizon);scheduledUntil=horizon;}timer=opts.setTimer(tick,tickMs);}
 return {
  get isPlaying(){return playing;},get bpm(){return bpm;},
  setPattern(p:Pattern){const before=range();pattern=p;const after=range();if(before.start!==after.start||before.end!==after.end){paused=null;if(playing){clear();anchorTime=opts.now()+START_DELAY_SEC;anchorStep=0;scheduledUntil=0;tick();}}},
  setBpm(next:number){if(!(next>0)||next===bpm)return;if(playing){const t=opts.now();anchorStep=stepAt(t);anchorTime=t;}bpm=next;scope.debug('bpm',{bpm});},
  play(){if(playing)return;playing=true;anchorTime=opts.now()+START_DELAY_SEC;anchorStep=paused??0;scheduledUntil=anchorStep;if(paused!==null&&anchorStep%range().len>1e-9)overlap(anchorStep);paused=null;scope.info('play',{bpm,range:range()});tick();},
  pause(){if(!playing)return;paused=Math.max(anchorStep,stepAt(opts.now()));playing=false;clear();scope.info('pause',{step:paused});},
  stop(){playing=false;paused=null;clear();scope.info('stop');},
  position(){const r=range(),step=playing?Math.max(anchorStep,stepAt(opts.now())):paused??0;return r.start+step%r.len;},
 };
}
export type Scheduler=ReturnType<typeof createScheduler>;
