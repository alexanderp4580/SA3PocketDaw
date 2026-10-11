import {describe,expect,it} from 'vitest';
import {createLatestRunner} from './latestRunner';

const gate=()=>{let open!:()=>void;const p=new Promise<void>(r=>{open=r;});return {p,open};};
describe('createLatestRunner',()=>{
 it('runs one job at a time and only the latest queued value afterwards',async()=>{
  const g=gate(),seen:number[]=[],states:boolean[]=[];
  const run=createLatestRunner<number>(async v=>{seen.push(v);if(v===1)await g.p;},{onBusy:b=>states.push(b),onError:()=>{}});
  run(1);run(2);run(3);
  expect(seen).toEqual([1]);g.open();await new Promise(r=>setTimeout(r,0));
  expect(seen).toEqual([1,3]);expect(states.at(-1)).toBe(false);
 });
 it('reports a failure and keeps running later values',async()=>{
  const errors:string[]=[],seen:number[]=[];
  const run=createLatestRunner<number>(async v=>{seen.push(v);if(v===1)throw new Error('bad');},{onBusy:()=>{},onError:e=>errors.push(e.message)});
  run(1);await new Promise(r=>setTimeout(r,0));run(2);await new Promise(r=>setTimeout(r,0));
  expect(errors).toEqual(['bad']);expect(seen).toEqual([1,2]);
 });
});
