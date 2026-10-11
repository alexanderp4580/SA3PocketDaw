import type {FxDsp,FxFactory} from './types';
import {defaultFx} from './spec';

/**
 * Look-ahead brick-wall limiter. The input is scaled by the drive (ceiling minus threshold) and delayed by
 * N-1 samples while a gain curve is built from the stereo-linked peak: instant-attack running minimum over
 * N samples, one-pole release, then a box average over N samples. The averaged gain never exceeds the
 * minimum that covers the delayed sample, so the output stays under the ceiling; a final clamp is a safety net.
 */
export const createLimiter:FxFactory=(sampleRate:number):FxDsp=>{
 const N=Math.max(1,Math.round(0.003*sampleRate));
 let M=2;while(M<N+1)M<<=1;
 const mask=M-1;
 const dl=new Float32Array(N),dr=new Float32Array(N);
 const gBuf=new Float64Array(N).fill(1);
 const qIdx=new Float64Array(M),qVal=new Float64Array(M);
 const invN=1/N;
 let wp=0,qHead=0,qTail=0,t=0,rel=1,sum=N,rc=0;
 let drive=1,driveT=1,ceil=1,ceilT=1,first=true;
 const d:FxDsp={
  latency:N-1,reduction:0,
  setParams(p,_bpm){
   const th=p.threshold!,ce=p.ceiling!;
   driveT=Math.pow(10,Math.max(0,ce-th)/20);ceilT=Math.pow(10,ce/20);
   rc=1-Math.exp(-1/(Math.max(1,p.release!)*1e-3*sampleRate));
   if(first){drive=driveT;ceil=ceilT;first=false;}
  },
  process(l,r,ol,or,n){
   if(n<=0)return;
   const dInc=(driveT-drive)/n,cInc=(ceilT-ceil)/n;
   let minS=1;
   for(let i=0;i<n;i++){
    drive+=dInc;ceil+=cInc;
    const xl=l[i]!*drive,xr=r[i]!*drive;
    dl[wp]=xl;dr[wp]=xr;
    const al=xl<0?-xl:xl,ar=xr<0?-xr:xr,a=al>ar?al:ar;
    const g=a>ceil?ceil/a:1;
    // running minimum of g over the last N samples (monotonic deque)
    // tail points one past the newest entry; entries live in [head,tail)
    while(qTail!==qHead&&qVal[(qTail-1)&mask]!>=g)qTail--;
    qIdx[qTail&mask]=t;qVal[qTail&mask]=g;qTail++;
    while(qIdx[qHead&mask]!<=t-N)qHead++;
    const m=qVal[qHead&mask]!;
    rel+=(1-rel)*rc;if(m<rel)rel=m;
    sum+=rel-gBuf[wp]!;gBuf[wp]=rel;
    let s=sum*invN;s=s>1?1:s<0?0:s;
    if(s<minS)minS=s;
    let rp=wp+1;if(rp>=N)rp=0;
    let yl=dl[rp]!*s,yr=dr[rp]!*s;
    yl=yl>ceil?ceil:yl<-ceil?-ceil:yl;yr=yr>ceil?ceil:yr<-ceil?-ceil:yr;
    ol[i]=yl;or[i]=yr;
    t++;
    if(++wp>=N){wp=0;sum=0;for(let j=0;j<N;j++)sum+=gBuf[j]!;}
   }
   drive=driveT;ceil=ceilT;
   d.reduction=minS>=1?0:-20*Math.log10(Math.max(minS,1e-9));
  },
  clear(){
   dl.fill(0);dr.fill(0);gBuf.fill(1);qIdx.fill(0);qVal.fill(1);
   wp=0;qHead=0;qTail=0;t=0;rel=1;sum=N;d.reduction=0;
  }
 };
 d.setParams(defaultFx('limiter'),120);
 first=true;
 return d;
};
