import type { InstrumentControls } from './controls';
import { InstrumentVoice } from './voice';
import type { InstrumentProfile,PreparedNote } from './types';
declare const sampleRate:number;
declare const currentFrame:number;
declare class AudioWorkletProcessor {port:MessagePort;constructor();}
declare function registerProcessor(name:string,processor:typeof AudioWorkletProcessor):void;
const MAX_SOUNDING=8,MAX_RENDERING=16,MAX_QUEUED=64,STEAL_FADE=.01;
class Processor extends AudioWorkletProcessor {
 private controls:Partial<InstrumentControls>|undefined;
 private profile:InstrumentProfile|null=null;
 private assets=new Map<number,PreparedNote>();
 private voices:Array<{voice:InstrumentVoice;start:number}>=[];
 constructor(){super();this.port.onmessage=e=>{const m=e.data;if(m.type==='profile')this.profile=m.profile;else if(m.type==='controls'){this.controls=m.controls;}else if(m.type==='assets'){this.assets.set(m.midi,m.assets);}else if(m.type==='evict'){this.assets.delete(m.midi);}else if(m.type==='stop'){this.voices=this.voices.filter(v=>v.start<=currentFrame);for(const v of this.voices)v.voice.stop(m.hard?.005:undefined);}else if(m.type==='note'&&this.profile){const assets=this.assets.get(m.midi);if(!assets)return;this.limitVoices();this.voices.push({voice:new InstrumentVoice(this.profile,assets,m.midi,sampleRate,m.duration,m.velocity,this.controls),start:Math.max(currentFrame,Math.round(m.when*sampleRate))});}};}
 /**
  * At most MAX_SOUNDING voices play and at most MAX_RENDERING voices render (sounding plus releasing): the oldest
  * sounding voice is released and the oldest rendering voice is faded out over STEAL_FADE. Queued future notes are
  * kept up to MAX_QUEUED; beyond that the oldest queued note is dropped before it has started.
  */
 private limitVoices(){
  const started=(v:{voice:InstrumentVoice;start:number})=>v.start<=currentFrame;
  let sounding=0;for(const v of this.voices)if(started(v)&&!v.voice.releasing)sounding++;
  for(let i=0;sounding>=MAX_SOUNDING&&i<this.voices.length;i++){const v=this.voices[i]!;if(started(v)&&!v.voice.releasing){v.voice.stop();sounding--;}}
  let rendering=0;for(const v of this.voices)if(started(v)&&!v.voice.done&&!v.voice.fading)rendering++;
  for(let i=0;rendering>=MAX_RENDERING&&i<this.voices.length;i++){const v=this.voices[i]!;if(started(v)&&!v.voice.done&&!v.voice.fading){v.voice.stop(STEAL_FADE);rendering--;}}
  let queued=0;for(const v of this.voices)if(!started(v))queued++;
  if(queued>=MAX_QUEUED){const i=this.voices.findIndex(v=>!started(v));if(i>=0)this.voices.splice(i,1);}
 }
 process(_inputs:Float32Array[][],outputs:Float32Array[][]):boolean{
  const out=outputs[0]?.[0];if(!out)return true;
  for(let i=this.voices.length-1;i>=0;i--){const v=this.voices[i]!,offset=Math.max(0,v.start-currentFrame);if(offset<out.length)v.voice.render(out,offset,out.length-offset);if(v.voice.done)this.voices.splice(i,1);}
  return true;
 }
}
registerProcessor('sa3-instrument',Processor);
