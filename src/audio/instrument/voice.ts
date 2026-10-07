import { resolveControls,type InstrumentControls } from './controls';
import { noteHz } from './prepare';
import type { InstrumentProfile,PreparedNote } from './types';
function read(x:Float32Array,j:number,mix:number):number{return (x[j]??0)*(1-mix)+(x[j+1]??0)*mix;}
/** Allocation-free render loop shared by tests and the AudioWorklet processor. */
export class InstrumentVoice {
 private frame=0;
 private phases:Float64Array;
 private steps:Float64Array;
 private stopAt:number;
 readonly endFrame:number;
 private controls:InstrumentControls;
 constructor(private p:InstrumentProfile,private assets:PreparedNote,midi:number,private rate:number,duration:number,private velocity:number,controls?:Partial<InstrumentControls>){
  this.controls=resolveControls(controls,p.dynamics);
  this.stopAt=duration;this.endFrame=Math.ceil((duration+this.controls.release)*rate);this.phases=Float64Array.from(p.partials,x=>x.phase);this.steps=Float64Array.from(p.partials,x=>noteHz(midi)*x.ratio<Math.min(rate,p.sampleRate)*.47?2*Math.PI*noteHz(midi)*x.ratio/rate:0);
 }
 stop(fade?:number):void {if(fade!==undefined)this.controls={...this.controls,release:Math.min(this.controls.release,fade)};this.stopAt=Math.min(this.stopAt,this.frame/this.rate);}
 get done():boolean{return this.frame/this.rate>=this.stopAt+this.controls.release;}
 render(output:Float32Array,offset:number,length:number):void {
  const p=this.p,end=(p.partials[0]!.amplitudes.length-1)*p.hop/p.sampleRate,hold=Math.max(.12,Math.min(.8,end*.65));
  for(let i=offset;i<offset+length;i++,this.frame++){
   const t=this.frame/this.rate;if(t>=this.stopAt+this.controls.release)continue;let body=0;
   const at=Math.min(this.controls.behavior==='sustain'?Math.min(t,hold):t,end)*p.sampleRate/p.hop,k=Math.floor(at),f=at-k;
   for(let q=0;q<p.partials.length;q++){if(!this.steps[q])continue;const partial=p.partials[q]!,a=partial.amplitudes;let amp=a[Math.min(k,a.length-1)]!*(1-f)+a[Math.min(k+1,a.length-1)]!*f;if(this.controls.behavior==='decay'&&t>end)amp*=Math.exp(partial.decay*(t-end));body+=amp*Math.cos(this.phases[q]!);this.phases[q]!+=this.steps[q]!;if(this.phases[q]!>Math.PI*2)this.phases[q]!-=Math.PI*2;}
   const pos=t*p.sampleRate,j=Math.floor(pos),mix=pos-j;
   body+=read(this.assets.residual,j,mix);const cross=Math.max(0,Math.min(1,(t-.035)/.055)),transition=.5-.5*Math.cos(Math.PI*cross),attack=read(this.assets.attack,j,mix);
   const release=Math.max(0,Math.min(1,(this.stopAt+this.controls.release-t)/this.controls.release)),env=Math.min(1,t/this.controls.attack)*release*release;
   output[i]!+=(attack*(1-transition)+body*transition)*env*this.velocity*p.gain;
  }
 }
}
