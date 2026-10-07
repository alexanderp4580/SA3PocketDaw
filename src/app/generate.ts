import {resolveSampleControls,type SampleControls} from '../audio/sampleControls';
import { detectPitch, rootFromDetection } from '../audio/pitch';
import { prepareSample,mixToMono,resample } from '../audio/samplePrep';
import { analyseInstrument } from '../audio/instrument/client';
import type { InstrumentProfile } from '../audio/instrument/types';
import {resolveControls,type InstrumentControls} from '../audio/instrument/controls';
import type { Engine } from '../audio/engine';
import type { GenerationOutput } from '../gen/client';
import type { GenerateParams } from '../gen/protocol';
import type { ProjectStore } from '../store/projectStore';
import { newId, addTrack, setTrackSample, setRoot } from '../store/projectModel';

export interface GeneratedResult {
  trackId:string;
  mode:'sample'|'instrument';
  sampleId: string;
  pcm: Float32Array;
  sampleRate: number;
  rootMidi: number;
  lowConfidence: boolean;
}

export interface PreparationOptions {analyseInstrument?:typeof analyseInstrument;signal?:AbortSignal;onAnalysis?:(f:number)=>void;dynamics?:'sustain'|'decay'}
export interface GeneratedDraft {sampleControls?:SampleControls;instrumentControls?:InstrumentControls;mode:'sample'|'instrument';pcm:Float32Array;sampleRate:number;rootMidi:number;lowConfidence:boolean;record:import('../store/projectStore').StoredSample}
/** The model finished, but its audio could not be turned into an instrument; the audio is still usable as a sample. */
export class InstrumentAnalysisError extends Error{readonly code='instrument-rejected' as const;constructor(message:string){super(message);this.name='InstrumentAnalysisError';}}
/** Prepare an auditionable draft; no project or sample store changes happen here. */
export async function prepareGeneration(params:GenerateParams,userPrompt:string,output:GenerationOutput,deps:PreparationOptions={}):Promise<GeneratedDraft>{
  const mode=params.mode??'sample';
  let instrument:InstrumentProfile|undefined;
  if(mode==='instrument'){try{instrument=await (deps.analyseInstrument??analyseInstrument)(resample(mixToMono(output.channels),output.sampleRate,44100),44100,deps.dynamics??(/piano|guitar|pluck|bell|mallet/i.test(userPrompt)?'decay':'sustain'),deps.signal,deps.onAnalysis);}catch(e){if((e as {code?:string}).code==='cancelled')throw e;throw new InstrumentAnalysisError(e instanceof Error?e.message:String(e));}}
  if(deps.signal?.aborted)throw Object.assign(new Error('Cancelled'),{code:'cancelled'});
  const prep = instrument?{pcm:instrument.pcm,sampleRate:instrument.sampleRate}:prepareSample(output.channels, output.sampleRate);
  if (prep.pcm.length === 0) throw new Error('The model produced silence. Try another prompt or seed.');
  const pitch = instrument?{midi:69+12*Math.log2(instrument.hz/440),hz:instrument.hz,confidence:1,cents:0,candidates:[]}:detectPitch(prep.pcm, prep.sampleRate);
  const root = rootFromDetection(pitch);
  return {mode,pcm:prep.pcm,sampleRate:prep.sampleRate,rootMidi:root.midi,lowConfidence:root.lowConfidence,record:{instrument,pcm:prep.pcm,sampleRate:prep.sampleRate,meta: {
      mode,fullPrompt:params.prompt,
      prompt: userPrompt,
      model: params.model,
      seed: params.seed,
      steps: params.steps,
      seconds: params.seconds,
      generatedAt: Date.now(),
      detectedMidi: pitch.midi,
      confidence: pitch.confidence,
    }}};
}
/** Draft edits stay local until accepted, leaving the source analysis untouched. */
export function tweakDraft(draft:GeneratedDraft,patch:Partial<InstrumentControls>):GeneratedDraft {
 if(!draft.record.instrument)return draft;
 return {...draft,instrumentControls:resolveControls({...draft.instrumentControls,...patch},draft.record.instrument.dynamics)};
}
/** Sample edits stay in the draft until accepted. */
export function tweakSampleDraft(draft:GeneratedDraft,patch:Partial<SampleControls>):GeneratedDraft {
 if(draft.record.instrument)return draft;
 return {...draft,sampleControls:resolveSampleControls({...draft.sampleControls,...patch})};
}
/** Use is the commit point: persist the draft and assign it to this track. */
export async function useGeneration(deps:{store:ProjectStore;engine:Engine;signal?:AbortSignal},trackId:string|null,draft:GeneratedDraft,idFactory:()=>string=()=>newId('s')):Promise<GeneratedResult>{
 if(deps.signal?.aborted)throw Object.assign(new Error('Cancelled'),{code:'cancelled'});
 if(!deps.store.get()||(trackId!==null&&!deps.store.get()?.tracks.some(t=>t.id===trackId)))throw new Error('This track no longer exists.');
 const sampleId=idFactory();await deps.store.putSample(sampleId,draft.record);
 if(deps.signal?.aborted||!deps.store.get()||(trackId!==null&&!deps.store.get()?.tracks.some(t=>t.id===trackId))){await deps.store.deleteSample(sampleId);throw Object.assign(new Error('Cancelled'),{code:'cancelled'});}
 if(draft.record.instrument)deps.engine.setInstrument(sampleId,draft.record.instrument);else deps.engine.setSample(sampleId,draft.pcm,draft.sampleRate);
 const targetId=trackId??newId('t');
 deps.store.update(p=>{let next=setTrackSample(trackId===null?addTrack(p,`${draft.mode==='instrument'?'Instrument':'Sample'} ${p.tracks.length+1}`,targetId):p,targetId,sampleId,draft.rootMidi,draft.mode);if(draft.sampleControls&&!draft.record.instrument)next={...next,tracks:next.tracks.map(t=>t.id===targetId?{...t,sampleControls:resolveSampleControls(draft.sampleControls)}:t)};return draft.record.instrument&&draft.instrumentControls?{...next,tracks:next.tracks.map(t=>t.id===targetId?{...t,instrumentControls:resolveControls(draft.instrumentControls,draft.record.instrument!.dynamics)}:t)}:next;});const next=deps.store.get();if(next)deps.engine.setProject(next);
 return {trackId:targetId,sampleId,mode:draft.mode,pcm:draft.pcm,sampleRate:draft.sampleRate,rootMidi:draft.rootMidi,lowConfidence:draft.lowConfidence};
}
export async function applyGeneration(deps:{store:ProjectStore;engine:Engine}&PreparationOptions,trackId:string,params:GenerateParams,userPrompt:string,output:GenerationOutput,idFactory:()=>string=()=>newId('s')):Promise<GeneratedResult>{
 return useGeneration(deps,trackId,await prepareGeneration(params,userPrompt,output,deps),idFactory);
}

/** Moves a track's root by semitones and syncs the engine. */
export function shiftRoot(deps: { store: ProjectStore; engine: Engine }, trackId: string, delta: number): void {
  const track = deps.store.get()?.tracks.find((t) => t.id === trackId);
  if (!track) return;
  deps.store.update((p) => setRoot(p, trackId, track.rootMidi + delta));
  const next = deps.store.get();
  if (next) deps.engine.setProject(next);
}
