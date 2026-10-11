import {describe,expect,it} from 'vitest';
import {createPhaser} from './phaser';
import {defaultFx} from './spec';
import type {FxDsp} from './types';

const base=(o:Record<string,number>)=>({...defaultFx('phaser'),feedback:0,mix:50,...o});
const SR=44100;
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
const rms=(a:Float32Array,from=0)=>{let s=0;for(let i=from;i<a.length;i++)s+=a[i]!*a[i]!;return Math.sqrt(s/(a.length-from));};
const db=(x:number)=>20*Math.log10(x);
/** Period in samples from the upward mid-level crossings of samples taken every `hop` samples. */
function period(v:number[],hop:number):number{
 const mid=(Math.max(...v)+Math.min(...v))/2,t:number[]=[];
 for(let i=1;i<v.length;i++)if(v[i-1]!<mid&&v[i]!>=mid)t.push((i-1+(mid-v[i-1]!)/(v[i]!-v[i-1]!))*hop);
 return (t[t.length-1]!-t[0]!)/(t.length-1);
}
/** Windowed RMS envelope of a signal, one value per `hop` samples. */
function envelope(x:Float32Array,win:number,hop:number,from:number):number[]{
 const e:number[]=[];
 for(let i=from;i+win<=x.length;i+=hop){let s=0;for(let j=0;j<win;j++)s+=x[i+j]!*x[i+j]!;e.push(Math.sqrt(s/win));}
 return e;
}
/** Magnitude of the DFT of `x` at `f` Hz. */
function mag(x:Float32Array,f:number):number{
 let re=0,im=0;const w=2*Math.PI*f/SR;
 for(let i=0;i<x.length;i++){re+=x[i]!*Math.cos(w*i);im-=x[i]!*Math.sin(w*i);}
 return Math.hypot(re,im);
}

describe('phaser',()=>{
 it('has zero latency and reduction',()=>{const fx=createPhaser(SR);expect(fx.latency).toBe(0);expect(fx.reduction).toBe(0);});
 it('shows stages/2 notches between DC and Nyquist at a fixed LFO phase',()=>{
  [0,1,2].forEach((stages,idx)=>{
   const fx=createPhaser(SR);fx.setParams(base({depth:0,stages}),120);
   const n=2048,{ol}=run(fx,impulse(n),new Float32Array(n));
   const m:number[]=[];for(let f=40;f<22000;f+=40)m.push(mag(ol,f));
   let notches=0;
   for(let k=1;k<m.length-1;k++)if(m[k]!<m[k-1]!&&m[k]!<m[k+1]!&&m[k]!<.35)notches++;
   expect(notches).toBe([4,6,8][idx]!/2);
  });
 });
 it('sweeps with the LFO period',()=>{
  for(const rate of [1,2]){
   const fx=createPhaser(SR);fx.setParams(base({rate,depth:100,stages:0}),120);
   const n=Math.round(SR*6/rate);
   const x=sine(n,60);const {ol}=run(fx,x,x);
   const e=envelope(ol,1470,256,0);
   expect(Math.max(...e)-Math.min(...e)).toBeGreaterThan(.1);
   expect(Math.abs(period(e,256)/(SR/rate)-1)).toBeLessThan(.02);
  }
 });
 it('mix 0 is exactly dry',()=>{
  const fx=createPhaser(SR);fx.setParams(base({mix:0,feedback:80,depth:100}),120);
  const x=noise(5000);const {ol,or}=run(fx,x,x);
  expect(Array.from(ol)).toEqual(Array.from(x));expect(Array.from(or)).toEqual(Array.from(x));
 });
 it('keeps white-noise level within 1.5 dB at mix 50',()=>{
  for(const stages of [0,1,2]){
   const fx=createPhaser(SR);fx.setParams(base({stages,depth:70}),120);
   const x=noise(SR*3,5);const {ol,or}=run(fx,x,noise(SR*3,6));
   expect(Math.abs(db(rms(ol,4000)/rms(x,4000)))).toBeLessThan(1.5);
   expect(Math.abs(db(rms(or,4000)/rms(x,4000)))).toBeLessThan(1.5);
  }
 });
 it('stays finite at 95 % feedback',()=>{
  for(const x of [new Float32Array(30000),new Float32Array(30000).fill(1),noise(SR*10,9).map(v=>Math.sign(v))]){
   const fx=createPhaser(SR);fx.setParams(base({feedback:95,depth:100,stages:2,mix:100,rate:10}),120);
   const {ol,or}=run(fx,x,x);
   let peak=0;
   expect(ol.every(Number.isFinite)&&or.every(Number.isFinite)).toBe(true);
   for(let i=0;i<ol.length;i++)peak=Math.max(peak,Math.abs(ol[i]!),Math.abs(or[i]!));
   expect(peak).toBeLessThan(50);
  }
 });
 it('makes no steps when parameters jump on a sine',()=>{
  const fx=createPhaser(SR);fx.setParams(base({depth:0,mix:0,rate:.5,stages:0}),120);
  const x=sine(40000,500),z=new Float32Array(40000);
  const a=run(fx,x.subarray(0,20000),z.subarray(0,20000));
  fx.setParams(base({depth:100,mix:100,rate:8,feedback:30,stages:2}),120);
  const b=run(fx,x.subarray(20000),z.subarray(20000));
  const all=new Float32Array(40000);all.set(a.ol);all.set(b.ol,20000);
  expect(maxStep(all)).toBeLessThan(.15);
 });
});
