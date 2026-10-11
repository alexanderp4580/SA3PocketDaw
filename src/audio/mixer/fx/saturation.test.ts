import {describe,expect,it} from 'vitest';
import {createSaturation} from './saturation';
import {defaultFx} from './spec';

const SR=44100;
const P=(over:Record<string,number>={})=>({...defaultFx('saturation'),tone:20000,mix:100,output:0,...over});
const make=(over:Record<string,number>={})=>{
 const fx=createSaturation(SR);
 fx.setParams(P(over),120);
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
const noise=(n:number,a=1,seed=7)=>{let s=seed;return Float32Array.from({length:n},()=>{s=(s*1664525+1013904223)>>>0;return a*(s/2147483648-1);});};
const rms=(x:ArrayLike<number>,from=0)=>{let s=0;for(let i=from;i<x.length;i++)s+=x[i]!*x[i]!;return Math.sqrt(s/(x.length-from));};
const db=(v:number)=>20*Math.log10(v);
/** Effective curve strength of a drive in dB. */
const strength=(drive:number)=>10**(drive/20)-1;
/** Power spectrum (Hann window) of the last `n` samples via radix-2 FFT. */
function spectrum(x:ArrayLike<number>,n:number){
 const re=new Float64Array(n),im=new Float64Array(n),o=x.length-n;
 for(let i=0;i<n;i++)re[i]=x[o+i]!*(.5-.5*Math.cos(2*Math.PI*i/n));
 for(let i=1,j=0;i<n;i++){let b=n>>1;for(;j&b;b>>=1)j^=b;j^=b;if(i<j){[re[i]!,re[j]!]=[re[j]!,re[i]!];}}
 for(let len=2;len<=n;len<<=1){
  const ang=-2*Math.PI/len;
  for(let i=0;i<n;i+=len)for(let k=0;k<len/2;k++){
   const c=Math.cos(ang*k),s=Math.sin(ang*k),a=i+k,b=a+len/2;
   const tr=re[b]!*c-im[b]!*s,ti=re[b]!*s+im[b]!*c;
   re[b]=re[a]!-tr;im[b]=im[a]!-ti;re[a]!+=tr;im[a]!+=ti;
  }
 }
 return Float64Array.from({length:n/2},(_,k)=>re[k]!*re[k]!+im[k]!*im[k]!);
}

describe('saturation',()=>{
 it('has no latency or reduction',()=>{
  const fx=make();
  expect(fx.latency).toBe(0);
  expect(fx.reduction).toBe(0);
 });
 it('output stays near the shaper bound 1/tanh(strength) times the output gain',()=>{
  // band-limiting a clipped signal overshoots its plateau: sines by up to 30 %, clipped noise by up to 2.5x (hard ceiling)
  for(const drive of [6,12,24,36])for(const output of [0,6,-12]){
   const gain=10**(output/20)/Math.tanh(strength(drive));
   const a=run(make({drive,output}),sine(8192,1234,4));
   for(const v of a)expect(Math.abs(v)).toBeLessThanOrEqual(1.4*gain);
   const y=run(make({drive,output}),noise(20000,4));
   for(const v of y)expect(Math.abs(v)).toBeLessThanOrEqual(2.5*gain*(1+1e-4));
  }
  const y=run(make({shape:1,drive:30,output:6}),noise(20000,4));
  for(const v of y)expect(Math.abs(v)).toBeLessThanOrEqual(2.5*10**(6/20)/Math.tanh(strength(30))*(1+1e-4));
 });
 it('passes a -20 dB 200 Hz sine at unit gain at drive 0 dB',()=>{
  for(const shape of [0,1]){
   const x=sine(16384,200,.1),y=run(make({shape,drive:0}),x);
   // the oversampling filters delay the wet path, so compare levels
   expect(Math.abs(db(rms(y,8192)/rms(x,8192)))).toBeLessThan(.1);
  }
 });
 it('maps full scale to full scale and follows the shape RMS at drive 24 dB',()=>{
  const s=strength(24),n=16384,x=sine(n,200,1);
  const soft=run(make({drive:24}),x),hard=run(make({shape:1,drive:24}),x);
  const exp=(f:(v:number)=>number)=>{let a=0;const m=20000;for(let i=0;i<m;i++)a+=f(Math.sin(2*Math.PI*i/m))**2;return Math.sqrt(a/m);};
  const eSoft=exp(v=>Math.tanh(s*v)/Math.tanh(s)),eHard=exp(v=>Math.max(-1,Math.min(1,s*v)));
  expect(Math.abs(db(rms(soft,4096)/eSoft))).toBeLessThan(1);
  expect(Math.abs(db(rms(hard,4096)/eHard))).toBeLessThan(1);
  let pk=0;for(let i=4096;i<n;i++)pk=Math.max(pk,Math.abs(soft[i]!));
  expect(Math.abs(db(pk))).toBeLessThan(1);
 });
 it('is near-transparent at drive 0 for small signals',()=>{
  const x=sine(8192,1000,.05),y=run(make({drive:0}),x);
  expect(Math.abs(db(rms(y,4096)/rms(x,4096)))).toBeLessThan(.1);
 });
 it('mix 0 returns the dry input exactly',()=>{
  const x=noise(1000),y=run(make({mix:0,drive:30}),x);
  for(let i=0;i<x.length;i++)expect(y[i]!).toBe(x[i]!);
 });
 it('keeps aliasing at least 40 dB below the fundamental for a 5 kHz sine at drive 24 dB',()=>{
  const n=16384,x=sine(n+4096,5000,.5),y=run(make({drive:24}),x),sp=spectrum(y,n);
  const bin=SR/n,f0=Math.round(5000/bin);
  let fund=0,alias=0;
  for(let k=1;k<sp.length;k++){
   const f=k*bin,h=Math.round(f/5000),near=Math.abs(f-h*5000)<400;
   if(near&&h===1)fund+=sp[k]!;
   else if(!near&&k>f0/10)alias+=sp[k]!;
  }
  expect(db(Math.sqrt(alias/fund))).toBeLessThan(-40);
 });
 it('tone of 500 Hz removes upper harmonics',()=>{
  const n=16384,x=sine(n+4096,200,.8),wide=spectrum(run(make({drive:24,tone:20000}),x),n),narrow=spectrum(run(make({drive:24,tone:500}),x),n);
  const bin=SR/n,from=Math.round(3000/bin);
  let a=0,b=0;
  for(let k=from;k<wide.length;k++){a+=wide[k]!;b+=narrow[k]!;}
  expect(db(Math.sqrt(b/a))).toBeLessThan(-14);
 });
 it('output param applies exactly in dB',()=>{
  const x=noise(4000,.8),a=run(make({drive:12,output:0}),x),b=run(make({drive:12,output:6}),x);
  for(let i=0;i<x.length;i++)expect(Math.abs(b[i]!-a[i]!*10**(6/20))).toBeLessThan(1e-6);
 });
 it('parameter jumps produce no click',()=>{
  const x=sine(12000,330,.6),fx=make({drive:6,output:0}),first=run(fx,x.subarray(0,4096));
  fx.setParams(P({drive:30,output:-6,shape:1,mix:70,tone:3000}),120);
  const second=run(fx,x.subarray(4096,8192)),third=run(fx,x.subarray(8192));
  const maxStep=(v:Float32Array,a=1)=>{let s=0;for(let i=a;i<v.length;i++)s=Math.max(s,Math.abs(v[i]!-v[i-1]!));return s;};
  const seam=Math.max(Math.abs(second[0]!-first[first.length-1]!),maxStep(second));
  const steady=Math.max(maxStep(first),maxStep(third,256));
  expect(seam).toBeLessThan(steady*1.5+.05);
  // a gain-only jump on a quiet tone must stay far below the jump size
  const fx2=make({drive:0,output:-12});
  run(fx2,x.subarray(0,2048));
  fx2.setParams(P({drive:0,output:12}),120);
  const o=run(fx2,x.subarray(2048,4096));
  expect(maxStep(o)).toBeLessThan(.25);
 });
 it('is finite for silence, DC and full-scale noise',()=>{
  for(const drive of [0,36])for(const shape of [0,1])for(const x of [new Float32Array(2000),new Float32Array(2000).fill(1),noise(2000,4)]){
   const y=run(make({drive,shape}),x);
   for(const v of y)expect(Number.isFinite(v)).toBe(true);
  }
 });
 it('clear empties the filter state',()=>{
  const fx=make({drive:20});
  run(fx,noise(1000));
  fx.clear();
  const y=run(fx,new Float32Array(256));
  for(const v of y)expect(v).toBe(0);
 });
});
