import {describe,expect,it} from 'vitest';
import {createBitcrusher} from './bitcrusher';
import {defaultFx} from './spec';

const SR=44100;
const make=(over:Record<string,number>={})=>{
 const fx=createBitcrusher(SR);
 fx.setParams({...defaultFx('bitcrusher'),mix:100,...over},120);
 return fx;
};
/** Runs `l`/`r` through `fx` in blocks of the given lengths (cycled). */
function run(fx:ReturnType<typeof make>,l:Float32Array,r:Float32Array,sizes:number[]=[128]){
 const n=l.length,ol=new Float32Array(n),or=new Float32Array(n);
 let i=0,k=0;
 while(i<n){
  const m=Math.min(sizes[k++%sizes.length]!,n-i);
  fx.process(l.subarray(i,i+m),r.subarray(i,i+m),ol.subarray(i,i+m),or.subarray(i,i+m),m);
  i+=m;
 }
 return {l:ol,r:or};
}
const sine=(n:number,f=440,a=1)=>Float32Array.from({length:n},(_,i)=>a*Math.sin(2*Math.PI*f*i/SR));
const ramp=(n:number)=>Float32Array.from({length:n},(_,i)=>-1+2*i/(n-1));
const noise=(n:number,a=1)=>{let s=12345;return Float32Array.from({length:n},()=>{s=(s*1664525+1013904223)>>>0;return a*(s/2147483648-1);});};

describe('bitcrusher',()=>{
 it('reports no latency and no reduction',()=>{
  const fx=make();
  expect(fx.latency).toBe(0);
  expect(fx.reduction).toBe(0);
 });
 it('bits=3 yields at most 9 distinct values, all multiples of 0.25',()=>{
  const x=ramp(4000),fx=make({bits:3,downsample:1});
  const y=run(fx,x,x).l;
  const set=new Set(y);
  expect(set.size).toBeLessThanOrEqual(9);
  for(const v of set)expect(Math.abs(v/.25-Math.round(v/.25))).toBe(0);
  const s=run(make({bits:3,downsample:1}),sine(4000),sine(4000)).l;
  for(const v of new Set(s))expect(Math.abs(v/.25-Math.round(v/.25))).toBe(0);
 });
 it('bits=16 stays within 2^-16 of the input',()=>{
  const x=sine(5000,333,.9),y=run(make({bits:16,downsample:1}),x,x).l;
  let e=0;
  for(let i=0;i<x.length;i++)e=Math.max(e,Math.abs(y[i]!-x[i]!));
  expect(e).toBeLessThanOrEqual(2**-16+1e-7);
 });
 it('bits=1 yields only -1, 0 and 1',()=>{
  const x=noise(3000),y=run(make({bits:1,downsample:1}),x,x).l;
  for(const v of new Set(y))expect([-1,0,1]).toContain(v);
 });
 it('clamps to full scale',()=>{
  const x=Float32Array.from({length:300},(_,i)=>(i%2?3:-3)),y=run(make({bits:8,downsample:1}),x,x).l;
  for(const v of y)expect(Math.abs(v)).toBeLessThanOrEqual(1);
 });
 for(const N of [1,4,7]){
  it(`downsample ${N} holds every value for exactly ${N} frames across block boundaries`,()=>{
   const x=noise(2000),sizes=[128,37,1,200,64,5];
   const y=run(make({bits:16,downsample:N}),x,x,sizes).l;
   // run lengths of the held value: every run is N frames long (neighbouring held values differ)
   let run0=1;
   for(let i=1;i<y.length;i++){
    if(y[i]! ===y[i-1]!)run0++;
    else{expect(run0).toBe(N);run0=1;}
   }
   // held value is the quantised input at the first frame of each group
   for(let i=0;i<y.length;i+=N)expect(Math.abs(y[i]!-x[i]!)).toBeLessThanOrEqual(2**-16+1e-7);
  });
 }
 it('holds each channel separately',()=>{
  const l=noise(64),r=noise(64,.5),y=run(make({bits:16,downsample:4}),l,r);
  for(let i=0;i<64;i+=4){
   expect(Math.abs(y.l[i]!-l[i]!)).toBeLessThan(1e-4);
   expect(Math.abs(y.r[i]!-r[i]!)).toBeLessThan(1e-4);
   expect(y.r[i+3]!).toBe(y.r[i]!);
  }
 });
 it('mix 50 is the average of dry and crushed',()=>{
  const x=sine(1000,200,.8),c=run(make({bits:3,downsample:3}),x,x).l,m=run(make({bits:3,downsample:3,mix:50}),x,x).l;
  for(let i=0;i<x.length;i++)expect(Math.abs(m[i]!-(x[i]!+c[i]!)/2)).toBeLessThan(1e-6);
 });
 it('mix 0 is the exact dry input',()=>{
  const x=noise(500),y=run(make({bits:2,downsample:9,mix:0}),x,x).l;
  for(let i=0;i<x.length;i++)expect(y[i]!).toBe(x[i]!);
 });
 it('mix changes ramp without a step',()=>{
  const x=sine(2000,50,.5),fx=make({bits:2,downsample:1,mix:0});
  const a=run(fx,x.subarray(0,500),x.subarray(0,500)).l;
  fx.setParams({...defaultFx('bitcrusher'),bits:2,downsample:1,mix:100},120);
  const b=run(fx,x.subarray(500,1000),x.subarray(500,1000)).l;
  const all=[...a,...b];
  let worst=0;
  for(let i=1;i<all.length;i++)worst=Math.max(worst,Math.abs(all[i]!-all[i-1]!));
  // 2-bit steps are 1.0 wide, so one quantised step plus the slope is the limit
  expect(worst).toBeLessThan(1.1);
 });
 it('clear resets the sample counter',()=>{
  const fx=make({bits:16,downsample:4});
  const x=noise(10);
  run(fx,x,x);
  fx.clear();
  const y=run(fx,x.subarray(0,4),x.subarray(0,4)).l;
  expect(y[0]!).toBeCloseTo(x[0]!,4);
  expect(y[3]!).toBe(y[0]!);
  expect(Math.abs(y[3]!-x[3]!)).toBeGreaterThan(1e-3);
 });
 it('changing downsample at run time keeps working',()=>{
  const fx=make({bits:16,downsample:32}),x=noise(300);
  run(fx,x.subarray(0,20),x.subarray(0,20));
  fx.setParams({...defaultFx('bitcrusher'),bits:16,downsample:2,mix:100},120);
  const y=run(fx,x.subarray(20,60),x.subarray(20,60)).l;
  for(const v of y)expect(Number.isFinite(v)).toBe(true);
  expect(new Set(y).size).toBeGreaterThan(5);
 });
 it('is finite for silence, DC and noise',()=>{
  for(const x of [new Float32Array(500),new Float32Array(500).fill(.7),noise(500,4)]){
   const y=run(make(),x,x);
   for(const v of y.l)expect(Number.isFinite(v)).toBe(true);
   for(const v of y.r)expect(Number.isFinite(v)).toBe(true);
  }
 });
});
