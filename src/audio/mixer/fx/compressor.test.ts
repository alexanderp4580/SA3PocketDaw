import {describe,expect,it} from 'vitest';
import {createCompressor} from './compressor';
import {defaultFx} from './spec';

const SR=44100;
const mk=(p:Record<string,number>={})=>{const d=createCompressor(SR);d.setParams({...defaultFx('compressor'),...p},120);return d;};
function run(d:ReturnType<typeof createCompressor>,x:Float32Array,block=128){
 const out=new Float32Array(x.length),ol=new Float32Array(block),or=new Float32Array(block);
 for(let i=0;i<x.length;i+=block){
  const n=Math.min(block,x.length-i),b=x.subarray(i,i+n);
  d.process(b,b,ol,or,n);out.set(ol.subarray(0,n),i);
 }
 return out;
}
const dc=(len:number,v:number)=>new Float32Array(len).fill(v);
const lin=(db:number)=>Math.pow(10,db/20);
function noise(len:number,amp:number){let s=999;return Float32Array.from({length:len},()=>{s=(s*1664525+1013904223)>>>0;return amp*(s/2147483648-1);});}
/** Reference static curve (Giannoulis/Reiss soft knee): output level in dB for input level `x`. */
function curve(x:number,T:number,R:number,W:number){
 if(2*(x-T)<-W)return x;
 if(W>0&&2*Math.abs(x-T)<=W)return x+(1/R-1)*Math.pow(x-T+W/2,2)/(2*W);
 return T+(x-T)/R;
}

describe('compressor',()=>{
 it('has no latency',()=>{expect(createCompressor(SR).latency).toBe(0);});
 const cases:Array<[number,number,number,number]>=[];
 for(const [R,W,M] of [[4,0,0],[10,0,3],[4,12,0],[10,12,-2]] as const)for(const x of [-40,-20,-17,-14,-10,-3])cases.push([R,W,M,x]);
 it.each(cases)('static curve ratio %d knee %d makeup %d at %d dB',(R,W,M,x)=>{
  const d=mk({threshold:-20,ratio:R,knee:W,makeup:M,attack:1,release:20});
  const amp=lin(x),out=run(d,dc(SR/2,amp)),g=20*Math.log10(out[out.length-1]!/amp);
  expect(Math.abs(g-(curve(x,-20,R,W)-x+M))).toBeLessThan(0.1);
 });
 it('reaches 63 % of the reduction after one attack time',()=>{
  const attack=20,x=new Float32Array(SR);x.fill(lin(-60),0,SR/10);x.fill(lin(-20),SR/10);
  const d=mk({threshold:-40,ratio:4,knee:0,attack,release:500});
  const out=run(d,x);
  let idx=-1;
  for(let i=SR/10;i<x.length;i++)if(20*Math.log10(out[i]!/x[i]!)<=-15*0.632){idx=i-SR/10;break;}
  const t=idx/SR*1000;
  expect(Math.abs(t-attack)/attack).toBeLessThan(0.1);
 });
 it('recovers 63 % after one release time',()=>{
  const release=100,x=new Float32Array(SR*2);x.fill(lin(-20),0,SR);x.fill(lin(-60),SR);
  const d=mk({threshold:-40,ratio:4,knee:0,attack:1,release});
  const out=run(d,x);
  const full=20*Math.log10(out[SR-1]!/x[SR-1]!);
  expect(full).toBeCloseTo(-15,1);
  let idx=-1;
  for(let i=SR;i<x.length;i++)if(20*Math.log10(out[i]!/x[i]!)>=full*(1-0.632)){idx=i-SR;break;}
  const t=idx/SR*1000;
  expect(Math.abs(t-release)/release).toBeLessThan(0.1);
 });
 it('is transparent at ratio 1 and makeup 0',()=>{
  const d=mk({ratio:1,makeup:0,threshold:-30}),x=noise(20000,0.9),out=run(d,x);
  for(let i=0;i<x.length;i++)expect(Math.abs(out[i]!-x[i]!)).toBeLessThan(1e-6);
 });
 it('meters the reduction in dB',()=>{
  const d=mk({threshold:-40,ratio:4,knee:0,attack:1});
  run(d,dc(SR/2,lin(-20)));
  expect(d.reduction).toBeCloseTo(15,1);
 });
 it('clear resets the gain state',()=>{
  const d=mk({threshold:-40,ratio:10,attack:1});
  run(d,dc(SR/4,1));d.clear();
  expect(d.reduction).toBe(0);
  const out=run(d,dc(8,lin(-60)));
  expect(out[0]!).toBeCloseTo(lin(-60),8);
 });
 it('has no steps when parameters jump',()=>{
  const d=mk(),x=Float32Array.from({length:128*340},(_,i)=>0.7*Math.sin(2*Math.PI*220*i/SR));
  const out=new Float32Array(x.length),ol=new Float32Array(128),or=new Float32Array(128);
  for(let i=0,k=0;i+128<=x.length;i+=128,k++){
   d.setParams({...defaultFx('compressor'),...(k%10<5?{threshold:-40,ratio:20,makeup:12,knee:0}:{threshold:0,ratio:1,makeup:0})},120);
   d.process(x.subarray(i,i+128),x.subarray(i,i+128),ol,or,128);out.set(ol,i);
  }
  let step=0;for(let i=1;i<out.length;i++)step=Math.max(step,Math.abs(out[i]!-out[i-1]!));
  expect(step).toBeLessThan(0.15);
 });
 it('stays finite on silence, DC and full-scale noise',()=>{
  const d=mk({threshold:-60,ratio:20,makeup:24,attack:.1});
  for(const x of [new Float32Array(5000),dc(5000,1),noise(5000,1)])for(const v of run(d,x))expect(Number.isFinite(v)).toBe(true);
 });
});
