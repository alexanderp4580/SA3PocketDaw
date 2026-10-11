import type {FxDsp} from './types';
import {defaultFx,filterSweepBeats} from './spec';

const DENORMAL=1e-20;
/** Frames between coefficient updates. */
const CHUNK=16;
const TWO_PI=2*Math.PI;
const Q_MIN=Math.SQRT1_2,Q_MAX=20;
/**
 * Resonant state-variable filter (zero-delay-feedback, trapezoidal integrators) with low-pass, high-pass and
 * band-pass outputs (band-pass has unity peak gain), type crossfade, optional sine sweep of the cutoff in log
 * frequency (free rate or tempo note length) and dry/wet mix. Coefficients update every 16 frames; cutoff,
 * resonance, sweep depth and type weights are one-pole smoothed (about 10 ms), the mix ramps within each block.
 */
class Filter implements FxDsp{
 readonly latency=0;
 reduction=0;
 private readonly fs:number;
 private readonly smooth:number;
 private readonly maxHz:number;
 // control values: current and target
 private lnFc=0;private lnFcT=0;
 private k=1;private kT=1;
 private depth=0;private depthT=0;
 private wl=1;private wh=0;private wb=0;
 private wlT=1;private whT=0;private wbT=0;
 private mix=1;private mixT=1;
 private rate=.5;
 private phase=0;
 private settled=false;
 private snap=true;
 // SVF coefficients and state (left, right)
 private a1=0;private a2=0;private a3=0;
 private l1=0;private l2=0;private r1=0;private r2=0;
 constructor(sampleRate:number){
  this.fs=sampleRate;
  this.smooth=1-Math.exp(-CHUNK/(.01*sampleRate));
  this.maxHz=.45*sampleRate;
  this.setParams(defaultFx('filter'),120);
  this.snap=true;
 }
 setParams(p:Readonly<Record<string,number>>,bpm:number):void{
  const type=Math.round(p.type!);
  this.wlT=type===0?1:0;this.whT=type===1?1:0;this.wbT=type===2?1:0;
  this.lnFcT=Math.log(Math.min(this.maxHz,Math.max(20,p.cutoff!)));
  const q=Q_MIN*Math.pow(Q_MAX/Q_MIN,Math.min(1,Math.max(0,p.resonance!/100)));
  this.kT=1/q;
  const sweep=Math.round(p.sweep!);
  this.depthT=sweep>0?Math.min(1,Math.max(0,p.depth!/100))*3*Math.LN2:0;
  if(sweep===2){
   const beats=filterSweepBeats[Math.min(filterSweepBeats.length-1,Math.max(0,Math.round(p.note!)))]!;
   this.rate=Math.max(1,bpm)/(60*beats);
  }else this.rate=p.rate!;
  this.mixT=Math.min(1,Math.max(0,p.mix!/100));
  if(this.snap){
   this.lnFc=this.lnFcT;this.k=this.kT;this.depth=this.depthT;
   this.wl=this.wlT;this.wh=this.whT;this.wb=this.wbT;this.mix=this.mixT;
  }
  this.snap=false;
  this.settled=false;
 }
 /** Moves smoothed controls one step and recomputes the SVF coefficients. */
 private control(m:number):void{
  const a=this.smooth;
  if(!this.settled){
   this.lnFc+=(this.lnFcT-this.lnFc)*a;
   this.k+=(this.kT-this.k)*a;
   this.depth+=(this.depthT-this.depth)*a;
   this.wl+=(this.wlT-this.wl)*a;this.wh+=(this.whT-this.wh)*a;this.wb+=(this.wbT-this.wb)*a;
   const close=Math.abs(this.lnFcT-this.lnFc)<1e-4&&Math.abs(this.kT-this.k)<1e-5&&Math.abs(this.depthT-this.depth)<1e-4
    &&Math.abs(this.wlT-this.wl)<1e-3&&Math.abs(this.whT-this.wh)<1e-3&&Math.abs(this.wbT-this.wb)<1e-3;
   if(close){
    this.lnFc=this.lnFcT;this.k=this.kT;this.depth=this.depthT;
    this.wl=this.wlT;this.wh=this.whT;this.wb=this.wbT;
    this.settled=this.depthT===0;
   }
  }
  let ln=this.lnFc;
  if(this.depth!==0){
   ln+=this.depth*Math.sin(TWO_PI*this.phase);
  }
  this.phase+=this.rate*m/this.fs;
  this.phase-=Math.floor(this.phase);
  let fc=Math.exp(ln);
  fc=fc<20?20:fc>this.maxHz?this.maxHz:fc;
  const g=Math.tan(Math.PI*fc/this.fs),k=this.k;
  this.a1=1/(1+g*(g+k));
  this.a2=g*this.a1;
  this.a3=g*this.a2;
 }
 process(l:Float32Array,r:Float32Array,ol:Float32Array,or:Float32Array,n:number):void{
  let l1=this.l1,l2=this.l2,r1=this.r1,r2=this.r2;
  let mix=this.mix;
  const dmix=(this.mixT-mix)/n;
  for(let i=0;i<n;){
   const m=Math.min(CHUNK,n-i);
   const wl0=this.wl,wh0=this.wh,wb0=this.wb;
   this.control(m);
   const {a1,a2,a3,k}=this;
   // type weights move linearly from the previous to the new smoothed value over the chunk
   const dl=(this.wl-wl0)/m,dh=(this.wh-wh0)/m,db=(this.wb-wb0)/m;
   let wl=wl0,wh=wh0,wb=wb0;
   for(let e=i+m;i<e;i++){
    const xl=l[i]!,xr=r[i]!;
    let v3=xl-l2,v1=a1*l1+a2*v3,v2=l2+a2*l1+a3*v3;
    l1=2*v1-l1;l2=2*v2-l2;
    const yl=wl*v2+wh*(xl-k*v1-v2)+wb*k*v1;
    v3=xr-r2;v1=a1*r1+a2*v3;v2=r2+a2*r1+a3*v3;
    r1=2*v1-r1;r2=2*v2-r2;
    const yr=wl*v2+wh*(xr-k*v1-v2)+wb*k*v1;
    ol[i]=xl+(yl-xl)*mix;
    or[i]=xr+(yr-xr)*mix;
    mix+=dmix;wl+=dl;wh+=dh;wb+=db;
   }
   if(l1<DENORMAL&&l1>-DENORMAL)l1=0;
   if(l2<DENORMAL&&l2>-DENORMAL)l2=0;
   if(r1<DENORMAL&&r1>-DENORMAL)r1=0;
   if(r2<DENORMAL&&r2>-DENORMAL)r2=0;
  }
  this.l1=l1;this.l2=l2;this.r1=r1;this.r2=r2;
  this.mix=this.mixT;
 }
 clear():void{this.l1=0;this.l2=0;this.r1=0;this.r2=0;}
}
/** Creates a resonant filter (parameters `type`, `cutoff`, `resonance`, `sweep`, `rate`, `note`, `depth`, `mix`). */
export const createFilter=(sampleRate:number):FxDsp=>new Filter(sampleRate);
