import {describe,expect,it} from 'vitest';
import {createFilter} from './filter';
import {defaultFx,filterSweepBeats} from './spec';

const SR=44100;
const P=(over:Record<string,number>={})=>({...defaultFx('filter'),type:0,resonance:0,sweep:0,depth:0,mix:100,...over});
const make=(over:Record<string,number>={},bpm=120)=>{
 const fx=createFilter(SR);
 fx.setParams(P(over),bpm);
 return fx;
};
function run(fx:ReturnType<typeof make>,x:Float32Array,bs=128){
 const n=x.length,o=new Float32Array(n),o2=new Float32Array(n);
 for(let i=0;i<n;i+=bs){
  const m=Math.min(bs,n-i);
  fx.process(x.subarray(i,i+m),x.subarray(i,i+m),o.subarray(i,i+m),o2.subarray(i,i+m),m);
 }
 return o;
}
const sine=(n:number,f:number,a=1)=>Float32Array.from({length:n},(_,i)=>a*Math.sin(2*Math.PI*f*i/SR));
const noise=(n:number,a=1,seed=5)=>{let s=seed;return Float32Array.from({length:n},()=>{s=(s*1664525+1013904223)>>>0;return a*(s/2147483648-1);});};
/** Steady-state gain at `f` from the second half of a sine run (parameters held constant). */
function gainAt(over:Record<string,number>,f:number){
 const n=SR,x=sine(n,f),y=run(make(over),x);
 let a=0,b=0;
 for(let i=n/2;i<n;i++){a+=x[i]!*x[i]!;b+=y[i]!*y[i]!;}
 return Math.sqrt(b/a);
}
const hz=(f:number)=>f;

describe('filter',()=>{
 it('has no latency or reduction',()=>{
  const fx=make();
  expect(fx.latency).toBe(0);
  expect(fx.reduction).toBe(0);
 });
 for(const fc of [200,1000,8000]){
  it(`low-pass and high-pass are -3 dB at ${fc} Hz cutoff`,()=>{
   const r=Math.SQRT1_2;
   expect(gainAt({type:0,cutoff:fc},hz(fc*.95))).toBeGreaterThan(r);
   expect(gainAt({type:0,cutoff:fc},hz(fc*1.05))).toBeLessThan(r);
   expect(gainAt({type:0,cutoff:fc},hz(fc))).toBeGreaterThan(r*.97);
   expect(gainAt({type:0,cutoff:fc},hz(fc))).toBeLessThan(r*1.03);
   expect(gainAt({type:1,cutoff:fc},hz(fc*1.05))).toBeGreaterThan(r);
   expect(gainAt({type:1,cutoff:fc},hz(fc*.95))).toBeLessThan(r);
  });
 }
 it('low-pass passes lows and blocks highs; high-pass the reverse',()=>{
  expect(gainAt({type:0,cutoff:1000},50)).toBeGreaterThan(.99);
  expect(gainAt({type:0,cutoff:1000},8000)).toBeLessThan(.03);
  expect(gainAt({type:1,cutoff:1000},8000)).toBeGreaterThan(.97);
  expect(gainAt({type:1,cutoff:1000},50)).toBeLessThan(.01);
 });
 it('band-pass has unity gain at the cutoff and rejects far frequencies',()=>{
  for(const fc of [300,2000]){
   const g=gainAt({type:2,cutoff:fc},fc);
   expect(Math.abs(20*Math.log10(g))).toBeLessThan(.5);
   expect(gainAt({type:2,cutoff:fc},fc*8)).toBeLessThan(.3);
   expect(gainAt({type:2,cutoff:fc},fc/8)).toBeLessThan(.3);
  }
 });
 it('resonance raises the low-pass peak at the cutoff by about Q',()=>{
  const q=(res:number)=>.7071*(20/.7071)**(res/100);
  for(const res of [50,100]){
   const g=gainAt({type:0,cutoff:1000,resonance:res},1000);
   expect(Math.abs(20*Math.log10(g/q(res)))).toBeLessThan(.5);
  }
  expect(gainAt({type:2,cutoff:1000,resonance:100},1000)).toBeCloseTo(1,1);
 });
 it('mix 0 is the exact dry input and mix 50 the average',()=>{
  const x=noise(2000),dry=run(make({mix:0,cutoff:300}),x),wet=run(make({mix:100,cutoff:300}),x),half=run(make({mix:50,cutoff:300}),x);
  for(let i=0;i<x.length;i++){
   expect(dry[i]!).toBe(x[i]!);
   expect(Math.abs(half[i]!-(x[i]!+wet[i]!)/2)).toBeLessThan(1e-6);
  }
 });
 /** Mean-crossing period of the 10 ms RMS envelope of `y`, in seconds. */
 function envelopePeriod(y:Float32Array,from:number){
  const w=441,env:number[]=[];
  for(let i=from;i+w<=y.length;i+=w){let s=0;for(let k=0;k<w;k++)s+=y[i+k]!*y[i+k]!;env.push(Math.sqrt(s/w));}
  const mean=env.reduce((a,b)=>a+b,0)/env.length,ups:number[]=[];
  for(let i=1;i<env.length;i++)if(env[i-1]!<mean&&env[i]!>=mean)ups.push(i-1+(mean-env[i-1]!)/(env[i]!-env[i-1]!));
  expect(ups.length).toBeGreaterThan(2);
  return (ups[ups.length-1]!-ups[0]!)/(ups.length-1)*w/SR;
 }
 it('free LFO period equals 1/rate',()=>{
  for(const rate of [.8,2]){
   const n=Math.round(SR*6),x=sine(n,1000);
   const y=run(make({type:0,cutoff:1000,sweep:1,rate,depth:60}),x);
   expect(Math.abs(envelopePeriod(y,4410)*rate-1)).toBeLessThan(.02);
  }
 });
 it('tempo sweep lasts the note length at the given bpm',()=>{
  for(const [note,bpm] of [[2,240],[3,120],[5,60]] as const){
   const beats=filterSweepBeats[note]!,expected=beats*60/bpm;
   const n=Math.round(SR*Math.max(5,expected*5)),x=sine(n,1000);
   const y=run(make({type:0,cutoff:1000,sweep:2,note,rate:7,depth:60},bpm),x);
   expect(Math.abs(envelopePeriod(y,4410)/expected-1)).toBeLessThan(.02);
  }
 });
 it('sweep depth 0 does not modulate',()=>{
  const x=sine(SR,1000),a=run(make({cutoff:1000,sweep:1,rate:3,depth:0}),x),b=run(make({cutoff:1000,sweep:0}),x);
  for(let i=0;i<x.length;i+=13)expect(Math.abs(a[i]!-b[i]!)).toBeLessThan(1e-5);
 });
 it('switching type does not click',()=>{
  const x=sine(8192,300,.8),fx=make({type:0,cutoff:300}),a=run(fx,x.subarray(0,4096));
  fx.setParams(P({type:1,cutoff:300}),120);
  const b=run(fx,x.subarray(4096));
  const all=Float32Array.from([...a,...b]);
  const ref=run(make({type:1,cutoff:300}),x);
  const step=(v:Float32Array,from=0)=>{let s=0;for(let i=from+1;i<v.length;i++)s=Math.max(s,Math.abs(v[i]!-v[i-1]!));return s;};
  expect(step(all)).toBeLessThan(step(ref,512)*1.5+.02);
 });
 it('cutoff and resonance jumps do not click on a sine',()=>{
  const x=sine(12000,200,.5),fx=make({cutoff:8000,resonance:0}),a=run(fx,x.subarray(0,6000));
  fx.setParams(P({cutoff:300,resonance:60}),120);
  const b=run(fx,x.subarray(6000));
  const all=Float32Array.from([...a,...b]);
  let s=0;
  for(let i=1;i<all.length;i++)s=Math.max(s,Math.abs(all[i]!-all[i-1]!));
  // a 200 Hz sine of 0.5 moves at most 0.036 per sample; resonance peaking adds some headroom
  expect(s).toBeLessThan(.2);
 });
 it('stays finite and bounded on noise at resonance 100 % with a fast sweep at 20 kHz cutoff',()=>{
  const x=noise(SR*2,1);
  for(const type of [0,1,2])for(const sweep of [1,2]){
   const y=run(make({type,cutoff:20000,resonance:100,sweep,rate:10,note:5,depth:100},240),x);
   expect(y.every(Number.isFinite)).toBe(true);
   let peak=0;for(const v of y)peak=Math.max(peak,Math.abs(v));
   expect(peak).toBeLessThan(100);
  }
 });
 it('is finite for silence and DC',()=>{
  for(const x of [new Float32Array(1000),new Float32Array(1000).fill(1)]){
   const y=run(make({resonance:100,sweep:1,depth:100}),x);
   for(const v of y)expect(Number.isFinite(v)).toBe(true);
  }
 });
 it('clear empties the state',()=>{
  const fx=make({resonance:90,cutoff:500});
  run(fx,noise(2000));
  fx.clear();
  for(const v of run(fx,new Float32Array(256)))expect(v).toBe(0);
 });
});
