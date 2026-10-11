import {describe,expect,it} from 'vitest';
import {FxHost} from './host';
import {defaultFx,fxKinds,fxSpecs,normalizeFx,type FxKind} from './spec';
import {fxFactories} from './registry';
const SR=44100;
let seed=12345;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2147483648-1;};
const signals:Record<string,(n:number)=>Float32Array>={
 silence:n=>new Float32Array(n),dc:n=>new Float32Array(n).fill(.7),noise:n=>Float32Array.from({length:n},()=>rnd()),
 fullScale:n=>Float32Array.from({length:n},(_,i)=>(i>>5)%2?1:-1),sine:n=>Float32Array.from({length:n},(_,i)=>.8*Math.sin(2*Math.PI*440*i/SR))
};
function run(h:FxHost,l:Float32Array,r:Float32Array){const ol=new Float32Array(l.length),or=new Float32Array(l.length);for(let i=0;i<l.length;i+=128){const n=Math.min(128,l.length-i);h.process(l.subarray(i,i+n),r.subarray(i,i+n),ol.subarray(i,i+n),or.subarray(i,i+n),n);}return [ol,or] as const;}
const extremes=(kind:FxKind)=>{const s=fxSpecs[kind]!.params,lo:Record<string,number>={},hi:Record<string,number>={};for(const p of s){lo[p.id]=p.min;hi[p.id]=p.max;}return [defaultFx(kind),lo,hi];};
describe.each(fxKinds)('%s',kind=>{
 it('reports non-negative latency and creates through the registry',()=>{const d=fxFactories[kind]!(SR);expect(d.latency).toBeGreaterThanOrEqual(0);expect(Number.isInteger(d.latency)).toBe(true);});
 it('is finite for silence, DC, full-scale square and noise at default and extreme settings',()=>{
  for(const settings of extremes(kind))for(const name of Object.keys(signals)){
   const h=new FxHost(kind,SR);h.set(settings,false,120);const x=signals[name]!(SR/2),[l,r]=run(h,x,signals[name]!(SR/2));
   expect(l.every(Number.isFinite)&&r.every(Number.isFinite),`${kind} ${name} ${JSON.stringify(settings)}`).toBe(true);
  }
 });
 it('bypass returns the input bit-exactly (delayed by the reported latency)',()=>{
  const h=new FxHost(kind,SR);h.set(defaultFx(kind),true,120);const x=signals.noise!(4096),y=signals.noise!(4096),[l,r]=run(h,x,y),d=h.latency;
  for(let i=d;i<x.length;i++){expect(l[i]!).toBe(x[i-d]!);expect(r[i]!).toBe(y[i-d]!);}
 });
 it('toggling bypass crossfades without a click',()=>{
  const h=new FxHost(kind,SR);h.set(defaultFx(kind),false,120);const x=signals.sine!(SR),l=new Float32Array(SR),r=new Float32Array(SR);
  const half=SR/2;let [a]=run(h,x.subarray(0,half),x.subarray(0,half));h.set(defaultFx(kind),true,120);const [b]=run(h,x.subarray(half),x.subarray(half));l.set(a);l.set(b,half);r.length;
  let worst=0;for(let i=half-200;i<half+800;i++)worst=Math.max(worst,Math.abs(l[i]!-l[i-1]!));
  expect(worst).toBeLessThan(.25);
 });
 it('ignores junk settings',()=>{const h=new FxHost(kind,SR);h.set({[Object.keys(defaultFx(kind))[0]!]:'x',zzz:1},false,NaN);const [l]=run(h,signals.noise!(512),signals.noise!(512));expect(l.every(Number.isFinite)).toBe(true);expect(normalizeFx(kind,{})).toEqual(defaultFx(kind));});
});
