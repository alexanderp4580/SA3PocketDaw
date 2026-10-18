import type {PresetHost} from '../audio/preset/host';
import {regionsToPlay} from '../audio/sfz/select';
import {startRegionVoice,type PresetContext} from '../audio/preset/voice';
import {toVelocity} from '../audio/preset/player';
import type {ContextPlan} from './context';
import {log} from '../log';
const scope=log.scope('melody.context');
export const CONTEXT_RATE=44100;
/** PCM16 WAV keeps uploaded context bounded and needs no codec or external service. */
export function encodePcmWav(channels:Float32Array[],rate:number):ArrayBuffer{
 const frames=channels[0]?.length??0;
 if(!frames||!Number.isInteger(rate)||rate<=0||channels.length>2||channels.some(c=>c.length!==frames))throw Error('Invalid context audio channels');
 const bytes=new ArrayBuffer(44+frames*channels.length*2),v=new DataView(bytes);
 const tag=(at:number,s:string)=>{for(let i=0;i<s.length;i++)v.setUint8(at+i,s.charCodeAt(i));};
 tag(0,'RIFF');v.setUint32(4,bytes.byteLength-8,true);tag(8,'WAVE');tag(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,channels.length,true);v.setUint32(24,rate,true);v.setUint32(28,rate*channels.length*2,true);v.setUint16(32,channels.length*2,true);v.setUint16(34,16,true);tag(36,'data');v.setUint32(40,bytes.byteLength-44,true);
 let at=44;for(let i=0;i<frames;i++)for(const c of channels){const value=c[i]!;if(!Number.isFinite(value))throw Error('Non-finite context audio');const x=Math.max(-1,Math.min(1,value));v.setInt16(at,Math.round(x*(x<0?32768:32767)),true);at+=2;}
 return bytes;
}
export function maskAndNormalize(channels:Float32Array[],rate:number,plan:Pick<ContextPlan,'maskStart'|'maskEnd'>):Float32Array[]{
 const from=Math.round(plan.maskStart*rate),to=Math.round(plan.maskEnd*rate),out=channels.map(c=>{const x=c.slice();x.fill(0,from,to);x.set(x.subarray(0,Math.min(from,x.length-to)),to);return x;});
 let peak=0;for(const c of out)for(const v of c){if(!Number.isFinite(v))throw Error('Non-finite context audio');peak=Math.max(peak,Math.abs(v));}
 if(peak<1e-7)throw Error('The piano context is silent. Add notes to a context track first.');
 const gain=.85/peak;for(const c of out)for(let i=0;i<c.length;i++)c[i]!*=gain;return out;
}
/** Dry piano rendering is independent of track sounds, effects and the live audio engine. */
export async function renderContext(plan:ContextPlan,host:PresetHost,signal?:AbortSignal){
 const check=()=>{if(signal?.aborted)throw new DOMException('Cancelled','AbortError');};check();
 const preset=await host.load('mini-piano');check();if(!preset)throw Error('The bundled Mini piano could not be loaded. Reload the app and try again.');
 const ctx=new OfflineAudioContext(2,Math.ceil(plan.seconds*CONTEXT_RATE),CONTEXT_RATE),buffers=new Map<number,AudioBuffer>();
 const plays=plan.events.map(e=>({event:e,regions:regionsToPlay(preset,e.midi,toVelocity(e.velocity))}));
 const needed=new Set(plays.flatMap(p=>p.regions.map(r=>r.region.file)));
 for(const file of needed){check();const bytes=await host.read('mini-piano',preset.files[file]!.path);check();buffers.set(file,await ctx.decodeAudioData(bytes));check();}
 for(const {event,regions} of plays)for(const play of regions)startRegionVoice(ctx as unknown as PresetContext,{play,buffer:buffers.get(play.region.file)!,when:event.when,duration:event.duration,output:ctx.destination});
 const rendered=await ctx.startRendering();check();
 const channels=maskAndNormalize([rendered.getChannelData(0),rendered.getChannelData(1)],CONTEXT_RATE,plan);
 const audio=new Blob([encodePcmWav(channels,CONTEXT_RATE)],{type:'audio/wav'});
 scope.info('piano context rendered',{seconds:plan.seconds,notes:plan.events.length,bytes:audio.size,maskStart:plan.maskStart,maskEnd:plan.maskEnd});
 return {audio,pcm:channels[0]!,sampleRate:CONTEXT_RATE};
}
