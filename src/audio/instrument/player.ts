import { brightnessHz,resolveControls,type InstrumentControls } from './controls';
import processorUrl from './processor.ts?worker&url';
import { prepareInstrumentNote } from './client';
import { log } from '../../log';
import type { InstrumentProfile,PreparedNote } from './types';
const scope=log.scope('instrument.player');
const loaded=new WeakMap<AudioContext,Promise<void>>();
export async function createInstrumentPlayer(ctx:AudioContext,output:AudioNode,profile:InstrumentProfile){
 let module=loaded.get(ctx);if(!module){module=ctx.audioWorklet.addModule(processorUrl);loaded.set(ctx,module);}await module;
 const node=new AudioWorkletNode(ctx,'sa3-instrument',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[1]});const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.Q.value=.707;filter.frequency.value=brightnessHz(1,ctx.sampleRate);node.connect(filter);filter.connect(output);node.port.postMessage({type:'profile',profile});
 const cache=new Map<number,Promise<PreparedNote>>();
 const installed=new Set<number>();
 async function prepare(midi:number){let pending=cache.get(midi);if(!pending){pending=prepareInstrumentNote(profile,midi);cache.set(midi,pending);}try{const assets=await pending;if(!installed.has(midi)){node.port.postMessage({type:'assets',midi,assets});installed.add(midi);if(installed.size>16){const old=installed.values().next().value!;installed.delete(old);node.port.postMessage({type:'evict',midi:old});}}else{installed.delete(midi);installed.add(midi);}if(cache.size>16)cache.delete(cache.keys().next().value!);}catch(e){cache.delete(midi);throw e;}}
 let epoch=0;
 return {prepare,setControls(value?:Partial<InstrumentControls>){const controls=resolveControls(value,profile.dynamics);filter.frequency.setTargetAtTime(brightnessHz(controls.brightness,ctx.sampleRate),ctx.currentTime,.02);node.port.postMessage({type:'controls',controls});},async note(midi:number,when:number,duration:number,velocity:number){const token=epoch;await prepare(midi);if(token!==epoch)return;const at=Math.max(ctx.currentTime,when);if(at-when>.025)scope.warn('late note preparation',{midi,delay:at-when});node.port.postMessage({type:'note',midi,when:at,duration,velocity});},stop(hard=false){epoch++;node.port.postMessage({type:'stop',hard});},dispose(){epoch++;node.port.postMessage({type:'stop'});node.disconnect();filter.disconnect();node.port.close();}};
}
export type InstrumentPlayer=Awaited<ReturnType<typeof createInstrumentPlayer>>;
