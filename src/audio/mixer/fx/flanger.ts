import type {FxDsp} from './types';
import {defaultFx} from './spec';

const pow2=(n:number):number=>{let s=2;while(s<n)s*=2;return s;};
/** Parabolic sine approximation, period 1, peak +-1. */
const psin=(p:number):number=>{const t=p-Math.floor(p+.5);return 8*t*(1-2*Math.abs(t));};
const CHUNK=16;
/** Delay centre and swing at depth 100, in seconds (0.2 .. 6 ms). */
const CENTRE_S=.0031,SWING_S=.0029;

/**
 * Stereo flanger: a 0.2 to 6 ms modulated delay with feedback (sign allowed) and linear read interpolation.
 * The delay centre is 3.1 ms; depth scales the swing. LFO is a parabolic sine evaluated every 16 samples with
 * linear interpolation between; the right channel runs 90 degrees ahead. Dry and wet gains follow cos/sin of
 * the mix.
 */
export function createFlanger(sampleRate:number):FxDsp{
 const size=pow2(Math.ceil(.0065*sampleRate)+8),mask=size-1;
 const bl=new Float64Array(size),br=new Float64Array(size);
 const smooth=1-Math.exp(-CHUNK/(.05*sampleRate));
 let w=0,phase=0,inc=0,depth=0,depthT=0,fb=0,fbT=0,dg=1,dgT=1,wg=0,wgT=0,cl=0,cr=0,snap=true;
 const delay=(ph:number):number=>Math.max(1,sampleRate*(CENTRE_S+SWING_S*depth*psin(ph)));
 const self:FxDsp={
  latency:0,reduction:0,
  setParams(p){
   inc=p.rate!/sampleRate;
   depthT=Math.min(1,Math.max(0,p.depth!/100));
   fbT=Math.min(.95,Math.max(-.95,p.feedback!/100));
   const m=Math.min(1,Math.max(0,p.mix!/100))*Math.PI/2;
   dgT=Math.cos(m);wgT=Math.sin(m);
   if(snap){depth=depthT;fb=fbT;dg=dgT;wg=wgT;cl=delay(phase);cr=delay(phase+.25);snap=false;}
  },
  process(l,r,ol,or,n){
   const fbS=(fbT-fb)/n,dgS=(dgT-dg)/n,wgS=(wgT-wg)/n;
   let f=fb,d=dg,wv=wg,c1=cl,c2=cr,wi=w,i=0;
   while(i<n){
    const m=Math.min(CHUNK,n-i);
    depth+=(depthT-depth)*smooth;
    const tl=delay(phase+inc*m),tr=delay(phase+inc*m+.25);
    const sl=(tl-c1)/m,sr=(tr-c2)/m;
    for(let j=0;j<m;j++,i++){
     f+=fbS;d+=dgS;wv+=wgS;
     let pos=wi-c1,ip=Math.floor(pos),fr=pos-ip,a=bl[ip&mask]!;
     const yl=a+(bl[(ip+1)&mask]!-a)*fr;
     pos=wi-c2;ip=Math.floor(pos);fr=pos-ip;a=br[ip&mask]!;
     const yr=a+(br[(ip+1)&mask]!-a)*fr;
     const xl=l[i]!,xr=r[i]!;
     let wl=xl+f*yl,wr=xr+f*yr;
     if(wl<1e-20&&wl>-1e-20)wl=0;
     if(wr<1e-20&&wr>-1e-20)wr=0;
     bl[wi]=wl;br[wi]=wr;
     wi=(wi+1)&mask;
     ol[i]=xl*d+yl*wv;or[i]=xr*d+yr*wv;
     c1+=sl;c2+=sr;
    }
    c1=tl;c2=tr;
    phase+=inc*m;if(phase>=1)phase-=Math.floor(phase);
   }
   w=wi;cl=c1;cr=c2;fb=fbT;dg=dgT;wg=wgT;
  },
  clear(){bl.fill(0);br.fill(0);}
 };
 self.setParams(defaultFx('flanger'),120);
 snap=true;
 return self;
}
