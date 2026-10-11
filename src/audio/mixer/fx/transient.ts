import type {FxDsp,FxFactory} from './types';
import {defaultFx} from './spec';

const MAX_DB=12;
const NEPER_PER_DB=Math.log(10)/20;
const EPS=1e-5;

/**
 * Level-independent transient shaper. A fast and a slow envelope follower track the stereo-linked peak.
 * The attack signal is the fast envelope's excess over the slow one, the sustain signal the slow envelope's
 * excess over the fast one (both relative to the envelope level, with a small dead zone so steady tones
 * stay untouched). Attack and sustain percentages scale +-12 dB of gain driven by those signals; the gain
 * is smoothed and combined with the output gain. Attack, sustain and output ramp across the block after a change.
 */
export const createTransient:FxFactory=(sampleRate:number):FxDsp=>{
 const coef=(ms:number)=>Math.exp(-1/(ms*1e-3*sampleRate));
 const fa=coef(1),fr=coef(30),sa=coef(20),sr=coef(120),gc=1-coef(.8);
 let ef=0,es=0,gs=0;
 let aS=0,sS=0,oG=1,aT=0,sT=0,oT=1,first=true;
 const d:FxDsp={
  latency:0,reduction:0,
  setParams(p,_bpm){
   aT=p.attack!*MAX_DB/100;sT=p.sustain!*MAX_DB/100;oT=Math.pow(10,p.output!/20);
   if(first){aS=aT;sS=sT;oG=oT;first=false;}
  },
  process(l,r,ol,or,n){
   if(n<=0)return;
   const k=1/n,aI=(aT-aS)*k,sI=(sT-sS)*k,oI=(oT-oG)*k;
   let f=ef,s=es,g=gs;
   for(let i=0;i<n;i++){
    aS+=aI;sS+=sI;oG+=oI;
    const xl=l[i]!,xr=r[i]!,al=xl<0?-xl:xl,ar=xr<0?-xr:xr,a=al>ar?al:ar;
    f=a>f?a+fa*(f-a):a+fr*(f-a);
    s=a>s?a+sa*(s-a):a+sr*(s-a);
    if(f<1e-20)f=0;
    if(s<1e-20)s=0;
    let at=f-1.15*s;at=at>0?2.5*at/(f+EPS):0;if(at>1)at=1;
    let su=s-1.1*f;su=su>0?3*su/(s+EPS):0;if(su>1)su=1;
    g+=(aS*at+sS*su-g)*gc;
    const gain=(g>1e-12||g<-1e-12?Math.exp(g*NEPER_PER_DB):1)*oG;
    ol[i]=xl*gain;or[i]=xr*gain;
   }
   ef=f;es=s;gs=g;aS=aT;sS=sT;oG=oT;
  },
  clear(){ef=0;es=0;gs=0;}
 };
 d.setParams(defaultFx('transient'),120);
 first=true;
 return d;
};
