import type { InstrumentControls } from './controls';
import { InstrumentVoice } from './voice';
import type { InstrumentProfile,PreparedNote } from './types';
declare const sampleRate:number;
declare const currentFrame:number;
declare class AudioWorkletProcessor {port:MessagePort;constructor();}
declare function registerProcessor(name:string,processor:typeof AudioWorkletProcessor):void;
const MAX_SOUNDING=8,MAX_QUEUED=64;
class Processor extends AudioWorkletProcessor {
 private controls:Partial<InstrumentControls>|undefined;
 private profile:InstrumentProfile|null=null;
 private assets=new Map<number,PreparedNote>();
 private voices:Array<{voice:InstrumentVoice;start:number}>=[];
 constructor(){super();this.port.onmessage=e=>{const m=e.data;if(m.type==='profile')this.profile=m.profile;else if(m.type==='controls'){this.controls=m.controls;}else if(m.type==='assets'){this.assets.set(m.midi,m.assets);}else if(m.type==='evict'){this.assets.delete(m.midi);}else if(m.type==='stop'){this.voices=this.voices.filter(v=>v.start<=currentFrame);for(const v of this.voices)v.voice.stop(m.hard?.005:undefined);}else if(m.type==='note'&&this.profile){const assets=this.assets.get(m.midi);if(!assets)return;this.limitVoices();this.voices.push({voice:new InstrumentVoice(this.profile,assets,m.midi,sampleRate,m.duration,m.velocity,this.controls),start:Math.max(currentFrame,Math.round(m.when*sampleRate))});}};}
 /** At most MAX_SOUNDING voices play; the oldest sounding one is released. Queued future notes are kept up to MAX_QUEUED. */
 private limitVoices(){let sounding=0;for(const v of this.voices)if(v.start<=currentFrame&&!v.voice.releasing)sounding++;for(let i=0;sounding>=MAX_SOUNDING&&i<this.voices.length;i++){const v=this.voices[i]!;if(v.start<=currentFrame&&!v.voice.releasing){v.voice.stop();sounding--;}}if(this.voices.length>=MAX_QUEUED)this.voices.shift();}
 process(_inputs:Float32Array[][],outputs:Float32Array[][]):boolean{
  const out=outputs[0]?.[0];if(!out)return true;
  for(let i=this.voices.length-1;i>=0;i--){const v=this.voices[i]!,offset=Math.max(0,v.start-currentFrame);if(offset<out.length)v.voice.render(out,offset,out.length-offset);if(v.voice.done)this.voices.splice(i,1);}
  return true;
 }
}
registerProcessor('sa3-instrument',Processor);
