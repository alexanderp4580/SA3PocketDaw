import type {FxDsp,FxFactory} from './types';
import {defaultFx} from './spec';

const DB_PER_NEPER=8.685889638065035;
const NEPER_PER_DB=1/DB_PER_NEPER;

/**
 * Feed-forward compressor. Stereo-linked peak level in dB goes through a soft-knee static curve; the
 * resulting gain reduction is smoothed with attack (deepening) and release (recovering) one-pole filters
 * and applied with makeup gain to both channels. Threshold, slope, knee and makeup ramp linearly across the
 * block that follows a parameter change.
 */
export const createCompressor:FxFactory=(sampleRate:number):FxDsp=>{
 let th=-18,inv=.25,knee=6,mk=0,thT=th,invT=inv,kneeT=knee,mkT=mk,first=true;
 let ca=0,cr=0,sm=0;
 const d:FxDsp={
  latency:0,reduction:0,
  setParams(p,_bpm){
   thT=p.threshold!;invT=1/Math.max(1,p.ratio!);kneeT=p.knee!;mkT=p.makeup!;
   ca=Math.exp(-1/(Math.max(.01,p.attack!)*1e-3*sampleRate));
   cr=Math.exp(-1/(Math.max(.01,p.release!)*1e-3*sampleRate));
   if(first){th=thT;inv=invT;knee=kneeT;mk=mkT;first=false;}
  },
  process(l,r,ol,or,n){
   if(n<=0)return;
   const k=1/n,thI=(thT-th)*k,invI=(invT-inv)*k,kI=(kneeT-knee)*k,mI=(mkT-mk)*k;
   let s=sm,minS=0;
   for(let i=0;i<n;i++){
    th+=thI;inv+=invI;knee+=kI;mk+=mI;
    const xl=l[i]!,xr=r[i]!,al=xl<0?-xl:xl,ar=xr<0?-xr:xr;
    let a=al>ar?al:ar;if(a<1e-9)a=1e-9;
    const dd=DB_PER_NEPER*Math.log(a)-th;
    let red=0;
    if(2*dd>=-knee){
     if(knee>.01&&2*(dd<0?-dd:dd)<=knee){const u=dd+knee*.5;red=(inv-1)*u*u/(2*knee);}
     else red=(inv-1)*dd;
    }
    s=red<s?red+ca*(s-red):red+cr*(s-red);
    if(s>-1e-20&&s<1e-20)s=0;
    if(s<minS)minS=s;
    const g=Math.exp((s+mk)*NEPER_PER_DB);
    ol[i]=xl*g;or[i]=xr*g;
   }
   sm=s;th=thT;inv=invT;knee=kneeT;mk=mkT;
   d.reduction=-minS;
  },
  clear(){sm=0;d.reduction=0;}
 };
 d.setParams(defaultFx('compressor'),120);
 first=true;
 return d;
};
