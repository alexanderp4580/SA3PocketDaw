import {moveEnd,moveStart,type Trim} from '../audio/trim';
/** Chop view maths: a visible time window over the source, pixel mapping, zoom/pan and column peaks. */
export interface Win {start:number;end:number}
/** Deepest zoom: one pixel covers this many seconds. */
export const MAX_SEC_PER_PX=.001;
const clamp=(v:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,v));
export const fullWindow=(duration:number):Win=>({start:0,end:duration});
/** Shortest visible span for a plot this wide; never longer than the clip. */
export const minSpan=(duration:number,widthPx:number)=>Math.min(duration,Math.max(0,widthPx)*MAX_SEC_PER_PX);
function place(start:number,span:number,duration:number):Win {
 const s=clamp(start,0,Math.max(0,duration-span));return {start:s,end:s+span};
}
export function clampWindow(win:Win,duration:number,widthPx:number):Win {
 if(!(duration>0))return fullWindow(Math.max(0,duration||0));
 if(!Number.isFinite(win.start)||!Number.isFinite(win.end))return fullWindow(duration);
 const span=clamp(win.end-win.start,minSpan(duration,widthPx),duration);
 return span>=duration?fullWindow(duration):place(win.start,span,duration);
}
/** Zoom by factor (>1 zooms in) keeping the time at `centre` under the same screen position. */
export function zoomAbout(win:Win,factor:number,centre:number,duration:number,widthPx:number):Win {
 const span=win.end-win.start,next=clamp(span/(factor>0?factor:1),minSpan(duration,widthPx),duration);
 if(next>=duration)return fullWindow(duration);
 const frac=span>0?(centre-win.start)/span:.5;
 return place(centre-frac*next,next,duration);
}
export function panBy(win:Win,deltaSec:number,duration:number):Win {return place(win.start+deltaSec,win.end-win.start,duration);}
/** The zoom window to keep when the sound's duration goes from `prev` to `next`: unchanged for the same duration, none (fit) otherwise. */
export const keepWindow=(win:Win|null,prev:number,next:number):Win|null=>prev===next?win:null;
export const sameTrim=(a:Trim,b:Trim)=>a.start===b.start&&a.end===b.end;
export const secToPx=(t:number,win:Win,widthPx:number)=>win.end>win.start?(t-win.start)/(win.end-win.start)*widthPx:0;
export const pxToSec=(x:number,win:Win,widthPx:number)=>widthPx>0?win.start+x/widthPx*(win.end-win.start):win.start;
/** New trim for a handle dragged to plot pixel `px` (`grab` is the pointer-to-line offset at grab time). */
export function dragHandle(handle:'start'|'end',trim:Trim,px:number,win:Win,widthPx:number,duration:number,grab=0):Trim {
 const t=pxToSec(px-grab,win,widthPx);
 return handle==='start'?moveStart(trim,t,duration):moveEnd(trim,t,duration);
}
/** Per-column min/max of the source over the window; columns with no samples are 0. */
export function columnPeaks(pcm:Float32Array,sampleRate:number,win:Win,columns:number):{min:Float32Array;max:Float32Array} {
 const n=Math.max(1,Math.floor(columns)),min=new Float32Array(n),max=new Float32Array(n);
 const s0=win.start*sampleRate,per=(win.end-win.start)*sampleRate/n,eps=1e-6;
 for(let c=0;c<n;c++){
  const from=Math.floor(s0+c*per+eps),to=Math.max(from+1,Math.floor(s0+(c+1)*per+eps));
  if(to<=0||from>=pcm.length)continue;
  let lo=Infinity,hi=-Infinity;
  for(let i=Math.max(0,from);i<to&&i<pcm.length;i++){const v=pcm[i]!;if(v<lo)lo=v;if(v>hi)hi=v;}
  if(lo<=hi){min[c]=lo;max[c]=hi;}
 }
 return {min,max};
}
/** The part of a fixed-bin peaks array that falls inside the window; at least one bin. */
export function fixedPeaksWindow(peaks:Float32Array,duration:number,win:Win):Float32Array {
 const n=peaks.length;if(n===0||!(duration>0))return peaks;
 const i0=clamp(Math.floor(win.start/duration*n),0,n-1),i1=clamp(Math.ceil(win.end/duration*n),i0+1,n);
 return peaks.subarray(i0,i1);
}
/** columnPeaks that returns the previous result while pcm, rate, window and column count are unchanged. */
export function memoColumnPeaks():(pcm:Float32Array,sampleRate:number,win:Win,columns:number)=>{min:Float32Array;max:Float32Array} {
 let k:{pcm:Float32Array;sr:number;s:number;e:number;c:number}|null=null,r:{min:Float32Array;max:Float32Array}|null=null;
 return (pcm,sr,win,c)=>{
  if(r&&k&&k.pcm===pcm&&k.sr===sr&&k.s===win.start&&k.e===win.end&&k.c===c)return r;
  r=columnPeaks(pcm,sr,win,c);k={pcm,sr,s:win.start,e:win.end,c};return r;
 };
}
