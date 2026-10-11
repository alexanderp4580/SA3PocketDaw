import type {FxDsp} from './types';
import {defaultFx} from './spec';

const DENORMAL=1e-20;
/**
 * Mid/side stereo widener. Mid stays untouched, side is scaled by width and optionally high-passed
 * (2nd-order Butterworth) so content below `bassMono` Hz is mono. Width 100 with bass mono off copies the input.
 */
class Widener implements FxDsp{
 readonly latency=0;
 reduction=0;
 private readonly fs:number;
 private w=1;
 private wTarget=1;
 /** Smoothed high-pass corner in Hz; 1 Hz while the high-pass is switched off. */
 private fc=1;
 private fcTarget=1;
 private hpOn=false;
 private b0=1;private b1=-2;private b2=1;private a1=0;private a2=0;
 private z1=0;private z2=0;
 private wantsHp=false;
 private snap=true;
 constructor(sampleRate:number){
  this.fs=sampleRate;
  this.setParams(defaultFx('widener'),120);
  this.snap=true;
 }
 setParams(p:Readonly<Record<string,number>>,_bpm:number):void{
  this.wTarget=Math.min(2,Math.max(0,p.width!/100));
  const bass=Math.min(0.2*this.fs,Math.max(0,p.bassMono!));
  this.fcTarget=bass>0?Math.max(bass,1):1;
  const wantsHp=bass>0;
  if(this.snap){this.w=this.wTarget;this.fc=this.fcTarget;}
  if(wantsHp&&!this.hpOn){this.hpOn=true;if(this.snap)this.coefs();}
  this.wantsHp=wantsHp;
  this.snap=false;
 }
 /** Butterworth high-pass coefficients for the current corner (bilinear transform). */
 private coefs():void{
  const k=Math.tan(Math.PI*this.fc/this.fs),k2=k*k,s2=Math.SQRT2*k,n=1/(1+s2+k2);
  this.b0=n;this.b1=-2*n;this.b2=n;
  this.a1=2*(k2-1)*n;this.a2=(1-s2+k2)*n;
 }
 process(l:Float32Array,r:Float32Array,ol:Float32Array,or:Float32Array,n:number):void{
  if(this.hpOn){
   // smooth the corner per block; the filter is released once it settles at the 1 Hz off position
   this.fc+=(this.fcTarget-this.fc)*.3;
   if(Math.abs(this.fc-this.fcTarget)<.01*this.fcTarget)this.fc=this.fcTarget;
   if(!this.wantsHp&&this.fc<=1.5){this.hpOn=false;this.z1=0;this.z2=0;this.fc=1;}
   else this.coefs();
  }
  const w0=this.w,w1=this.wTarget;
  if(!this.hpOn&&w0===1&&w1===1){
   for(let i=0;i<n;i++){ol[i]=l[i]!;or[i]=r[i]!;}
   return;
  }
  const dw=(w1-w0)/n,{b0,b1,b2,a1,a2}=this;
  let w=w0,{z1,z2}=this;
  if(this.hpOn){
   for(let i=0;i<n;i++){
    const xl=l[i]!,xr=r[i]!,m=.5*(xl+xr),s=.5*(xl-xr);
    const y=b0*s+z1;
    z1=b1*s-a1*y+z2;
    z2=b2*s-a2*y;
    if(z1<DENORMAL&&z1>-DENORMAL)z1=0;
    if(z2<DENORMAL&&z2>-DENORMAL)z2=0;
    const sw=y*w;
    ol[i]=m+sw;or[i]=m-sw;
    w+=dw;
   }
   this.z1=z1;this.z2=z2;
  }else{
   for(let i=0;i<n;i++){
    const xl=l[i]!,xr=r[i]!,m=.5*(xl+xr),sw=.5*(xl-xr)*w;
    ol[i]=m+sw;or[i]=m-sw;
    w+=dw;
   }
  }
  this.w=w1;
 }
 clear():void{this.z1=0;this.z2=0;}
}
/** Creates a stereo widener (parameters `width`, `bassMono`). */
export const createWidener=(sampleRate:number):FxDsp=>new Widener(sampleRate);
