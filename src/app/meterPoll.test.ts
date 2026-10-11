import {expect,it} from 'vitest';
import {createMeterPoll} from './meterPoll';
import {emptyMeter} from '../audio/mixer/meter';
function harness(){
 const timers=new Map<number,()=>void>();let id=0,hidden=false;
 const poll=createMeterPoll({setTimer:fn=>{timers.set(++id,fn);return id;},clearTimer:h=>{timers.delete(h as number);},hidden:()=>hidden});
 return {poll,timers,tick:()=>[...timers.values()].forEach(f=>f()),hide:(v:boolean)=>{hidden=v;}};
}
it('runs one shared timer only while there are subscribers',()=>{
 const h=harness(),a=h.poll.subscribe(()=>{},emptyMeter),b=h.poll.subscribe(()=>{},emptyMeter);
 expect(h.timers.size).toBe(1);a();expect(h.timers.size).toBe(1);b();expect(h.timers.size).toBe(0);
});
it('reads each subscriber through its own source and skips hidden pages',()=>{
 const h=harness(),got:string[]=[],loud={...emptyMeter(),peak:[.5,.5] as [number,number]};
 h.poll.subscribe(r=>got.push(`a:${r.peak[0]}`),()=>loud);h.poll.subscribe(r=>got.push(`b:${r.peak[0]}`),()=>emptyMeter());
 h.tick();expect(got).toEqual(['a:0.5','b:0']);
 h.hide(true);h.tick();expect(got).toHaveLength(2);
});
it('only notifies when a reading changed',()=>{
 const h=harness();let n=0,reading=emptyMeter();h.poll.subscribe(()=>n++,()=>({...reading,rms:[...reading.rms] as [number,number],peak:[...reading.peak] as [number,number]}));
 h.tick();h.tick();expect(n).toBe(1);reading={...reading,rms:[.1,0]};h.tick();expect(n).toBe(2);
});
