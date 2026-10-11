import type {FxDsp} from './types';
import {defaultFx} from './spec';

/** Bit-depth and sample-rate reduction: sample-and-hold every N frames, quantised to 2^bits levels over +-1. */
class Bitcrusher implements FxDsp{
 readonly latency=0;
 reduction=0;
 private delta=2**-7;
 private inv=2**7;
 private hold=4;
 private count=0;
 private heldL=0;
 private heldR=0;
 private mix=1;
 private mixTarget=1;
 private snap=true;
 constructor(_sampleRate:number){
  this.setParams(defaultFx('bitcrusher'),120);
  this.snap=true;
 }
 setParams(p:Readonly<Record<string,number>>,_bpm:number):void{
  const bits=Math.round(Math.min(16,Math.max(1,p.bits!)));
  this.delta=2**(1-bits);
  this.inv=1/this.delta;
  this.hold=Math.round(Math.min(32,Math.max(1,p.downsample!)));
  if(this.count>=this.hold)this.count=0;
  this.mixTarget=Math.min(1,Math.max(0,p.mix!/100));
  if(this.snap)this.mix=this.mixTarget;
  this.snap=false;
 }
 process(l:Float32Array,r:Float32Array,ol:Float32Array,or:Float32Array,n:number):void{
  const {delta,inv,hold}=this;
  let {count,heldL,heldR,mix}=this;
  const step=(this.mixTarget-mix)/n;
  for(let i=0;i<n;i++){
   const xl=l[i]!,xr=r[i]!;
   if(count===0){
    let a=delta*Math.round(xl*inv),b=delta*Math.round(xr*inv);
    a=a>1?1:a<-1?-1:a;
    b=b>1?1:b<-1?-1:b;
    heldL=a;heldR=b;
   }
   if(++count>=hold)count=0;
   ol[i]=xl+(heldL-xl)*mix;
   or[i]=xr+(heldR-xr)*mix;
   mix+=step;
  }
  this.count=count;this.heldL=heldL;this.heldR=heldR;
  this.mix=this.mixTarget;
 }
 clear():void{this.count=0;this.heldL=0;this.heldR=0;}
}
/** Creates a bitcrusher (parameters `bits`, `downsample`, `mix`). */
export const createBitcrusher=(sampleRate:number):FxDsp=>new Bitcrusher(sampleRate);
