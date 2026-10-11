import type {FxDsp} from './types';
import {defaultFx} from './spec';

const DENORMAL=1e-20;
/** Half-band polyphase all-pass coefficients of the base to 2x stage (direct branch A0,A1 and delayed branch B0,B1). */
const A0=0.07986642623635751,A1=0.5453536510711322,B0=0.28382934487410993,B1=0.8344118914807379;
/** Coefficients of the 2x to 4x stage (one section per branch; its transition band is wide). */
const C0=0.138025,C1=0.584683;
/** Rational tanh (Lambert continued fraction), within 1e-4 of tanh and clamped to +-1 beyond |x| = 4.9. */
function tanhR(x:number):number{
 if(x>4.9)return 1;
 if(x<-4.9)return -1;
 const x2=x*x;
 return x*(135135+x2*(17325+x2*(378+x2)))/(135135+x2*(62370+x2*(3150+28*x2)));
}
/** Shaper at the oversampled rate; `mode` 0 soft, 1 hard, 2 crossfade by `sh`. */
function shape(v:number,g:number,sh:number,nS:number,nH:number,mode:number):number{
 const a=g*v;
 if(mode===0)return tanhR(a)*nS;
 const h=(a>1?1:a<-1?-1:a)*nH;
 return mode===1?h:(1-sh)*tanhR(a)*nS+sh*h;
}
// Per-channel state slots: 2x stage up/down sections, 4x stage up/down sections, delayed odd branches, tone, DC blocker.
const UA0=0,UA1=1,UB0=2,UB1=3,DA0=4,DA1=5,DB0=6,DB1=7,PREV=8,TONE=9,DCX=10,DCY=11,UC0=12,UC1=13,DC0=14,DC1=15,PREV2=16,SLOTS=17;
/**
 * Saturation with 4x oversampling around the shaper (two cascaded half-band all-pass IIR up/down stages), tone low-pass and DC blocker.
 * Curve strength is s = 10^(drive/20) - 1, so drive 0 dB is the identity. Soft is tanh(s x)/tanh(s), hard is clamp(s x)/min(s,1):
 * full scale maps to full scale. The dry path is not delayed by the oversampling filters. Output gain applies to the wet path only.
 * The band-limited wet signal can overshoot the shaper plateau; it is limited to 2.5 times the soft bound as a safety ceiling.
 */
class Saturation implements FxDsp{
 readonly latency=0;
 reduction=0;
 private readonly fs:number;
 private readonly st=new Float64Array(SLOTS*2);
 private readonly dcR:number;
 // current / target values, linearly ramped across each block
 private s=1;private sT=1;
 private nS=1;private nST=1;
 private nH=1;private nHT=1;
 private sh=0;private shT=0;
 private og=1;private ogT=1;
 private mx=1;private mxT=1;
 private tc=.5;private tcT=.5;
 private snap=true;
 constructor(sampleRate:number){
  this.fs=sampleRate;
  this.dcR=1-2*Math.PI*5/sampleRate;
  this.setParams(defaultFx('saturation'),120);
  this.snap=true;
 }
 setParams(p:Readonly<Record<string,number>>,_bpm:number):void{
  const s=Math.max(1e-4,10**(p.drive!/20)-1);
  this.sT=s;
  this.nST=1/tanhR(s);
  this.nHT=1/Math.min(s,1);
  this.shT=p.shape!>=.5?1:0;
  this.ogT=10**(p.output!/20);
  this.mxT=Math.min(1,Math.max(0,p.mix!/100));
  this.tcT=1-Math.exp(-2*Math.PI*Math.min(p.tone!,.45*this.fs)/this.fs);
  if(this.snap){
   this.s=this.sT;this.nS=this.nST;this.nH=this.nHT;this.sh=this.shT;
   this.og=this.ogT;this.mx=this.mxT;this.tc=this.tcT;
  }
  this.snap=false;
 }
 process(l:Float32Array,r:Float32Array,ol:Float32Array,or:Float32Array,n:number):void{
  this.pass(l,ol,0,n);
  this.pass(r,or,SLOTS,n);
  this.s=this.sT;this.nS=this.nST;this.nH=this.nHT;this.sh=this.shT;
  this.og=this.ogT;this.mx=this.mxT;this.tc=this.tcT;
 }
 /** One channel: oversampled shaper, tone, DC blocker, output gain and dry/wet mix. */
 private pass(x:Float32Array,o:Float32Array,b:number,n:number):void{
  const st=this.st,inv=1/n,dcR=this.dcR;
  let g=this.s,nS=this.nS,nH=this.nH,sh=this.sh,og=this.og,mx=this.mx,tc=this.tc;
  const dg=(this.sT-g)*inv,dnS=(this.nST-nS)*inv,dnH=(this.nHT-nH)*inv,dsh=(this.shT-sh)*inv,dog=(this.ogT-og)*inv,dmx=(this.mxT-mx)*inv,dtc=(this.tcT-tc)*inv;
  const mode=this.sh===this.shT?this.shT:2;
  let ua0=st[b+UA0]!,ua1=st[b+UA1]!,ub0=st[b+UB0]!,ub1=st[b+UB1]!;
  let da0=st[b+DA0]!,da1=st[b+DA1]!,db0=st[b+DB0]!,db1=st[b+DB1]!;
  let uc0=st[b+UC0]!,uc1=st[b+UC1]!,dc0=st[b+DC0]!,dc1=st[b+DC1]!,prev2=st[b+PREV2]!;
  let prev=st[b+PREV]!,tone=st[b+TONE]!,dcx=st[b+DCX]!,dcy=st[b+DCY]!;
  for(let i=0;i<n;i++){
   const xi=x[i]!;
   // base to 2x: even phase through branch A, odd phase through branch B
   let w=xi-A0*ua0,v=A0*w+ua0;ua0=w;
   w=v-A1*ua1;const e=A1*w+ua1;ua1=w;
   w=xi-B0*ub0;v=B0*w+ub0;ub0=w;
   w=v-B1*ub1;const od=B1*w+ub1;ub1=w;
   // 2x to 4x for the even phase, shaper, back to 2x
   w=e-C0*uc0;const e0=C0*w+uc0;uc0=w;
   w=e-C1*uc1;const e1=C1*w+uc1;uc1=w;
   const s0=shape(e0,g,sh,nS,nH,mode),s1=shape(e1,g,sh,nS,nH,mode);
   w=s0-C0*dc0;let ya=C0*w+dc0;dc0=w;
   w=s1-C1*dc1;let yb=C1*w+dc1;dc1=w;
   const m0=.5*(ya+prev2);
   prev2=yb;
   // same for the odd phase
   w=od-C0*uc0;const o0=C0*w+uc0;uc0=w;
   w=od-C1*uc1;const o1=C1*w+uc1;uc1=w;
   const s2=shape(o0,g,sh,nS,nH,mode),s3=shape(o1,g,sh,nS,nH,mode);
   w=s2-C0*dc0;ya=C0*w+dc0;dc0=w;
   w=s3-C1*dc1;yb=C1*w+dc1;dc1=w;
   const m1=.5*(ya+prev2);
   prev2=yb;
   // 2x to base: even phase through branch A, odd phase through branch B delayed by one sample
   w=m0-A0*da0;v=A0*w+da0;da0=w;
   w=v-A1*da1;const qa=A1*w+da1;da1=w;
   w=m1-B0*db0;v=B0*w+db0;db0=w;
   w=v-B1*db1;const qb=B1*w+db1;db1=w;
   let y=.5*(qa+prev);
   prev=qb;
   tone+=tc*(y-tone);
   const t=tone;
   y=t-dcx+dcR*dcy;
   dcx=t;dcy=y;
   const lim=2.5*nS;
   y=y>lim?lim:y<-lim?-lim:y;
   o[i]=xi*(1-mx)+y*og*mx;
   g+=dg;nS+=dnS;nH+=dnH;sh+=dsh;og+=dog;mx+=dmx;tc+=dtc;
   if(tone<DENORMAL&&tone>-DENORMAL)tone=0;
   if(dcy<DENORMAL&&dcy>-DENORMAL)dcy=0;
  }
  const fl=(v:number)=>v<DENORMAL&&v>-DENORMAL?0:v;
  st[b+UA0]=fl(ua0);st[b+UA1]=fl(ua1);st[b+UB0]=fl(ub0);st[b+UB1]=fl(ub1);
  st[b+DA0]=fl(da0);st[b+DA1]=fl(da1);st[b+DB0]=fl(db0);st[b+DB1]=fl(db1);
  st[b+PREV]=fl(prev);st[b+UC0]=fl(uc0);st[b+UC1]=fl(uc1);st[b+DC0]=fl(dc0);st[b+DC1]=fl(dc1);st[b+PREV2]=fl(prev2);st[b+TONE]=tone;st[b+DCX]=dcx;st[b+DCY]=dcy;
 }
 clear():void{this.st.fill(0);}
}
/** Creates a saturation (parameters `shape`, `drive`, `tone`, `mix`, `output`). */
export const createSaturation=(sampleRate:number):FxDsp=>new Saturation(sampleRate);
