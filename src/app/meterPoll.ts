import type {MeterReading} from '../audio/mixer/meter';
/** `setTimer` starts a repeating timer. */
export interface MeterPollOptions {setTimer:(fn:()=>void,ms:number)=>unknown;clearTimer:(h:unknown)=>void;hidden:()=>boolean;intervalMs?:number;}
const same=(a:MeterReading,b:MeterReading)=>a.clip===b.clip&&a.rms[0]===b.rms[0]&&a.rms[1]===b.rms[1]&&a.peak[0]===b.peak[0]&&a.peak[1]===b.peak[1];
/** One shared timer drives every visible meter; it stops with the last subscriber and skips hidden pages. */
export function createMeterPoll(o:MeterPollOptions){
 const subs=new Set<{notify:(r:MeterReading)=>void;read:()=>MeterReading;last:MeterReading|null}>();let timer:unknown=null;
 function tick(){if(o.hidden())return;for(const s of subs){const r=s.read();if(s.last&&same(s.last,r))continue;s.last={rms:[r.rms[0],r.rms[1]],peak:[r.peak[0],r.peak[1]],clip:r.clip};s.notify(r);}}
 return {subscribe(notify:(r:MeterReading)=>void,read:()=>MeterReading){
  const s={notify,read,last:null as MeterReading|null};subs.add(s);if(timer===null)timer=o.setTimer(tick,o.intervalMs??40);
  return ()=>{subs.delete(s);if(!subs.size&&timer!==null){o.clearTimer(timer);timer=null;}};
 }};
}
export const meterPoll=createMeterPoll({setTimer:(fn,ms)=>setInterval(fn,ms),clearTimer:h=>clearInterval(h as ReturnType<typeof setInterval>),hidden:()=>document.hidden});
