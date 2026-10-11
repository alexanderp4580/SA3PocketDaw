import {describe,expect,it} from 'vitest';
import {createTransient} from './transient';
import {defaultFx} from './spec';

const SR=44100;
const mk=(p:Record<string,number>={})=>{const d=createTransient(SR);d.setParams({...defaultFx('transient'),...p},120);return d;};
function run(p:Record<string,number>,x:Float32Array,block=128){
 const d=mk(p),out=new Float32Array(x.length),ol=new Float32Array(block),or=new Float32Array(block);
 for(let i=0;i<x.length;i+=block){
  const n=Math.min(block,x.length-i),b=x.subarray(i,i+n);
  d.process(b,b,ol,or,n);out.set(ol.subarray(0,n),i);
 }
 return out;
}
function noise(len:number,amp:number,seed=4242){let s=seed;return Float32Array.from({length:len},()=>{s=(s*1664525+1013904223)>>>0;return amp*(s/2147483648-1);});}
const HITS=[0.1,0.6,1.1,1.6,2.1];
/** Decaying 100 Hz sine with a 5 ms noise click, one hit every 0.5 s. */
function drum(scale=1){
 const x=new Float32Array(SR*2.8),nz=noise(x.length,0.5);
 for(const h of HITS){
  const s=Math.round(h*SR);
  for(let i=0;i<SR*0.45;i++){
   const t=i/SR;x[s+i]!+=0.8*Math.exp(-t/0.06)*Math.sin(2*Math.PI*100*t)+(t<0.005?nz[s+i]!:0);
  }
 }
 return x.map(v=>v*scale);
}
const peak=(x:Float32Array,a:number,b:number)=>{let m=0;for(let i=Math.round(a*SR);i<Math.round(b*SR);i++)m=Math.max(m,Math.abs(x[i]!));return m;};
const energy=(x:Float32Array,a:number,b:number)=>{let m=0;for(let i=Math.round(a*SR);i<Math.round(b*SR);i++)m+=x[i]!*x[i]!;return m;};
const db=(v:number)=>20*Math.log10(v);
/** Mean attack-window peak in dB over hits 2..5. */
const attackDb=(x:Float32Array)=>db(HITS.slice(1).reduce((s,h)=>s+peak(x,h,h+0.01),0)/4);
const tailDb=(x:Float32Array)=>10*Math.log10(HITS.slice(1).reduce((s,h)=>s+energy(x,h+0.1,h+0.3),0));

describe('transient',()=>{
 it('has no latency',()=>{expect(createTransient(SR).latency).toBe(0);});
 it('raises and lowers the attack',()=>{
  const x=drum(),base=attackDb(run({attack:0,sustain:0},x));
  expect(attackDb(run({attack:100,sustain:0},x))-base).toBeGreaterThanOrEqual(3);
  expect(attackDb(run({attack:-100,sustain:0},x))-base).toBeLessThanOrEqual(-3);
 });
 it('raises and lowers the sustain',()=>{
  const x=drum(),base=tailDb(run({attack:0,sustain:0},x));
  expect(tailDb(run({attack:0,sustain:100},x))-base).toBeGreaterThanOrEqual(3);
  expect(tailDb(run({attack:0,sustain:-100},x))-base).toBeLessThanOrEqual(-3);
 });
 it('acts independently of the input level',()=>{
  const x=drum(),q=drum(0.25);
  for(const p of [{attack:100,sustain:0},{attack:-100,sustain:0}]){
   const a=attackDb(run(p,x))-attackDb(x),b=attackDb(run(p,q))-attackDb(q);
   expect(Math.abs(a-b)).toBeLessThan(1);
  }
  for(const p of [{attack:0,sustain:100},{attack:0,sustain:-100}]){
   const a=tailDb(run(p,x))-tailDb(x),b=tailDb(run(p,q))-tailDb(q);
   expect(Math.abs(a-b)).toBeLessThan(1);
  }
 });
 it('is transparent at 0 % and 0 dB',()=>{
  const x=drum(),out=run({attack:0,sustain:0,output:0},x);
  for(let i=0;i<x.length;i++)expect(Math.abs(out[i]!-x[i]!)).toBeLessThan(1e-6);
 });
 it('applies the output gain exactly',()=>{
  const x=drum(),out=run({attack:0,sustain:0,output:6},x),g=Math.pow(10,6/20);
  for(let i=0;i<x.length;i+=7)expect(Math.abs(out[i]!-x[i]!*g)).toBeLessThan(2e-6);
 });
 it('has no steps when parameters jump on a steady sine',()=>{
  const d=mk(),x=Float32Array.from({length:128*340},(_,i)=>0.5*Math.sin(2*Math.PI*220*i/SR));
  const out=new Float32Array(x.length),ol=new Float32Array(128),or=new Float32Array(128);
  for(let i=0,k=0;i+128<=x.length;i+=128,k++){
   d.setParams({...defaultFx('transient'),...(k%10<5?{attack:100,sustain:-100,output:6}:{attack:-100,sustain:100,output:0})},120);
   d.process(x.subarray(i,i+128),x.subarray(i,i+128),ol,or,128);out.set(ol,i);
  }
  let step=0;for(let i=SR/4;i<out.length;i++)step=Math.max(step,Math.abs(out[i]!-out[i-1]!));
  expect(step).toBeLessThan(0.12);
 });
 it('clear resets envelopes',()=>{
  const d=mk({attack:100,sustain:100}),b=noise(128,1),ol=new Float32Array(128),or=new Float32Array(128);
  d.process(b,b,ol,or,128);d.clear();
  const z=new Float32Array(128);d.process(z,z,ol,or,128);
  for(const v of ol)expect(v).toBe(0);
 });
 it('stays finite on silence, DC and full-scale noise',()=>{
  for(const x of [new Float32Array(5000),new Float32Array(5000).fill(1),noise(5000,1)])
   for(const v of run({attack:100,sustain:-100,output:12},x))expect(Number.isFinite(v)).toBe(true);
 });
});
