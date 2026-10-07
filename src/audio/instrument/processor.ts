import type { InstrumentControls } from './controls';
import { InstrumentVoice } from './voice';
import type { InstrumentProfile,PreparedNote } from './types';
declare const sampleRate:number;
declare const currentFrame:number;
declare class AudioWorkletProcessor {port:MessagePort;constructor();}
declare function registerProcessor(name:string,processor:typeof AudioWorkletProcessor):void;
class Processor extends AudioWorkletProcessor {
 private controls:Partial<InstrumentControls>|undefined;
 private profile:InstrumentProfile|null=null;
 private assets=new Map<number,PreparedNote>();
 private voices:Array<{voice:InstrumentVoice;start:number}>=[];
 constructor(){super();this.port.onmessage=e=>{const m=e.data;if(m.type==='profile')this.profile=m.profile;else if(m.type==='controls'){this.controls=m.controls;}else if(m.type==='assets'){this.assets.set(m.midi,m.assets);}else if(m.type==='evict'){this.assets.delete(m.midi);}else if(m.type==='stop'){this.voices=this.voices.filter(v=>v.start<=currentFrame);for(const v of this.voices)v.voice.stop(m.hard?.005:undefined);}else if(m.type==='note'&&this.profile){const assets=this.assets.get(m.midi);if(!assets)return;if(this.voices.length>=8){this.voices[0]!.voice.stop();if(this.voices.length>=16)this.voices.shift();}this.voices.push({voice:new InstrumentVoice(this.profile,assets,m.midi,sampleRate,m.duration,m.velocity,this.controls),start:Math.max(currentFrame,Math.round(m.when*sampleRate))});}};}
 process(_inputs:Float32Array[][],outputs:Float32Array[][]):boolean{
  const out=outputs[0]?.[0];if(!out)return true;
  for(let i=this.voices.length-1;i>=0;i--){const v=this.voices[i]!,offset=Math.max(0,v.start-currentFrame);if(offset<out.length)v.voice.render(out,offset,out.length-offset);if(v.voice.done)this.voices.splice(i,1);}
  return true;
 }
}
registerProcessor('sa3-instrument',Processor);
