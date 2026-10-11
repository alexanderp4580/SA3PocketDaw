import type {FxDsp} from './types';
import {defaultFx,delayBufferMaxMs,delayMs} from './spec';

const pow2=(n:number):number=>{let s=2;while(s<n)s*=2;return s;};

/**
 * Stereo delay with tempo sync, tone-filtered feedback and optional ping-pong.
 * Circular Float64 lines sized for `delayBufferMaxMs`, linear read interpolation, delay time glides with a one-pole
 * (about 40 ms, at most one sample of delay change per sample). Output is dry plus wet scaled by mix.
 */
export function createDelay(sampleRate:number):FxDsp{
 const size=pow2(Math.ceil(delayBufferMaxMs*sampleRate/1000)+4),mask=size-1;
 const bufL=new Float64Array(size),bufR=new Float64Array(size);
 const glide=1-Math.exp(-1/(0.04*sampleRate));
 let w=0,d=0,dT=0,fb=0,fbT=0,mix=0,mixT=0,a=1,aT=1,ping=0,fL=0,fR=0,snap=true;
 const self:FxDsp={
  latency:0,reduction:0,
  setParams(p,bpm){
   dT=delayMs(p.sync!,p.time!,bpm)*sampleRate/1000;
   fbT=Math.min(.95,Math.max(0,p.feedback!/100));
   mixT=Math.min(1,Math.max(0,p.mix!/100));
   aT=p.tone!>=20000?1:1-Math.exp(-2*Math.PI*Math.max(20,p.tone!)/sampleRate);
   ping=p.pingpong!>=.5?1:0;
   if(snap){d=dT;fb=fbT;mix=mixT;a=aT;snap=false;}
  },
  process(l,r,ol,or,n){
   const fbS=(fbT-fb)/n,mixS=(mixT-mix)/n,aS=(aT-a)/n,target=dT,pp=ping;
   let wi=w,dc=d,f=fb,m=mix,k=a,s1=fL,s2=fR;
   for(let i=0;i<n;i++){
    let dd=(target-dc)*glide;
    if(dd>1)dd=1;else if(dd<-1)dd=-1;
    dc+=dd;
    if(dd<1e-6&&dd>-1e-6)dc=target;
    const pos=wi-dc,ip=Math.floor(pos),fr=pos-ip,i0=ip&mask,i1=(ip+1)&mask;
    const yl=bufL[i0]!+(bufL[i1]!-bufL[i0]!)*fr,yr=bufR[i0]!+(bufR[i1]!-bufR[i0]!)*fr;
    f+=fbS;m+=mixS;k+=aS;
    s1+=k*(yl-s1);s2+=k*(yr-s2);
    const xl=l[i]!,xr=r[i]!;
    let wl:number,wr:number;
    if(pp){wl=(xl+xr)*.5+f*s2;wr=f*s1;}
    else{wl=xl+f*s1;wr=xr+f*s2;}
    if(wl<1e-20&&wl>-1e-20)wl=0;
    if(wr<1e-20&&wr>-1e-20)wr=0;
    bufL[wi]=wl;bufR[wi]=wr;
    wi=(wi+1)&mask;
    ol[i]=xl+m*yl;or[i]=xr+m*yr;
   }
   w=wi;d=dc;fb=fbT;mix=mixT;a=aT;
   fL=s1<1e-20&&s1>-1e-20?0:s1;
   fR=s2<1e-20&&s2>-1e-20?0:s2;
  },
  clear(){bufL.fill(0);bufR.fill(0);fL=0;fR=0;}
 };
 self.setParams(defaultFx('delay'),120);
 snap=true;
 return self;
}
