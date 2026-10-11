/** Non-destructive chop: the kept region of a sound's original source, in seconds. */
export interface Trim {start:number;end:number}
export const MIN_KEPT_SEC=.05;
export const FADE_SEC=.003;
const clamp=(v:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,v));
export const fullTrim=(duration:number):Trim=>({start:0,end:duration});
const minKept=(duration:number)=>Math.min(MIN_KEPT_SEC,duration);
/** A usable trim for a source of this duration; missing or invalid fields mean the full clip. */
export function resolveTrim(value:Partial<Trim>|null|undefined,duration:number):Trim {
 const min=minKept(duration);
 if(duration<=min)return fullTrim(duration);
 const start=clamp(Number.isFinite(value?.start)?value!.start!:0,0,duration-min);
 const end=clamp(Number.isFinite(value?.end)?value!.end!:duration,start+min,duration);
 return {start,end};
}
export const moveStart=(trim:Trim,start:number,duration:number):Trim=>resolveTrim({start:Math.min(start,trim.end-minKept(duration)),end:trim.end},duration);
export const moveEnd=(trim:Trim,end:number,duration:number):Trim=>resolveTrim({start:trim.start,end:Math.max(end,trim.start+minKept(duration))},duration);
export const isFullTrim=(trim:Trim,duration:number)=>trim.start<=0&&trim.end>=duration;
/** What the track stores: nothing for the full clip. */
export function storedTrim(trim:Trim,duration:number):Trim|undefined {
 const t=resolveTrim(trim,duration);return isFullTrim(t,duration)?undefined:t;
}
/** Shape check for persisted values; the clip duration is applied later by resolveTrim. */
export function normalizeStoredTrim(value:unknown):Trim|undefined {
 const v=value as Partial<Record<'start'|'end',unknown>>|null|undefined;
 if(!v||typeof v.start!=='number'||typeof v.end!=='number'||!Number.isFinite(v.start)||!Number.isFinite(v.end))return undefined;
 const start=Math.max(0,v.start);return v.end>start?{start,end:v.end}:undefined;
}
/** Frame range of a trim inside a buffer; always at least one frame. */
export function trimFrames(trim:Trim,sampleRate:number,length:number):{start:number;end:number} {
 const start=clamp(Math.round(trim.start*sampleRate),0,Math.max(0,length-1));
 const end=clamp(Math.round(trim.end*sampleRate),start+1,Math.max(1,length));
 return {start,end};
}
/** The kept region with a short fade at each cut edge; the source itself when nothing is cut. */
export function applyTrim(pcm:Float32Array,sampleRate:number,trim:Partial<Trim>|null|undefined,fadeSec=FADE_SEC):Float32Array {
 const duration=pcm.length/sampleRate,t=resolveTrim(trim,duration);
 if(isFullTrim(t,duration))return pcm;
 const {start,end}=trimFrames(t,sampleRate,pcm.length),out=pcm.slice(start,end),fade=Math.min(Math.round(fadeSec*sampleRate),out.length>>1);
 if(start>0)for(let i=0;i<fade;i++)out[i]!*=i/fade;
 if(end<pcm.length)for(let i=0;i<fade;i++)out[out.length-1-i]!*=i/fade;
 return out;
}
