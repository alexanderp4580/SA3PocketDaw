import {describe,expect,it} from 'vitest';
import {createDelay} from './delay';
import {defaultFx,noteValues} from './spec';
import type {FxDsp} from './types';

const SR=44100;
const base=(o:Record<string,number>)=>({...defaultFx('delay'),sync:0,time:100,feedback:0,tone:20000,pingpong:0,mix:50,...o});
const sync=(label:string)=>noteValues.findIndex(n=>n.label===label)+1;
function run(fx:FxDsp,l:Float32Array,r:Float32Array,bs=128){
 const ol=new Float32Array(l.length),or=new Float32Array(l.length);
 for(let i=0;i<l.length;i+=bs){
  const n=Math.min(bs,l.length-i);
  fx.process(l.subarray(i,i+n),r.subarray(i,i+n),ol.subarray(i,i+n),or.subarray(i,i+n),n);
 }
 return {ol,or};
}
const impulse=(n:number,at=0)=>{const a=new Float32Array(n);a[at]=1;return a;};
const noise=(n:number,seed=1)=>{const a=new Float32Array(n);let s=seed;for(let i=0;i<n;i++){s=(s*1664525+1013904223)>>>0;a[i]=s/2147483648-1;}return a;};
const sine=(n:number,f:number,amp=.5)=>Float32Array.from({length:n},(_,i)=>amp*Math.sin(2*Math.PI*f*i/SR));
const maxStep=(a:Float32Array)=>{let m=0;for(let i=1;i<a.length;i++)m=Math.max(m,Math.abs(a[i]!-a[i-1]!));return m;};

describe('delay',()=>{
 const cases:Array<[string,Record<string,number>,number,number]>=[
  ['free 100 ms',{sync:0,time:100},120,4410],
  ['1/4 at 120 bpm',{sync:sync('1/4')},120,22050],
  ['1/8. at 90 bpm',{sync:sync('1/8.')},90,22050],
  ['1/4T at 140 bpm',{sync:sync('1/4T')},140,12600]
 ];
 for(const [name,o,bpm,delay] of cases){
  it(`places an impulse exactly at the delay: ${name}`,()=>{
   const fx=createDelay(SR);fx.setParams(base(o),bpm);
   const {ol}=run(fx,impulse(delay+500),new Float32Array(delay+500));
   expect(ol[0]!).toBeCloseTo(1,9);
   expect(ol[delay]!).toBeCloseTo(.5,6);
   let others=0;for(let i=1;i<ol.length;i++)if(i!==delay)others=Math.max(others,Math.abs(ol[i]!));
   expect(others).toBeLessThan(1e-6);
  });
 }
 it('has zero latency and reduction',()=>{const fx=createDelay(SR);expect(fx.latency).toBe(0);expect(fx.reduction).toBe(0);});
 it('mix 0 is the dry input',()=>{
  const fx=createDelay(SR);fx.setParams(base({mix:0,feedback:50}),120);
  const x=noise(5000);const {ol}=run(fx,x,x);
  expect(Array.from(ol)).toEqual(Array.from(x));
 });
 it('feedback 50 % decays by half per repeat',()=>{
  const fx=createDelay(SR);fx.setParams(base({feedback:50,mix:100}),120);
  const {ol}=run(fx,impulse(4410*5),new Float32Array(4410*5));
  for(let k=1;k<=4;k++)expect(ol[4410*k]!/Math.pow(.5,k-1)).toBeGreaterThan(.98);
  for(let k=1;k<=4;k++)expect(ol[4410*k]!/Math.pow(.5,k-1)).toBeLessThan(1.02);
 });
 it('ping-pong alternates channels starting left',()=>{
  const fx=createDelay(SR);fx.setParams(base({feedback:80,mix:100,pingpong:1}),120);
  const L=impulse(4410*5),R=new Float32Array(4410*5);
  const {ol,or}=run(fx,L,R);
  expect(ol[4410]!).toBeCloseTo(.5,6);expect(or[4410]!).toBeCloseTo(0,9);
  expect(or[8820]!).toBeCloseTo(.4,6);expect(ol[8820]!).toBeCloseTo(0,9);
  expect(ol[13230]!).toBeCloseTo(.32,6);expect(or[13230]!).toBeCloseTo(0,9);
 });
 it('sums the input to mono for ping-pong',()=>{
  const fx=createDelay(SR);fx.setParams(base({feedback:0,mix:100,pingpong:1}),120);
  const {ol,or}=run(fx,impulse(6000),impulse(6000));
  expect(ol[4410]!).toBeCloseTo(1,6);expect(or[4410]!).toBeCloseTo(0,9);
 });
 it('tone filter darkens repeats',()=>{
  const hf=(x:Float32Array,a:number,b:number)=>{let d=0,e=0;for(let i=a+1;i<b;i++){d+=(x[i]!-x[i-1]!)**2;e+=x[i]!**2;}return d/e;};
  const n=4410*3,x=new Float32Array(n);x.set(noise(1000));
  const ratio=(tone:number)=>{
   const fx=createDelay(SR);fx.setParams(base({feedback:50,mix:100,tone}),120);
   const {ol}=run(fx,x,new Float32Array(n));
   return hf(ol,8820,9820)/hf(ol,4410,5410);
  };
  expect(ratio(20000)).toBeGreaterThan(.9);
  expect(ratio(500)).toBeLessThan(.2);
 });
 it('stays finite at 95 % feedback over 30 s and decays when the input stops',()=>{
  const fx=createDelay(SR);fx.setParams(base({feedback:95,mix:100,pingpong:1,tone:2000}),120);
  const n=SR*30;
  const on=run(fx,noise(n,3),noise(n,4));
  let peak=0;for(const v of on.ol)peak=Math.max(peak,Math.abs(v));
  expect(Number.isFinite(peak)).toBe(true);expect(peak).toBeLessThan(50);
  const off=run(fx,new Float32Array(n),new Float32Array(n));
  let tail=0;for(let i=n-1000;i<n;i++)tail=Math.max(tail,Math.abs(off.ol[i]!),Math.abs(off.or[i]!));
  expect(tail).toBeLessThan(1e-4);
 });
 it('is finite for silence and DC',()=>{
  for(const v of [0,1]){
   const fx=createDelay(SR);fx.setParams(base({feedback:95,mix:100}),120);
   const {ol}=run(fx,new Float32Array(20000).fill(v),new Float32Array(20000).fill(v));
   for(const s of ol)expect(Number.isFinite(s)).toBe(true);
  }
 });
 it('holds the longest synced delay at the tempo floor',()=>{
  const fx=createDelay(SR);fx.setParams(base({sync:sync('1/1')}),20);
  const n=SR*12+300,{ol}=run(fx,impulse(n),new Float32Array(n));
  expect(ol[SR*12]!).toBeCloseTo(.5,6);
 });
 it('follows a bpm change to the new echo position',()=>{
  const fx=createDelay(SR);const p=base({sync:sync('1/4')});
  fx.setParams(p,120);run(fx,new Float32Array(SR),new Float32Array(SR));
  fx.setParams(p,60);run(fx,new Float32Array(SR*2),new Float32Array(SR*2));
  const n=44100+300,{ol}=run(fx,impulse(n),new Float32Array(n));
  expect(ol[44100]!).toBeCloseTo(.5,3);
 });
 it('makes no steps when parameters jump on a sine',()=>{
  const fx=createDelay(SR);fx.setParams(base({time:100,mix:0,feedback:50,tone:8000}),120);
  const x=sine(SR,440),z=new Float32Array(SR);
  const a=run(fx,x.subarray(0,20000),z.subarray(0,20000));
  fx.setParams(base({time:300,mix:100,feedback:90,tone:600}),120);
  const b=run(fx,x.subarray(20000,40000),z.subarray(20000,40000));
  const all=new Float32Array(40000);all.set(a.ol);all.set(b.ol,20000);
  expect(maxStep(all)).toBeLessThan(.12);
 });
});
it('plays the whole-note echo at six seconds at 40 BPM',()=>{
 const fx=createDelay(SR);fx.setParams({...defaultFx('delay'),sync:1,feedback:0,tone:20000,mix:100},40);
 const x=impulse(SR*6+256),{ol}=run(fx,x,new Float32Array(x.length));
 expect(ol[SR*2]).toBe(0);expect(ol[SR*6]).toBeCloseTo(1,6);
});
