import processorUrl from './processor?worker&url';
import {loadDragonfly} from './dragonfly';
import {dbGain,finite,panGain,type EqBand,type FxView} from './model';
import {fxView,normalizeMix} from './plugins';
import {emptyMeter,type MeterReading} from './meter';
import type {Project} from '../../store/projectModel';
import {log} from '../../log';
const scope=log.scope('audio.mixer');
export interface MixerController {
 sync(project:Project):void;input(id:string):AudioNode;clear():void;meter(id?:string):MeterReading;
 spectrum(id:string,post?:boolean):{values:Float32Array;sampleRate:number}|null;
 listen(id:string|null,band?:EqBand):void;error(id:string):string|null;retry(id:string):void;sampleRate:number;
}
const installed=new WeakMap<AudioContext,Promise<void>>();
async function install(ctx:AudioContext){let p=installed.get(ctx);if(!p){p=ctx.audioWorklet.addModule(processorUrl);installed.set(ctx,p);p.catch(()=>installed.delete(ctx));}await p;}
interface Bus {input:GainNode;fx:AudioWorkletNode|null;panner:StereoPannerNode;volume:GainNode;gate:GainNode;pre:AnalyserNode;post:AnalyserNode;meter:AudioWorkletNode|null;reading:MeterReading;values:Float32Array;mix:FxView;error:string|null;epoch:number;algorithm:string|null;requested:string|null;loadEpoch:number;disposed:boolean;}
export function createMixer(ctx:AudioContext,master:GainNode):MixerController {
 const buses=new Map<string,Bus>();let listening:string|null=null;let masterReading=emptyMeter();let masterMeter:AudioWorkletNode|null=null;
 void install(ctx).then(()=>{masterMeter=new AudioWorkletNode(ctx,'sa3-meter',{outputChannelCount:[2]});master.disconnect();master.connect(masterMeter);masterMeter.connect(ctx.destination);masterMeter.port.onmessage=e=>masterReading=e.data;}).catch(e=>scope.error('master meter unavailable',{error:String(e)}));
 const smooth=(param:AudioParam,v:number)=>{param.setTargetAtTime(v,ctx.currentTime,.015);};
 async function initialize(b:Bus,id:string){const token=b.epoch;try{await install(ctx);if(b.disposed||token!==b.epoch)return;
  if(!b.fx){b.fx=new AudioWorkletNode(ctx,'sa3-track-fx',{numberOfInputs:1,numberOfOutputs:2,outputChannelCount:[2,2],processorOptions:{mix:b.mix}});b.fx.port.onmessage=e=>{if(e.data.type==='ready'&&e.data.algorithm===b.requested){b.algorithm=e.data.algorithm;b.requested=null;b.error=null;}else if(e.data.type==='error'){b.requested=null;b.algorithm=null;b.error=e.data.message;scope.error('effects error',{id,error:b.error});}};b.input.disconnect();b.input.connect(b.pre);b.input.connect(b.fx);b.fx.connect(b.post,1);b.fx.connect(b.panner);b.fx.port.postMessage({type:'mix',mix:b.mix});b.fx.addEventListener('processorerror',()=>{b.epoch++;b.error='Effects processor stopped. Dry playback is active.';b.algorithm=null;b.requested=null;b.fx?.disconnect();b.fx?.port.close();b.fx=null;b.input.disconnect();b.input.connect(b.pre);b.input.connect(b.post);b.input.connect(b.panner);scope.error('processor stopped',{id});});}
  if(!b.meter){b.meter=new AudioWorkletNode(ctx,'sa3-meter',{outputChannelCount:[2]});b.gate.disconnect();b.gate.connect(b.meter);b.meter.connect(master);b.meter.port.onmessage=e=>b.reading=e.data;}
  if(b.mix.reverb.wet>0&&!b.mix.reverb.bypass&&b.algorithm!==b.mix.reverb.algorithm&&b.requested!==b.mix.reverb.algorithm){const a=b.mix.reverb.algorithm;b.requested=a;const request=++b.loadEpoch;const bytes=await loadDragonfly(a);if(b.disposed||token!==b.epoch||request!==b.loadEpoch||a!==b.mix.reverb.algorithm)return;b.fx.port.postMessage({type:'module',bytes,algorithm:a});}
 }catch(error){if(!b.disposed&&token===b.epoch){b.requested=null;b.error=`Effects unavailable: ${String(error)}`;scope.error('initialization failed',{id,error:String(error)});}}}
 function bus(id:string){let b=buses.get(id);if(!b){const input=ctx.createGain(),panner=ctx.createStereoPanner(),volume=ctx.createGain(),gate=ctx.createGain(),pre=ctx.createAnalyser(),post=ctx.createAnalyser();pre.fftSize=2048;post.fftSize=2048;pre.smoothingTimeConstant=.7;post.smoothingTimeConstant=.7;input.connect(pre);input.connect(post);input.connect(panner);panner.connect(volume);volume.connect(gate);gate.connect(master);b={input,fx:null,panner,volume,gate,pre,post,meter:null,reading:emptyMeter(),values:new Float32Array(1024),mix:fxView(normalizeMix()),error:null,epoch:0,algorithm:null,requested:null,loadEpoch:0,disposed:false};buses.set(id,b);void initialize(b,id);}return b;}
 return {
 sampleRate:ctx.sampleRate,
 sync(p){smooth(master.gain,dbGain(finite(p.masterDb,20*Math.log10(.8),-60,6)));const ids=new Set(p.tracks.map(t=>t.id));for(const [id,b]of buses)if(!ids.has(id)){b.disposed=true;b.epoch++;b.fx?.port.postMessage({type:'dispose'});b.meter?.port.postMessage({type:'dispose'});for(const node of [b.input,b.fx,b.panner,b.volume,b.gate,b.pre,b.post,b.meter])node?.disconnect();b.fx?.port.close();b.meter?.port.close();buses.delete(id);if(listening===id)listening=null;}
 const solo=p.tracks.some(t=>t.solo);for(const t of p.tracks){const b=bus(t.id),m=fxView(normalizeMix(t.mix));if(JSON.stringify(m)!==JSON.stringify(b.mix)){b.mix=m;b.fx?.port.postMessage({type:'mix',mix:m});if(m.reverb.wet>0&&b.algorithm!==m.reverb.algorithm)void initialize(b,t.id);}smooth(b.volume.gain,dbGain(m.volumeDb)*panGain(m.pan));smooth(b.panner.pan,m.pan);smooth(b.gate.gain,!t.muted&&(!solo||t.solo)?1:0);}
 },
 input(id){return bus(id).input;},
 clear(){for(const b of buses.values()){b.fx?.port.postMessage({type:'clear'});b.meter?.port.postMessage({type:'clear'});b.reading=emptyMeter();}masterMeter?.port.postMessage({type:'clear'});masterReading=emptyMeter();},
 meter(id){return id?buses.get(id)?.reading??emptyMeter():masterReading;},
 spectrum(id,post=true){const b=buses.get(id);if(!b)return null;(post?b.post:b.pre).getFloatFrequencyData(b.values as Float32Array<ArrayBuffer>);return {values:b.values,sampleRate:ctx.sampleRate};},
 listen(id,band){if(listening)buses.get(listening)?.fx?.port.postMessage({type:'listen',band:null});listening=id;if(id)buses.get(id)?.fx?.port.postMessage({type:'listen',band:band??null});},
 error(id){return buses.get(id)?.error??null;},retry(id){const b=buses.get(id);if(b)void initialize(b,id);}
 };
}
