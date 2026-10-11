import { expect,it } from 'vitest';
import { InstrumentVoice } from './voice';
import { noteHz } from './prepare';
import { resolveControls,type InstrumentControls } from './controls';
import type { InstrumentProfile,PreparedNote } from './types';
const SR=48000,HOP=512;
function profile(partials:number):InstrumentProfile {
 const count=Math.ceil(2*SR/HOP);
 return {version:1,hz:220,sampleRate:SR,hop:HOP,pcm:new Float32Array(SR),residual:new Float32Array(SR),harmonicEnergy:1,dynamics:'sustain',gain:.8,
  partials:Array.from({length:partials},(_,i)=>({ratio:(i+1)*(1+i*.0004),phase:i*.7,decay:-.8-i*.1,amplitudes:Float32Array.from({length:count},(_,j)=>.2/(i+1)*(.6+.4*Math.sin(j*.05+i)))}))};
}
function assets():PreparedNote {
 return {attack:Float32Array.from({length:Math.round(.09*SR)},(_,i)=>.3*Math.sin(i*.07)),residual:Float32Array.from({length:SR},(_,i)=>.05*Math.sin(i*.31))};
}
/** Direct per-sample evaluation of the voice definition, used as the reference. */
function reference(p:InstrumentProfile,a:PreparedNote,midi:number,duration:number,velocity:number,partial:Partial<InstrumentControls>,frames:number,stopFrame=Infinity):Float32Array {
 const c=resolveControls(partial,p.dynamics),out=new Float32Array(frames),end=(p.partials[0]!.amplitudes.length-1)*p.hop/p.sampleRate,hold=Math.max(.12,Math.min(.8,end*.65));
 const phases=p.partials.map(x=>x.phase),steps=p.partials.map(x=>noteHz(midi)*x.ratio<Math.min(SR,p.sampleRate)*.47?2*Math.PI*noteHz(midi)*x.ratio/SR:0);
 let stopAt=duration;const read=(x:Float32Array,j:number,m:number)=>(x[j]??0)*(1-m)+(x[j+1]??0)*m;
 for(let f=0;f<frames;f++){
  if(f===stopFrame)stopAt=Math.min(stopAt,f/SR);
  const t=f/SR;if(t>=stopAt+c.release)continue;let body=0;
  const at=Math.min(c.behavior==='sustain'?Math.min(t,hold):t,end)*p.sampleRate/p.hop,k=Math.floor(at),fr=at-k;
  for(let q=0;q<p.partials.length;q++){if(!steps[q])continue;const am=p.partials[q]!.amplitudes;let amp=am[Math.min(k,am.length-1)]!*(1-fr)+am[Math.min(k+1,am.length-1)]!*fr;if(c.behavior==='decay'&&t>end)amp*=Math.exp(p.partials[q]!.decay*(t-end));body+=amp*Math.cos(phases[q]!);phases[q]!+=steps[q]!;}
  const pos=t*p.sampleRate,j=Math.floor(pos),mix=pos-j;body+=read(a.residual,j,mix);
  const cross=Math.max(0,Math.min(1,(t-.035)/.055)),tr=.5-.5*Math.cos(Math.PI*cross),attack=read(a.attack,j,mix);
  const rel=Math.max(0,Math.min(1,(stopAt+c.release-t)/c.release)),env=Math.min(1,t/c.attack)*rel*rel;
  out[f]=(attack*(1-tr)+body*tr)*env*velocity*p.gain;
 }
 return out;
}
/** Renders in 128-frame blocks like the worklet; `stopFrame` is a multiple of 128. */
function rendered(p:InstrumentProfile,a:PreparedNote,midi:number,duration:number,velocity:number,partial:Partial<InstrumentControls>,frames:number,stopFrame=Infinity):{out:Float32Array;voice:InstrumentVoice} {
 const voice=new InstrumentVoice(p,a,midi,SR,duration,velocity,partial),out=new Float32Array(frames);
 for(let at=0;at<frames;at+=128){if(at===stopFrame)voice.stop();voice.render(out,at,Math.min(128,frames-at));}
 return {out,voice};
}
const maxDiff=(a:Float32Array,b:Float32Array)=>{let m=0;for(let i=0;i<a.length;i++)m=Math.max(m,Math.abs(a[i]!-b[i]!));return m;};
for(const behavior of ['sustain','decay'] as const)
 it(`matches the per-sample definition for ${behavior} voices`,()=>{
  const p=profile(24),a=assets(),frames=SR*3,controls={behavior,attack:.01,release:.3,brightness:1};
  const {out}=rendered(p,a,60,1.7,.9,controls,frames),expected=reference(p,a,60,1.7,.9,controls,frames);
  expect(maxDiff(out,new Float32Array(out.length))).toBeGreaterThan(.01);
  expect(maxDiff(out,expected)).toBeLessThan(1e-4);
 });
it('matches the definition after stop and skips partials above the usable band',()=>{
 const p=profile(64),a=assets(),frames=SR*2,stopFrame=128*200,controls={behavior:'decay' as const,release:.2};
 const {out,voice}=rendered(p,a,84,5,1,controls,frames,stopFrame);
 expect(maxDiff(out,reference(p,a,84,5,1,controls,frames,stopFrame))).toBeLessThan(1e-4);
 expect(voice.done).toBe(true);
});

it('fades an already releasing voice out over the requested time without a jump',()=>{
 const profile={sampleRate:48000,hop:512,dynamics:'sustain' as const,gain:1,partials:[{ratio:1,amplitudes:new Float32Array(100).fill(.2),phase:0,decay:-1}]};
 const a=new Float32Array(48000).fill(.2),v=new InstrumentVoice(profile,{attack:a,residual:new Float32Array(48000)},57,48000,.01,1,{release:2});
 const buf=new Float32Array(4800);v.render(buf,0,4800);expect(v.releasing).toBe(true);
 v.stop(.01);expect(v.fading).toBe(true);
 const out=new Float32Array(960);v.render(out,0,960);
 expect(v.done).toBe(true);expect(out[959]).toBe(0);
});
