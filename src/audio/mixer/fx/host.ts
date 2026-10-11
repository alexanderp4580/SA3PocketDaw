import {normalizeFx,type FxKind} from './spec';
import type {FxDsp,FxFactory} from './types';
import {fxFactories} from './registry';
const BLOCK=128,FADE_SECONDS=.01;
/**
 * Runs one effect with click-free bypass. While bypassed the dry signal passes unchanged (delayed by the effect's latency
 * so both paths stay aligned); later bypass changes crossfade over 10 ms and the effect state is cleared when it is re-enabled.
 * Non-finite input is replaced by silence and a non-finite effect output clears the effect.
 */
export class FxHost {
 private dsp:FxDsp;private readonly kind:FxKind;private readonly step:number;
 private inL=new Float32Array(BLOCK);private inR=new Float32Array(BLOCK);private wetL=new Float32Array(BLOCK);private wetR=new Float32Array(BLOCK);
 private dryL:Float32Array;private dryR:Float32Array;private pos=0;private readonly lat:number;
 private amount=1;private target=1;private active=true;private configured=false;
 constructor(kind:FxKind,readonly sampleRate:number,factory:FxFactory=fxFactories[kind]!){
  this.kind=kind;this.dsp=factory(sampleRate);this.lat=this.dsp.latency|0;this.step=1/(FADE_SECONDS*sampleRate);
  this.dryL=new Float32Array(Math.max(1,this.lat));this.dryR=new Float32Array(Math.max(1,this.lat));
  this.dsp.setParams(normalizeFx(kind,{}),120);
 }
 get latency(){return this.lat;}
 get reduction(){return this.amount>0?this.dsp.reduction:0;}
 /** Applies settings (any shape; values are normalised), the bypass flag and the project tempo. */
 set(settings:unknown,bypass:boolean,bpm:number){
  this.dsp.setParams(normalizeFx(this.kind,settings),Number.isFinite(bpm)&&bpm>0?bpm:120);
  this.target=bypass?0:1;
  if(!this.configured){this.configured=true;this.amount=this.target;this.active=this.target>0;}
 }
 clear(){this.dsp.clear();this.dryL.fill(0);this.dryR.fill(0);this.pos=0;}
 process(l:Float32Array,r:Float32Array,ol:Float32Array,or:Float32Array,n:number){
  if(n>this.inL.length){this.inL=new Float32Array(n);this.inR=new Float32Array(n);this.wetL=new Float32Array(n);this.wetR=new Float32Array(n);}
  const inL=this.inL,inR=this.inR,lat=this.lat;
  for(let i=0;i<n;i++){const a=l[i]!,b=r[i]!;inL[i]=a-a===0?a:0;inR[i]=b-b===0?b:0;}
  const idle=this.amount===0&&this.target===0;
  if(idle){this.active=false;}
  else{
   if(!this.active){this.dsp.clear();this.active=true;}
   this.dsp.process(inL,inR,this.wetL,this.wetR,n);
  }
  let m=this.amount;const t=this.target,s=this.step,wl=this.wetL,wr=this.wetR;let bad=false;
  for(let i=0;i<n;i++){
   let dl=inL[i]!,dr=inR[i]!;
   if(lat>0){const p=this.pos,ql=this.dryL[p]!,qr=this.dryR[p]!;this.dryL[p]=dl;this.dryR[p]=dr;dl=ql;dr=qr;this.pos=p+1===lat?0:p+1;}
   if(m<t)m=Math.min(t,m+s);else if(m>t)m=Math.max(t,m-s);
   if(idle){ol[i]=dl;or[i]=dr;continue;}
   let a=dl*(1-m)+wl[i]!*m,b=dr*(1-m)+wr[i]!*m;
   if(!(a-a===0&&b-b===0)){a=0;b=0;bad=true;}
   ol[i]=a;or[i]=b;
  }
  this.amount=m;if(bad)this.dsp.clear();
 }
}
