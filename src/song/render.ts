import processorUrl from '../audio/mixer/processor?worker&url';
import {loadDragonfly} from '../audio/mixer/dragonfly';
import {normalizeMix} from '../audio/mixer/plugins';
import {dbGain,panGain,finite,normalizeEqSettings,normalizeReverbSettings,type ReverbSettings} from '../audio/mixer/model';
import {playNote,type AudioContextLike} from '../audio/sampler';
import {resolveControls,brightnessHz} from '../audio/instrument/controls';
import type {Project} from '../store/projectModel';
import type {StoredSample} from '../store/projectStore';
import {compileSong} from './events';
import {checkAbort,type ExportOptions} from './export';
const RATE=44100,PREROLL=.1;
export function trimTail(channels:Float32Array[],rate:number,duration:number):Float32Array[] {
 const minimum=Math.round(duration*rate);let end=minimum;
 for(const ch of channels)for(let i=ch.length-1;i>=minimum;i--)if(Math.abs(ch[i]!)>1e-4){end=Math.max(end,Math.min(ch.length,i+1+Math.round(rate*.05)));break;}
 const out=channels.map(ch=>ch.slice(0,end));if(end>=channels[0]!.length-Math.round(rate*.05)){const fade=Math.min(Math.round(rate*.01),end);for(const ch of out)for(let i=0;i<fade;i++)ch[end-fade+i]!*=1-i/fade;}return out;
}
export async function renderSong(project:Project,sounds:Map<string,StoredSample>,options:ExportOptions={}):Promise<AudioBuffer>{
 const {signal,onProgress}=options,song=compileSong(project);checkAbort(signal);
 const nodes:AudioNode[]=[],workers:Worker[]=[],worklets:AudioWorkletNode[]=[];let context:OfflineAudioContext|null=null;let finished=false;
 let rejectProcessing:(e:Error)=>void=()=>{};const processingFailure=new Promise<never>((_,reject)=>rejectProcessing=reject);void processingFailure.catch(()=>{});
 try{
 const algorithms=new Set(project.tracks.filter(t=>sounds.has(t.id)).flatMap(t=>normalizeMix(t.mix).plugins.flatMap(p=>p.type==='reverb'&&!p.bypass&&normalizeReverbSettings(p.settings as Partial<ReverbSettings>).wet>0?[normalizeReverbSettings(p.settings as Partial<ReverbSettings>).algorithm]:[])));
 const modules=new Map(await Promise.all([...algorithms].map(async a=>[a,await loadDragonfly(a)] as const)));checkAbort(signal);
 // Compile required bytes before rendering, so unavailable or invalid DSP cannot become a dry export.
 await Promise.all([...modules.values()].map(b=>WebAssembly.compile(b)));checkAbort(signal);
 const ctx=context=new OfflineAudioContext(2,Math.ceil((song.duration+10+PREROLL)*RATE),RATE);
 if(!ctx.audioWorklet)throw Error('This browser cannot render the song effects offline.');
 await ctx.audioWorklet.addModule(processorUrl);checkAbort(signal);
 const master=ctx.createGain();master.gain.value=dbGain(finite(project.masterDb,20*Math.log10(.8),-60,6));master.connect(ctx.destination);nodes.push(master);
 let count=0;
 for(const track of project.tracks){const source=sounds.get(track.id);if(!source)continue;const mix=normalizeMix(track.mix),input=ctx.createGain();input.channelCount=2;input.channelCountMode='explicit';nodes.push(input);let output:AudioNode=input;
 for(const p of mix.plugins){if(p.bypass)continue;
 const settings=p.type==='eq'?normalizeEqSettings({...p.settings,bypass:false}):normalizeReverbSettings({...p.settings,bypass:false});
 if(p.type==='reverb'&&normalizeReverbSettings(settings).wet===0)continue;
 const node=new AudioWorkletNode(ctx,p.type==='eq'?'sa3-eq':'sa3-reverb',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2],processorOptions:p.type==='eq'?{eq:settings}:{reverb:settings,bytes:modules.get(normalizeReverbSettings(settings).algorithm)}});
 node.addEventListener('processorerror',()=>rejectProcessing(Error(track.name+': an effect failed while rendering.')));output.connect(node);output=node;nodes.push(node);worklets.push(node);
 }
 const pan=ctx.createStereoPanner(),gain=ctx.createGain();pan.pan.value=mix.pan;gain.gain.value=dbGain(mix.volumeDb)*panGain(mix.pan);output.connect(pan);pan.connect(gain);gain.connect(master);nodes.push(pan,gain);
 const events=song.events.filter(e=>e.trackId===track.id);
 if(source.instrument){
 const controls=resolveControls(track.instrumentControls,source.instrument.dynamics),filter=ctx.createBiquadFilter();filter.type='lowpass';filter.Q.value=.707;filter.frequency.value=brightnessHz(controls.brightness,RATE);filter.connect(input);nodes.push(filter);
 const worker=new Worker(new URL('./instrumentRender.worker.ts',import.meta.url),{type:'module'});workers.push(worker);
 const buffers=new Map<string,AudioBuffer>();
 for(const e of events){checkAbort(signal);const key=JSON.stringify([e.midi,e.duration,e.velocity]);let buffer=buffers.get(key);
 if(!buffer){const pcm=await new Promise<Float32Array>((resolve,reject)=>{const abort=()=>reject(new DOMException('Export cancelled','AbortError'));signal?.addEventListener('abort',abort,{once:true});const clean=()=>signal?.removeEventListener('abort',abort);worker.onerror=e=>{clean();reject(Error(e.message));};worker.onmessage=m=>{clean();m.data.error?reject(Error(m.data.error)):resolve(m.data.pcm);};worker.postMessage({profile:source.instrument,midi:e.midi,duration:e.duration,velocity:e.velocity,controls});});checkAbort(signal);buffer=ctx.createBuffer(1,pcm.length,RATE);buffer.copyToChannel(pcm as Float32Array<ArrayBuffer>,0);buffers.set(key,buffer);}
 const voice=ctx.createBufferSource();voice.buffer=buffer;voice.connect(filter);voice.start(PREROLL+e.when);nodes.push(voice);onProgress?.({stage:'Preparing',fraction:++count/song.events.length});
 }worker.terminate();
 }else {const buffer=ctx.createBuffer(1,source.pcm.length,source.sampleRate);buffer.copyToChannel(source.pcm as Float32Array<ArrayBuffer>,0);for(const e of events){checkAbort(signal);playNote(ctx as unknown as AudioContextLike,{buffer,root:track.rootMidi,note:e.midi,when:PREROLL+e.when,duration:e.duration,velocity:e.velocity,output:input,controls:track.sampleControls});count++;}onProgress?.({stage:'Preparing',fraction:count/song.events.length});}
 }
 checkAbort(signal);onProgress?.({stage:'Rendering',fraction:0});checkAbort(signal);
 const length=ctx.length/RATE;
 function progress(at:number){if(at>=length)return;void ctx.suspend(at).then(()=>{if(signal?.aborted||finished)return;onProgress?.({stage:'Rendering',fraction:ctx.currentTime/length});progress(at+.5);void ctx.resume();}).catch(()=>{});}
 progress(.5);
 const rendered=ctx.startRendering();
 const cancelled=new Promise<never>((_,reject)=>{const abort=()=>reject(new DOMException('Export cancelled','AbortError'));signal?.addEventListener('abort',abort,{once:true});void rendered.finally(()=>signal?.removeEventListener('abort',abort)).catch(()=>{});});
 const result=await Promise.race([rendered,processingFailure,cancelled]);checkAbort(signal);
 const out=ctx.createBuffer(2,Math.round((song.duration+10)*RATE),RATE);for(let ch=0;ch<2;ch++)out.copyToChannel(result.getChannelData(ch).subarray(Math.round(PREROLL*RATE)),ch);return out;
 }finally{finished=true;for(const w of workers)w.terminate();for(const n of nodes)n.disconnect();for(const n of worklets){n.port.postMessage({type:'dispose'});n.port.close();}if(signal?.aborted&&context?.state==='running')void context.suspend(Math.min(context.length/RATE-.01,context.currentTime+.01)).catch(()=>{});}
}
