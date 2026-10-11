import {describe,expect,it} from 'vitest';
import {createWidener} from './widener';
import {defaultFx} from './spec';

const SR=44100;
const P=(over:Record<string,number>={})=>({...defaultFx('widener'),...over});
const make=(over:Record<string,number>={})=>{
 const fx=createWidener(SR);
 fx.setParams(P(over),120);
 return fx;
};
function run(fx:ReturnType<typeof make>,l:Float32Array,r:Float32Array,bs=128){
 const n=l.length,ol=new Float32Array(n),or=new Float32Array(n);
 for(let i=0;i<n;i+=bs){
  const m=Math.min(bs,n-i);
  fx.process(l.subarray(i,i+m),r.subarray(i,i+m),ol.subarray(i,i+m),or.subarray(i,i+m),m);
 }
 return {l:ol,r:or};
}
const sine=(n:number,f:number,a=1,ph=0)=>Float32Array.from({length:n},(_,i)=>a*Math.sin(2*Math.PI*f*i/SR+ph));
const noise=(n:number,seed=1)=>{let s=seed;return Float32Array.from({length:n},()=>{s=(s*1664525+1013904223)>>>0;return s/2147483648-1;});};
const rms=(x:Float32Array,from=0)=>{let s=0;for(let i=from;i<x.length;i++)s+=x[i]!*x[i]!;return Math.sqrt(s/(x.length-from));};
const mid=(l:Float32Array,r:Float32Array)=>Float32Array.from(l,(v,i)=>(v+r[i]!)/2);
const side=(l:Float32Array,r:Float32Array)=>Float32Array.from(l,(v,i)=>(v-r[i]!)/2);

describe('widener',()=>{
 const l=noise(8192,3),r=noise(8192,9);
 it('has no latency or reduction',()=>{
  const fx=make();
  expect(fx.latency).toBe(0);
  expect(fx.reduction).toBe(0);
 });
 it('width 100 with bassMono 0 is bit-exact identity',()=>{
  const y=run(make({width:100,bassMono:0}),l,r);
  expect(Array.from(y.l)).toEqual(Array.from(l));
  expect(Array.from(y.r)).toEqual(Array.from(r));
 });
 it('behaves like the defaults before the first setParams',()=>{
  const fx=createWidener(SR);
  const y=run(fx as ReturnType<typeof make>,l,r);
  expect(Array.from(y.l)).toEqual(Array.from(l));
 });
 it('width 0 gives L==R==(L+R)/2',()=>{
  const y=run(make({width:0}),l,r),m=mid(l,r);
  for(let i=0;i<l.length;i++){
   expect(Math.abs(y.l[i]!-m[i]!)).toBeLessThan(1e-7);
   expect(Math.abs(y.r[i]!-m[i]!)).toBeLessThan(1e-7);
  }
 });
 it('width 200 doubles the side RMS',()=>{
  const y=run(make({width:200}),l,r);
  const ratio=rms(side(y.l,y.r))/rms(side(l,r));
  expect(ratio).toBeCloseTo(2,5);
 });
 it('keeps the mono sum for every width',()=>{
  const m=mid(l,r);
  for(const w of [0,37,100,150,200]){
   const y=run(make({width:w}),l,r),mo=mid(y.l,y.r);
   for(let i=0;i<m.length;i++)expect(Math.abs(mo[i]!-m[i]!)).toBeLessThan(1e-6);
  }
 });
 it('bassMono 200 attenuates out-of-phase 50 Hz by at least 20 dB and passes 2 kHz',()=>{
  const n=SR/2;
  const lo=run(make({width:100,bassMono:200}),sine(n,50),sine(n,50,1,Math.PI));
  const hi=run(make({width:100,bassMono:200}),sine(n,2000),sine(n,2000,1,Math.PI));
  const inLo=rms(sine(n,50),n/2),outLo=rms(lo.l,n/2),outHi=rms(hi.l,n/2),inHi=rms(sine(n,2000),n/2);
  expect(20*Math.log10(outLo/inLo)).toBeLessThan(-20);
  expect(Math.abs(20*Math.log10(outHi/inHi))).toBeLessThan(.5);
  // the mono (in-phase) bass is untouched
  const mono=run(make({width:100,bassMono:200}),sine(n,50),sine(n,50));
  for(let i=0;i<n;i+=97)expect(mono.l[i]!).toBeCloseTo(sine(1,0)[0]!+Math.sin(2*Math.PI*50*i/SR),5);
 });
 it('width changes ramp without clicks',()=>{
  const x=sine(8192,300,.8),y2=sine(8192,300,.8,1.2),fx=make({width:0});
  const h=(v:Float32Array,i:number)=>v.subarray(i*4096,(i+1)*4096);
  const a=run(fx,h(x,0),h(y2,0));
  fx.setParams(P({width:200}),120);
  const b=run(fx,h(x,1),h(y2,1));
  const ref=run(make({width:200}),x,y2).l;
  const step=(v:Float32Array)=>{let s=0;for(let i=1;i<v.length;i++)s=Math.max(s,Math.abs(v[i]!-v[i-1]!));return s;};
  const all=Float32Array.from([...a.l,...b.l]);
  expect(step(all)).toBeLessThan(1.2*step(ref));
 });
 it('width 100 after a change returns to exact identity',()=>{
  const fx=make({width:150});
  run(fx,l.subarray(0,512),r.subarray(0,512));
  fx.setParams(P({width:100}),120);
  run(fx,l.subarray(0,256),r.subarray(0,256));
  const y=run(fx,l.subarray(0,256),r.subarray(0,256));
  expect(Array.from(y.l)).toEqual(Array.from(l.subarray(0,256)));
 });
 it('is finite for silence, DC and loud noise',()=>{
  for(const x of [new Float32Array(1000),new Float32Array(1000).fill(1),Float32Array.from(noise(1000),v=>v*4)]){
   const y=run(make({width:200,bassMono:300}),x,Float32Array.from(x).reverse());
   for(const v of y.l)expect(Number.isFinite(v)).toBe(true);
   for(const v of y.r)expect(Number.isFinite(v)).toBe(true);
  }
 });
});
