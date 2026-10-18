import type {CloudParams} from '../gen/cloud';
import type {ContextPlan} from './context';
import {downmixToMono,resampleSinc} from '../transcribe/resample';
import {barSeconds,notesForBars} from './take';
import {EmptyBarsError,type BarsRequest,type BarsAudio,type BarsTake} from './pipeline';
import type {TranscribedNote} from '../transcribe/notes';
export interface ContextPorts {
 render:(plan:ContextPlan)=>Promise<{audio:Blob;pcm:Float32Array;sampleRate:number}>;
 generate:(params:CloudParams)=>Promise<BarsAudio>;
 transcribe:(audio:Float32Array)=>Promise<TranscribedNote[]>;
 signal?:AbortSignal;
 progress?:(message:string)=>void;
}
/** Only the regenerated region reaches transcription; context detections never enter the accepted take. */
export async function generateContextBars(r:BarsRequest,plan:ContextPlan,p:ContextPorts):Promise<BarsTake>{
 const check=()=>{if(p.signal?.aborted)throw new DOMException('Cancelled','AbortError');};
 check();p.progress?.('Rendering piano context');const input=await p.render(plan);check();
 p.progress?.('Generating with your song');
 const prompt=`Instruments: Piano. ${r.bpm} BPM, ${r.key} ${r.scale}, 4/4 time. Continue the piano music in the gap with a complementary melodic part that follows the surrounding harmony and rhythm. Clear piano notes, no vocals or other instruments. ${r.style.trim()}`;
 const output=await p.generate({prompt,seconds:plan.seconds,steps:8,seed:r.seed,inpaint:{audio:input.audio,maskStart:plan.maskStart,maskEnd:plan.maskEnd}});check();
 const rate=output.sampleRate,from=Math.round(plan.maskStart*rate),to=Math.round(plan.maskEnd*rate);
 if(!Number.isFinite(rate)||rate<=0||!output.channels.length||output.channels.some(c=>c.length<to))throw Error('The generated audio is too short for the selected bars. Try a fresh take.');
 const channels=output.channels.map(c=>c.slice(from,to)),pcm=downmixToMono(channels);p.progress?.('Transcribing the new bars');
 const raw=await p.transcribe(resampleSinc(pcm,rate,16000).slice());check();
 // Context is silent inside this crop; matching pitches/onsets are valid new unisons or repeats.
 const notes=notesForBars(raw,r.bpm,r.startBar,r.bars);
 const take={notes,raw,pcm,sampleRate:rate,seconds:barSeconds(r.bars,r.bpm),removed:0,contextual:true};
 if(!notes.length)throw new EmptyBarsError('No playable piano notes were detected in the generated bars. Listen to the generated audio below.',take,{channels,sampleRate:rate});
 return take;
}
