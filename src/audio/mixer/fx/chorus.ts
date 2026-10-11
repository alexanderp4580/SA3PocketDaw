import type {FxDsp} from './types';
import {defaultFx} from './spec';

const pow2=(n:number):number=>{let s=2;while(s<n)s*=2;return s;};
/** Parabolic sine approximation, period 1, peak +-1. */
const psin=(p:number):number=>{const t=p-Math.floor(p+.5);return 8*t*(1-2*Math.abs(t));};
const BASE_S=[.013,.019];
const DEPTH_S=.006;
/** LFO phase offsets of left voices A,B and right voices A,B. */
const PHASE=[0,.33,.5,.83];
const CHUNK=16;

/**
 * Stereo chorus: two modulated delay voices per channel (13 and 19 ms centres, up to +-6 ms at depth 100),
 * parabolic-sine LFO evaluated every 16 samples with linear interpolation of the delays between, linear read
 * interpolation. Wet is the voice sum at equal power; dry and wet gains follow cos/sin of the mix.
 */
export function createChorus(sampleRate:number):FxDsp{
 const size=pow2(Math.ceil(.026*sampleRate)+8),mask=size-1;
 const bl=new Float64Array(size),br=new Float64Array(size);
 const cur=new Float64Array(4),tgt=new Float64Array(4);
 const smooth=1-Math.exp(-CHUNK/(.05*sampleRate));
 let w=0,phase=0,inc=0,depth=0,depthT=0,dg=1,dgT=1,wg=0,wgT=0,snap=true;
 const aim=(ph:number,out:Float64Array):void=>{
  for(let k=0;k<4;k++)out[k]=sampleRate*(BASE_S[k&1]!+DEPTH_S*depth*psin(ph+PHASE[k]!));
 };
 const self:FxDsp={
  latency:0,reduction:0,
  setParams(p){
   inc=p.rate!/sampleRate;
   depthT=Math.min(1,Math.max(0,p.depth!/100));
   const m=Math.min(1,Math.max(0,p.mix!/100))*Math.PI/2;
   dgT=Math.cos(m);wgT=Math.sin(m);
   if(snap){depth=depthT;dg=dgT;wg=wgT;aim(phase,cur);snap=false;}
  },
  process(l,r,ol,or,n){
   const dgS=(dgT-dg)/n,wgS=(wgT-wg)/n;
   let i=0;
   while(i<n){
    const m=Math.min(CHUNK,n-i);
    depth+=(depthT-depth)*smooth;
    aim(phase+inc*m,tgt);
    let c0=cur[0]!,c1=cur[1]!,c2=cur[2]!,c3=cur[3]!;
    const s0=(tgt[0]!-c0)/m,s1=(tgt[1]!-c1)/m,s2=(tgt[2]!-c2)/m,s3=(tgt[3]!-c3)/m;
    for(let j=0;j<m;j++,i++){
     const xl=l[i]!,xr=r[i]!;
     bl[w]=xl;br[w]=xr;
     let pos=w-c0,ip=Math.floor(pos),fr=pos-ip,a=bl[ip&mask]!,v0=a+(bl[(ip+1)&mask]!-a)*fr;
     pos=w-c1;ip=Math.floor(pos);fr=pos-ip;a=bl[ip&mask]!;const v1=a+(bl[(ip+1)&mask]!-a)*fr;
     pos=w-c2;ip=Math.floor(pos);fr=pos-ip;a=br[ip&mask]!;const v2=a+(br[(ip+1)&mask]!-a)*fr;
     pos=w-c3;ip=Math.floor(pos);fr=pos-ip;a=br[ip&mask]!;const v3=a+(br[(ip+1)&mask]!-a)*fr;
     dg+=dgS;wg+=wgS;
     v0=(v0+v1)*.7071067811865476*wg;
     ol[i]=xl*dg+v0;or[i]=xr*dg+(v2+v3)*.7071067811865476*wg;
     w=(w+1)&mask;
     c0+=s0;c1+=s1;c2+=s2;c3+=s3;
    }
    cur[0]=tgt[0]!;cur[1]=tgt[1]!;cur[2]=tgt[2]!;cur[3]=tgt[3]!;
    phase+=inc*m;if(phase>=1)phase-=Math.floor(phase);
   }
   dg=dgT;wg=wgT;
  },
  clear(){bl.fill(0);br.fill(0);}
 };
 self.setParams(defaultFx('chorus'),120);
 snap=true;
 return self;
}
