import {describe,expect,it} from 'vitest';
import {createChorus} from './chorus';
import {defaultFx} from './spec';
import type {FxDsp} from './types';

const base=(o:Record<string,number>)=>({...defaultFx('chorus'),...o});
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

describe('chorus',()=>{
 it('has zero latency and reduction',()=>{const fx=createChorus(SR);expect(fx.latency).toBe(0);expect(fx.reduction).toBe(0);});
 it('repeats its modulation with the LFO period',()=>{
  for(const rate of [1,2.5]){
   const fx=createChorus(SR);fx.setParams(base({rate,depth:100,mix:100}),120);
   const hop=1400,count=Math.ceil(SR*6/rate/hop),n=hop*count;
   const x=new Float32Array(n);for(let k=0;k<count;k++)x[k*hop]=1;
   const {ol}=run(fx,x,new Float32Array(n));
   const cen:number[]=[];
   for(let k=0;k<count;k++){let s=0,m=0;for(let j=0;j<hop;j++){const a=Math.abs(ol[k*hop+j]!);s+=a;m+=a*j;}cen.push(m/s);}
   const p=period(cen,hop);
   expect(Math.abs(p/(SR/rate)-1)).toBeLessThan(.02);
   expect(Math.max(...cen)-Math.min(...cen)).toBeGreaterThan(50);
  }
 });
 it('depth 0 is a static two-tap comb at the base delays',()=>{
  const fx=createChorus(SR);fx.setParams(base({depth:0,mix:50,rate:3}),120);
  const n=SR,x=new Float32Array(n);x[0]=1;x[20000]=1;
  const {ol}=run(fx,x,new Float32Array(n));
  expect(ol[0]!).toBeCloseTo(Math.SQRT1_2,6);
  let s=0,m=0;for(let j=1;j<1200;j++){const a=Math.abs(ol[j]!);s+=a;m+=a*j;}
  expect(s).toBeCloseTo(1,3);
  expect(m/s).toBeCloseTo((.013+.019)/2*SR,1);
  for(let j=0;j<1200;j++)expect(ol[20000+j]!).toBeCloseTo(ol[j]!,5);
 });
 it('keeps white-noise level within 1.5 dB at mix 50',()=>{
  for(const depth of [0,50,100]){
   const fx=createChorus(SR);fx.setParams(base({depth,mix:50}),120);
   const x=noise(SR*3,5);const {ol,or}=run(fx,x,noise(SR*3,6));
   expect(Math.abs(db(rms(ol,4000)/rms(x,4000)))).toBeLessThan(1.5);
   expect(Math.abs(db(rms(or,4000)/rms(x,4000)))).toBeLessThan(1.5);
  }
 });
 it('mix 0 is exactly dry',()=>{
  const fx=createChorus(SR);fx.setParams(base({mix:0,depth:100}),120);
  const x=noise(5000);const {ol,or}=run(fx,x,x);
  expect(Array.from(ol)).toEqual(Array.from(x));expect(Array.from(or)).toEqual(Array.from(x));
 });
 it('decorrelates the channels',()=>{
  const fx=createChorus(SR);fx.setParams(base({depth:100,mix:100}),120);
  const x=sine(SR,500);const {ol,or}=run(fx,x,x);
  let d=0;for(let i=5000;i<SR;i++)d=Math.max(d,Math.abs(ol[i]!-or[i]!));
  expect(d).toBeGreaterThan(.05);
 });
 it('is finite for silence, DC and full-scale noise',()=>{
  for(const x of [new Float32Array(20000),new Float32Array(20000).fill(1),noise(20000,9).map(v=>Math.sign(v))]){
   const fx=createChorus(SR);fx.setParams(base({depth:100,mix:100,rate:8}),120);
   const {ol,or}=run(fx,x,x);
   for(let i=0;i<ol.length;i++){expect(Number.isFinite(ol[i]!)).toBe(true);expect(Number.isFinite(or[i]!)).toBe(true);}
  }
 });
 it('makes no steps when parameters jump on a sine',()=>{
  const fx=createChorus(SR);fx.setParams(base({depth:0,mix:0,rate:.5}),120);
  const x=sine(40000,1000),z=new Float32Array(40000);
  const a=run(fx,x.subarray(0,20000),z.subarray(0,20000));
  fx.setParams(base({depth:100,mix:100,rate:8}),120);
  const b=run(fx,x.subarray(20000),z.subarray(20000));
  const all=new Float32Array(40000);all.set(a.ol);all.set(b.ol,20000);
  expect(maxStep(all)).toBeLessThan(.12);
 });
});
