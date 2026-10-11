import {describe,expect,it} from 'vitest';
import {FxHost} from './host';
import type {FxDsp} from './types';
const gainStub=(latency=0,out=2):FxDsp=>({latency,reduction:3,setParams(){},clear(){},process(l,r,ol,or,n){for(let i=0;i<n;i++){ol[i]=l[i]!*out;or[i]=r[i]!*out;}}});
const sine=(n:number,a=.5)=>Float32Array.from({length:n},(_,i)=>a*Math.sin(i*.07));
function run(h:FxHost,l:Float32Array,r:Float32Array,block=128){const ol=new Float32Array(l.length),or=new Float32Array(l.length);for(let i=0;i<l.length;i+=block){const n=Math.min(block,l.length-i);h.process(l.subarray(i,i+n),r.subarray(i,i+n),ol.subarray(i,i+n),or.subarray(i,i+n),n);}return [ol,or] as const;}
describe('FxHost',()=>{
 it('passes the effect output when active',()=>{const h=new FxHost('limiter',44100,()=>gainStub());const x=sine(512);const [l]=run(h,x,x);expect(l[100]!).toBeCloseTo(x[100]!*2,6);expect(h.reduction).toBe(3);});
 it('bypass is bit-exact after the fade and crossfades without a jump',()=>{
  const h=new FxHost('limiter',44100,()=>gainStub());const x=sine(44100);h.set({},false,120);run(h,x.subarray(0,1000),x.subarray(0,1000));h.set({},true,120);const [l]=run(h,x,x);
  for(let i=1000;i<l.length;i++)expect(l[i]!).toBe(x[i]!);
  let max=0;for(let i=1;i<400;i++)max=Math.max(max,Math.abs(l[i]!-l[i-1]!));expect(max).toBeLessThan(.1);
 });
 it('delays the dry path by the latency while bypassed',()=>{
  const h=new FxHost('limiter',44100,()=>gainStub(40));h.set({},true,120);const x=sine(44100);const [l]=run(h,x,x);
  for(let i=5000;i<5100;i++)expect(l[i]!).toBe(x[i-40]!);expect(h.latency).toBe(40);expect(h.reduction).toBe(0);
 });
 it('starts bypassed without a fade when configured so',()=>{const h=new FxHost('limiter',44100,()=>gainStub());h.set({},true,120);const x=sine(256);const [l]=run(h,x,x);expect(Array.from(l)).toEqual(Array.from(x));});
 it('re-enabling clears the effect and returns to the wet path',()=>{
  let cleared=0;const stub=gainStub();stub.clear=()=>{cleared++;};const h=new FxHost('limiter',44100,()=>stub);const x=sine(20000);
  h.set({},true,120);run(h,x,x);const before=cleared;h.set({},false,120);const [l]=run(h,x,x);expect(cleared).toBeGreaterThan(before);expect(l[19999]!).toBeCloseTo(x[19999]!*2,6);
 });
 it('replaces non-finite input and output by silence',()=>{
  const h=new FxHost('limiter',44100,()=>gainStub());const x=new Float32Array(256).fill(NaN);const [l,r]=run(h,x,x);
  expect(l.every(Number.isFinite)&&r.every(Number.isFinite)).toBe(true);
  const bad=gainStub();bad.process=(l,r,ol,or,n)=>{ol.fill(Infinity,0,n);or.fill(NaN,0,n);};const h2=new FxHost('limiter',44100,()=>bad);const [a,b]=run(h2,sine(256),sine(256));
  expect(a.every(Number.isFinite)&&b.every(Number.isFinite)).toBe(true);
 });
 it('handles blocks longer than 128 frames',()=>{const h=new FxHost('limiter',44100,()=>gainStub());const x=sine(1000);const [l]=run(h,x,x,1000);expect(l[999]!).toBeCloseTo(x[999]!*2,6);});
});
