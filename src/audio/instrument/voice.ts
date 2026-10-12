import { resolveControls,type InstrumentControls } from './controls';
import { noteHz } from './prepare';
import type { InstrumentProfile,PreparedNote } from './types';
function read(x:Float32Array,j:number,mix:number):number{return (x[j]??0)*(1-mix)+(x[j+1]??0)*mix;}
/** Allocation-free render loop shared by tests and the AudioWorklet processor. */
export class InstrumentVoice {
 private frame=0;
 /** Oscillator state per active partial: cosine, sine and the per-sample rotation. */
 private cos:Float64Array;
 private sin:Float64Array;
 private rotCos:Float64Array;
 private rotSin:Float64Array;
 private amps:Float32Array[];
 private tail:Float64Array;
 private tailStep:Float64Array;
 private decays:Float64Array;
 private tailing=false;
 private stopAt:number;
 /** Steal ramp: start time and length in seconds, -1 when none. */
 private fadeStart=-1;
 private fadeLen=0;
 readonly endFrame:number;
 private controls:InstrumentControls;
 constructor(private p:InstrumentProfile,private assets:PreparedNote,midi:number,private rate:number,duration:number,private velocity:number,controls?:Partial<InstrumentControls>,maxPartials=Infinity){
  this.controls=resolveControls(controls,p.dynamics);
  this.stopAt=duration;this.endFrame=Math.ceil((duration+this.controls.release)*rate);
  const hz=noteHz(midi),limit=Math.min(rate,p.sampleRate)*.47;let active=p.partials.filter(x=>hz*x.ratio<limit);
  if(active.length>maxPartials){const peak=new Map(active.map(x=>{let m=0;for(const a of x.amplitudes)if(a>m)m=a;return [x,m] as const;})),keep=new Set([...active].sort((a,b)=>peak.get(b)!-peak.get(a)!).slice(0,Math.max(1,Math.floor(maxPartials))));active=active.filter(x=>keep.has(x));}
  this.amps=active.map(x=>x.amplitudes);
  this.cos=Float64Array.from(active,x=>Math.cos(x.phase));this.sin=Float64Array.from(active,x=>Math.sin(x.phase));
  this.rotCos=Float64Array.from(active,x=>Math.cos(2*Math.PI*hz*x.ratio/rate));this.rotSin=Float64Array.from(active,x=>Math.sin(2*Math.PI*hz*x.ratio/rate));
  this.tail=new Float64Array(active.length);this.tailStep=Float64Array.from(active,x=>Math.exp(x.decay/rate));
  this.decays=Float64Array.from(active,x=>x.decay);
 }
 /** Ends the note now. With `fade`, the voice reaches silence within that many seconds, also when it is already releasing. */
 stop(fade?:number):void {
  const now=this.frame/this.rate;
  if(fade!==undefined&&this.releasing){if(this.fadeStart<0){this.fadeStart=now;this.fadeLen=Math.max(fade,1/this.rate);}return;}
  if(fade!==undefined)this.controls={...this.controls,release:Math.min(this.controls.release,fade)};
  this.stopAt=Math.min(this.stopAt,now);
 }
 /** True while a steal ramp is running. */
 get fading():boolean{return this.fadeStart>=0;}
 /** True once the note has ended or been stopped and only its release remains. */
 get releasing():boolean{return this.frame/this.rate>=this.stopAt;}
 get done():boolean{const t=this.frame/this.rate;return t>=this.stopAt+this.controls.release||(this.fadeStart>=0&&t>=this.fadeStart+this.fadeLen);}
 /** Partials advance by complex rotation rather than a cosine per sample; the phasors are renormalized every block. */
 render(output:Float32Array,offset:number,length:number):void {
  const p=this.p,c=this.controls,n=this.amps.length,cos=this.cos,sin=this.sin,rc=this.rotCos,rs=this.rotSin,amps=this.amps,tail=this.tail;
  const end=(p.partials[0]!.amplitudes.length-1)*p.hop/p.sampleRate,hold=Math.max(.12,Math.min(.8,end*.65)),sustain=c.behavior==='sustain',decay=c.behavior==='decay';
  const last=n?amps[0]!.length-1:0,hopScale=p.sampleRate/p.hop,stopEnd=this.stopAt+c.release,gain=this.velocity*p.gain;
  for(let i=offset;i<offset+length;i++,this.frame++){
   const t=this.frame/this.rate;if(t>=stopEnd)continue;const ramp=this.fadeStart<0?1:Math.max(0,1-(t-this.fadeStart)/this.fadeLen);if(ramp===0)continue;let body=0;
   const at=Math.min(sustain?Math.min(t,hold):t,end)*hopScale,k=Math.floor(at),f=at-k,k0=Math.min(k,last),k1=Math.min(k+1,last),g=1-f;
   if(decay&&t>end&&!this.tailing){this.tailing=true;for(let q=0;q<n;q++)tail[q]=Math.exp(this.decays[q]!*(t-end));}
   if(this.tailing){for(let q=0;q<n;q++){const a=amps[q]!,x=cos[q]!,y=sin[q]!;body+=(a[k0]!*g+a[k1]!*f)*tail[q]!*x;tail[q]!*=this.tailStep[q]!;cos[q]=x*rc[q]!-y*rs[q]!;sin[q]=y*rc[q]!+x*rs[q]!;}}
   else for(let q=0;q<n;q++){const a=amps[q]!,x=cos[q]!,y=sin[q]!;body+=(a[k0]!*g+a[k1]!*f)*x;cos[q]=x*rc[q]!-y*rs[q]!;sin[q]=y*rc[q]!+x*rs[q]!;}
   const pos=t*p.sampleRate,j=Math.floor(pos),mix=pos-j;
   body+=read(this.assets.residual,j,mix);const cross=Math.max(0,Math.min(1,(t-.035)/.055)),transition=.5-.5*Math.cos(Math.PI*cross),attack=read(this.assets.attack,j,mix);
   const release=Math.max(0,Math.min(1,(stopEnd-t)/c.release)),env=Math.min(1,t/c.attack)*release*release*ramp;
   output[i]!+=(attack*(1-transition)+body*transition)*env*gain;
  }
  for(let q=0;q<n;q++){const m=Math.hypot(cos[q]!,sin[q]!);if(m>0){cos[q]=cos[q]!/m;sin[q]=sin[q]!/m;}}
 }
}
