import {describe,expect,it} from 'vitest';
import {createLimiter} from './limiter';
import {defaultFx} from './spec';

const SR=44100;
const mk=(p:Record<string,number>={})=>{const d=createLimiter(SR);d.setParams({...defaultFx('limiter'),...p},120);return d;};
/** Runs the effect over a mono signal in 128-frame blocks (same signal on both channels). */
function run(d:ReturnType<typeof createLimiter>,x:Float32Array,block=128){
 const out=new Float32Array(x.length),ol=new Float32Array(block),or=new Float32Array(block);
 let maxRed=0;
 for(let i=0;i<x.length;i+=block){
  const n=Math.min(block,x.length-i),b=x.subarray(i,i+n);
  d.process(b,b,ol,or,n);out.set(ol.subarray(0,n),i);maxRed=Math.max(maxRed,d.reduction);
 }
 return {out,maxRed};
}
const sine=(len:number,amp:number,hz=440)=>Float32Array.from({length:len},(_,i)=>amp*Math.sin(2*Math.PI*hz*i/SR));
const dc=(len:number,v:number)=>new Float32Array(len).fill(v);
function noise(len:number,amp:number){let s=12345;return Float32Array.from({length:len},()=>{s=(s*1664525+1013904223)>>>0;return amp*(s/2147483648-1);});}
const ceilLin=(db:number)=>Math.pow(10,db/20);

describe('limiter',()=>{
 it('reports the look-ahead as latency',()=>{expect(createLimiter(SR).latency).toBe(Math.round(0.003*SR)-1);});
 it('never exceeds the ceiling on a +12 dB sine',()=>{
  const {out}=run(mk({threshold:-12,ceiling:-6}),sine(SR*2,4));
  let peak=0;for(const v of out)peak=Math.max(peak,Math.abs(v));
  expect(peak).toBeLessThanOrEqual(ceilLin(-6)*(1+1e-6));
  expect(peak).toBeGreaterThan(ceilLin(-6)*0.8);
 });
 it('never exceeds the ceiling on a full-scale burst after silence',()=>{
  const x=new Float32Array(SR*2);x.set(noise(SR/4,1),SR/2);x.set(dc(SR/4,1),SR);
  const {out}=run(mk({threshold:-12,ceiling:-6}),x);
  let peak=0;for(const v of out)peak=Math.max(peak,Math.abs(v));
  expect(peak).toBeLessThanOrEqual(ceilLin(-6)*(1+1e-6));
 });
 it('passes a signal below the threshold unchanged after the latency',()=>{
  const d=mk({threshold:-6,ceiling:-6}),x=sine(SR,0.1);
  const {out,maxRed}=run(d,x);
  for(let i=1000;i<x.length-d.latency;i++)expect(Math.abs(out[i+d.latency]!-x[i]!)).toBeLessThan(1e-6);
  expect(maxRed).toBe(0);
 });
 it('recovers with the one-pole release time',()=>{
  const release=100,B=SR/2,x=new Float32Array(SR*2);
  x.fill(2,0,B);x.fill(0.1,B);
  const d=mk({threshold:-6,ceiling:-6,release});
  const {out}=run(d,x),N=d.latency+1,r0=ceilLin(-6)/2;
  const T=Math.round(0.1*SR),n=B+N-1+T,gain=out[n]!/0.1;
  const tau=release/1000*SR,pred=(1-r0)*Math.exp(-(T-N/2)/tau);
  expect(Math.abs((1-gain)-pred)/pred).toBeLessThan(0.1);
  const T2=Math.round(0.25*SR),g2=out[B+N-1+T2]!/0.1,pred2=(1-r0)*Math.exp(-(T2-N/2)/tau);
  expect(Math.abs((1-g2)-pred2)/pred2).toBeLessThan(0.1);
 });
 it('meters the reduction in dB on a constant overshoot',()=>{
  const d=mk({threshold:-6,ceiling:-6});
  run(d,dc(SR/2,2));
  expect(d.reduction).toBeCloseTo(-20*Math.log10(ceilLin(-6)/2),1);
 });
 it('clear empties the look-ahead and the gain state',()=>{
  const d=mk({threshold:-6,ceiling:-6});
  run(d,dc(SR/4,2));
  d.clear();
  const {out}=run(d,dc(2000,0.1));
  for(let i=0;i<d.latency;i++)expect(out[i]!).toBe(0);
  expect(out[d.latency+10]!).toBeCloseTo(0.1,5);
 });
 it('has no steps when parameters jump',()=>{
  const d=mk(),x=sine(128*340,0.8),out=new Float32Array(x.length),ol=new Float32Array(128),or=new Float32Array(128);
  for(let i=0,k=0;i+128<=x.length;i+=128,k++){
   d.setParams({...defaultFx('limiter'),...(k%10<5?{threshold:-24,ceiling:-12}:{threshold:0,ceiling:-0.3,release:20})},120);
   d.process(x.subarray(i,i+128),x.subarray(i,i+128),ol,or,128);out.set(ol,i);
  }
  let step=0;for(let i=1;i<out.length;i++)step=Math.max(step,Math.abs(out[i]!-out[i-1]!));
  expect(step).toBeLessThan(0.1);
 });
 it('stays finite on silence, DC and full-scale noise',()=>{
  const d=mk({threshold:-24,ceiling:-12});
  for(const x of [new Float32Array(5000),dc(5000,1),noise(5000,1)]){
   const {out}=run(d,x);
   for(const v of out)expect(Number.isFinite(v)).toBe(true);
  }
 });
});
it('starts with the same gain history as after clear',()=>{
 const x=new Float32Array(512).fill(.2);x[100]=2;
 const fresh=mk({threshold:-6,ceiling:-6}),cleared=mk({threshold:-6,ceiling:-6});cleared.clear();
 expect(run(fresh,x).out).toEqual(run(cleared,x).out);
});
