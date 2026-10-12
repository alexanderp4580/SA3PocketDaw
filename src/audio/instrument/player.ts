import { brightnessHz,resolveControls,type InstrumentControls } from './controls';
import processorUrl from './processor.ts?worker&url';
import { prepareInstrumentNote } from './client';
import { assetLimit,createAssetCache,hardAssetLimit } from './assetCache';
import { chooseNoteAssets } from './noteAssets';
import { log } from '../../log';
import type { InstrumentProfile,PreparedNote } from './types';
const scope=log.scope('instrument.player');
/** The fallback pitch is chosen this long before a note is due so its message reaches the worklet in time. */
const DUE_MARGIN_MS=15,NEAR_SEMITONES=2,MIN_NOTE_SEC=.03;
const loaded=new WeakMap<AudioContext,Promise<void>>();
export async function createInstrumentPlayer(ctx:AudioContext,output:AudioNode,profile:InstrumentProfile){
 let module=loaded.get(ctx);if(!module){module=ctx.audioWorklet.addModule(processorUrl);loaded.set(ctx,module);}await module;
 const node=new AudioWorkletNode(ctx,'sa3-instrument',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[1]});const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.Q.value=.707;filter.frequency.value=brightnessHz(1,ctx.sampleRate);node.connect(filter);filter.connect(output);node.port.postMessage({type:'profile',profile});
 const assets=createAssetCache<PreparedNote>({limit:assetLimit(profile.residual.length),hardLimit:hardAssetLimit(profile.residual.length),load:midi=>prepareInstrumentNote(profile,midi),
  install:(midi,prepared)=>node.port.postMessage({type:'assets',midi,assets:prepared},[prepared.attack.buffer,prepared.residual.buffer]),
  evict:midi=>node.port.postMessage({type:'evict',midi})});
 const prepare=(midi:number)=>assets.ensure(midi);
 let epoch=0,disposed=false;
 return {prepare,
  /** Pitches this player is about to play; they stay installed until the hard limit. */
  retain(midis:Iterable<number>){assets.retain(midis);},
  /** Prepares missing pitches one at a time, so the audio thread is not starved by several concurrent preparations. */
  async prefetch(midis:Iterable<number>){for(const m of new Set(midis)){if(disposed)return;if(!assets.has(m)){try{await assets.ensure(m);}catch(e){scope.warn('prefetch failed',{midi:m,error:String(e)});}}}},
  setControls(value?:Partial<InstrumentControls>){const controls=resolveControls(value,profile.dynamics);filter.frequency.setTargetAtTime(brightnessHz(controls.brightness,ctx.sampleRate),ctx.currentTime,.02);node.port.postMessage({type:'controls',controls});},
  async note(midi:number,when:number,duration:number,velocity:number){
   const token=epoch,dueMs=Math.max(0,(when-ctx.currentTime)*1000-DUE_MARGIN_MS);
   const {assetMidi,exact}=await chooseNoteAssets({midi,has:m=>assets.has(m),ensure:m=>assets.ensure(m),nearest:m=>assets.nearest(m,NEAR_SEMITONES),timeout:()=>new Promise<void>(r=>setTimeout(r,dueMs))});
   if(token!==epoch)return;
   const at=Math.max(ctx.currentTime,when),late=at-when;
   if(late>.025)scope.warn('late note preparation',{midi,delay:late});
   if(!exact)scope.warn('note uses nearby pitch assets',{midi,assetMidi});
   const length=duration-late;if(length<MIN_NOTE_SEC)return;
   node.port.postMessage({type:'note',midi,assetMidi,when:at,duration:length,velocity});
  },
  stop(hard=false){epoch++;node.port.postMessage({type:'stop',hard});},
  dispose(){disposed=true;epoch++;node.port.postMessage({type:'dispose'});node.disconnect();filter.disconnect();node.port.close();}};
}
export type InstrumentPlayer=Awaited<ReturnType<typeof createInstrumentPlayer>>;
