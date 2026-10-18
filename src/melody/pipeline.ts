import {downmixToMono,resampleSinc} from '../transcribe/resample';
import type {Note} from '../store/projectModel';
import type {TranscribedNote} from '../transcribe/notes';
import {barSeconds,melodyPrompt,notesForBars} from './take';
export interface BarsTake {notes:Note[];raw:TranscribedNote[];pcm:Float32Array;sampleRate:number;seconds:number;removed?:number;contextual?:boolean}
/** Keep failed audio available for audition and diagnosis without treating it as accepted notes. */
export class EmptyBarsError extends Error {
 readonly diagnostics;
 constructor(message:string,readonly take:BarsTake,readonly audio:BarsAudio){
  super(message);this.name='EmptyBarsError';
  let peak=0,sum=0;for(const x of take.pcm){peak=Math.max(peak,Math.abs(x));sum+=x*x;}
  const pitches=take.raw.map(n=>n.pitch).filter(Number.isFinite);
  this.diagnostics={contextual:!!take.contextual,sampleRate:take.sampleRate,audioSeconds:take.pcm.length/take.sampleRate,peak,rms:take.pcm.length?Math.sqrt(sum/take.pcm.length):0,rawNoteCount:take.raw.length,playableNoteCount:take.notes.length,pitchMin:pitches.length?Math.min(...pitches):null,pitchMax:pitches.length?Math.max(...pitches):null};
 }
}
export interface BarsRequest {bpm:number;key:string;scale:string;startBar:number;bars:number;style:string;seed:number}
export interface BarsAudio {channels:Float32Array[];sampleRate:number}
export interface BarsPorts {
 generate:(p:{prompt:string;seconds:number;seed:number})=>Promise<BarsAudio>;
 transcribe:(audio:Float32Array)=>Promise<TranscribedNote[]>;
 signal?:AbortSignal;
 progress?:(message:string)=>void;
}
export async function generateBars(r:BarsRequest,p:BarsPorts):Promise<BarsTake>{
 const check=()=>{if(p.signal?.aborted)throw new DOMException('Cancelled','AbortError');};
 const seconds=barSeconds(r.bars,r.bpm);
 if(!Number.isInteger(r.bars)||r.bars<1||r.bars>4||!Number.isInteger(r.startBar)||r.startBar<1||!Number.isFinite(seconds)||seconds<=0||seconds>12)throw Error('Choose up to 4 bars fitting within 12 seconds at this tempo.');
 check();p.progress?.('Generating piano audio');
 const audio=await p.generate({prompt:melodyPrompt(r.style,r.bpm,r.key,r.scale,r.bars),seconds,seed:r.seed});
 check();p.progress?.('Preparing audio for transcription');
 const mono=downmixToMono(audio.channels),input=resampleSinc(mono,audio.sampleRate,16000).slice();
 check();p.progress?.('Transcribing piano notes');
 const raw=await p.transcribe(input);check();
 const notes=notesForBars(raw,r.bpm,r.startBar,r.bars);
 const take={notes,raw,pcm:mono,sampleRate:audio.sampleRate,seconds};
 if(!notes.length)throw new EmptyBarsError('No playable notes were detected in these bars. Listen to the generated audio below.',take,audio);
 return take;
}
