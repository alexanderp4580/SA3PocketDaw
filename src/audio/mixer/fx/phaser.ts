import type {FxDsp} from './types';
import {defaultFx,phaserStages} from './spec';

/** Parabolic sine approximation, period 1, peak +-1. */
const psin=(p:number):number=>{const t=p-Math.floor(p+.5);return 8*t*(1-2*Math.abs(t));};
const CHUNK=16;
const F_LO=200,F_RATIO=20;

/**
 * Stereo phaser: 4, 6 or 8 first-order all-pass stages per channel with one shared coefficient swept
 * exponentially from 200 Hz to 4 kHz (span scaled by depth around the geometric centre). The coefficient is
 * evaluated every 16 samples and interpolated linearly; the right LFO runs 90 degrees ahead. Feedback takes the
 * last stage output (clamped). Dry and wet gains follow cos/sin of the mix and are scaled per chunk so that white
 * noise keeps its power despite the correlation between input and all-pass output (the first impulse-response
 * sample of the chain is c^stages).
 */
export function createPhaser(sampleRate:number):FxDsp{
 const zl=new Float64Array(8),zr=new Float64Array(8);
 const smooth=1-Math.exp(-CHUNK/(.05*sampleRate));
 let nl=1,nr=1,phase=0,inc=0,depth=0,depthT=0,fb=0,fbT=0,dg=1,dgT=1,wg=0,wgT=0,ns=4,cl=0,cr=0,yl=0,yr=0,snap=true;
 /** Stage coefficient for LFO phase `ph` at the smoothed depth. */
 const coef=(ph:number):number=>{
  const f=F_LO*Math.pow(F_RATIO,.5+.5*depth*psin(ph));
  const t=Math.tan(Math.PI*f/sampleRate);
  return (t-1)/(t+1);
 };
 /** Output normalisation for white noise at the current mix: 1/sqrt(dg^2+wg^2+2*dg*wg*c^stages). */
 const norm=(c:number):number=>{
  const c2=c*c,c4=c2*c2,h=ns===4?c4:ns===6?c4*c2:c4*c4;
  return 1/Math.sqrt(1+2*dgT*wgT*h);
 };
 const self:FxDsp={
  latency:0,reduction:0,
  setParams(p){
   inc=p.rate!/sampleRate;
   depthT=Math.min(1,Math.max(0,p.depth!/100));
   fbT=Math.min(.95,Math.max(0,p.feedback!/100));
   ns=phaserStages[Math.min(phaserStages.length-1,Math.max(0,Math.round(p.stages!)))]!;
   const m=Math.min(1,Math.max(0,p.mix!/100))*Math.PI/2;
   dgT=Math.cos(m);wgT=Math.sin(m);
   if(snap){depth=depthT;fb=fbT;dg=dgT;wg=wgT;cl=coef(phase);cr=coef(phase+.25);nl=norm(cl);nr=norm(cr);snap=false;}
  },
  process(l,r,ol,or,n){
   const fbS=(fbT-fb)/n,dgS=(dgT-dg)/n,wgS=(wgT-wg)/n,stages=ns;
   let f=fb,d=dg,wv=wg,c1=cl,c2=cr,g1=nl,g2=nr,y1=yl,y2=yr,i=0;
   while(i<n){
    const m=Math.min(CHUNK,n-i);
    depth+=(depthT-depth)*smooth;
    const tl=coef(phase+inc*m),tr=coef(phase+inc*m+.25);
    const sl=(tl-c1)/m,sr=(tr-c2)/m,gl=norm(tl),gr=norm(tr),sgl=(gl-g1)/m,sgr=(gr-g2)/m;
    for(let s=0;s<8;s++){
     if(zl[s]!<1e-20&&zl[s]!>-1e-20)zl[s]=0;
     if(zr[s]!<1e-20&&zr[s]!>-1e-20)zr[s]=0;
    }
    if(y1<1e-20&&y1>-1e-20)y1=0;
    if(y2<1e-20&&y2>-1e-20)y2=0;
    for(let j=0;j<m;j++,i++){
     f+=fbS;d+=dgS;wv+=wgS;
     const xl=l[i]!,xr=r[i]!;
     let vl=xl+f*y1,vr=xr+f*y2;
     for(let s=0;s<stages;s++){
      let y=c1*vl+zl[s]!;zl[s]=vl-c1*y;vl=y;
      y=c2*vr+zr[s]!;zr[s]=vr-c2*y;vr=y;
     }
     y1=vl>8?8:vl<-8?-8:vl;y2=vr>8?8:vr<-8?-8:vr;
     ol[i]=(xl*d+vl*wv)*g1;or[i]=(xr*d+vr*wv)*g2;
     c1+=sl;c2+=sr;g1+=sgl;g2+=sgr;
    }
    c1=tl;c2=tr;g1=gl;g2=gr;
    phase+=inc*m;if(phase>=1)phase-=Math.floor(phase);
   }
   cl=c1;cr=c2;nl=g1;nr=g2;yl=y1;yr=y2;fb=fbT;dg=dgT;wg=wgT;
  },
  clear(){zl.fill(0);zr.fill(0);yl=0;yr=0;}
 };
 self.setParams(defaultFx('phaser'),120);
 snap=true;
 return self;
}
