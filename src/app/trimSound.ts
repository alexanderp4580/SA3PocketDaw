import {analyseInstrument} from '../audio/instrument/client';
import type {Engine} from '../audio/engine';
import {applyTrim,resolveTrim,storedTrim,type Trim} from '../audio/trim';
import {setTrackTrim} from '../store/projectModel';
import type {ProjectStore} from '../store/projectStore';

export interface TrimDeps {store:ProjectStore;engine:Engine;analyseInstrument?:typeof analyseInstrument;signal?:AbortSignal}
const cancelled=()=>Object.assign(new Error('Cancelled'),{code:'cancelled'});
/**
 * Chops a track's sound. The stored source stays whole; an instrument is analysed again from the cut source and
 * replaces the old sound only once analysis succeeds, so a failure leaves track, trim and sound unchanged.
 */
export async function applyTrackTrim(deps:TrimDeps,trackId:string,trim:Trim):Promise<void> {
 const track=deps.store.get()?.tracks.find(t=>t.id===trackId);
 if(!track?.sampleId)throw new Error('This track has no sound.');
 const sampleId=track.sampleId,sample=await deps.store.getSample(sampleId);
 if(!sample)throw new Error('Saved sound is unavailable.');
 const duration=sample.pcm.length/sample.sampleRate,kept=resolveTrim(trim,duration);
 if(sample.instrument){
  const cut=applyTrim(sample.pcm,sample.sampleRate,kept);
  const profile=await (deps.analyseInstrument??analyseInstrument)(cut,sample.sampleRate,sample.instrument.dynamics,deps.signal);
  if(deps.signal?.aborted)throw cancelled();
  if(deps.store.get()?.tracks.find(t=>t.id===trackId)?.sampleId!==sampleId)throw new Error('This track no longer has this sound.');
  await deps.store.putSample(sampleId,{...sample,instrument:profile});
  deps.engine.setInstrument(sampleId,profile);
 }
 deps.store.update(p=>setTrackTrim(p,trackId,storedTrim(kept,duration)));
 const next=deps.store.get();if(next)deps.engine.setProject(next);
}
