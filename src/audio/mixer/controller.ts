import processorUrl from './processor?worker&url';
import {dbGain,finite,panGain,type EqBand} from './model';
import {MASTER_ID,normalizeMix,type PluginInstance,type TrackMix} from './plugins';
import {pluginNodeFactories,type PluginNode} from './pluginNodes';
import {emptyMeter,type MeterReading} from './meter';
import type {Project} from '../../store/projectModel';
import {log} from '../../log';
const scope=log.scope('audio.mixer');
export interface MixerController {
 sync(project:Project):void;input(id:string):AudioNode;clear():void;meter(id?:string):MeterReading;
 spectrum(id:string,pluginId:string,post?:boolean):{values:Float32Array;sampleRate:number}|null;
 listen(id:string|null,pluginId?:string,band?:EqBand):void;reduction(id:string,pluginId:string):number|null;error(id:string):string|null;retry(id:string):void;sampleRate:number;
}
const installed=new WeakMap<AudioContext,Promise<void>>();
async function install(ctx:AudioContext){let p=installed.get(ctx);if(!p){p=ctx.audioWorklet.addModule(processorUrl);installed.set(ctx,p);p.catch(()=>installed.delete(ctx));}await p;}
/** Ordered insert chain between `input` and `fade`; a track bus and the master bus both have one. */
interface Chain {input:AudioNode;fade:GainNode;mix:{plugins:PluginInstance[]};plugins:PluginNode[];error:string|null;disposed:boolean;ready:boolean;timer:ReturnType<typeof setTimeout>|null;}
interface Bus extends Chain {input:GainNode;fade:GainNode;analyser:AnalyserNode;values:Float32Array;panner:StereoPannerNode;volume:GainNode;gate:GainNode;meter:AudioWorkletNode|null;reading:MeterReading;mix:TrackMix;plugins:PluginNode[];error:string|null;disposed:boolean;ready:boolean;timer:ReturnType<typeof setTimeout>|null;}
export function createMixer(ctx:AudioContext,master:GainNode):MixerController {
 const buses=new Map<string,Bus>();let listening:PluginNode|null=null;let masterReading=emptyMeter();let masterMeter:AudioWorkletNode|null=null;let tempo=120;
 const sum=ctx.createGain(),masterFade=ctx.createGain();sum.channelCount=2;sum.channelCountMode='explicit';sum.channelInterpretation='speakers';sum.connect(masterFade);masterFade.connect(master);
 const masterChain:Chain={input:sum,fade:masterFade,mix:{plugins:[]},plugins:[],error:null,disposed:false,ready:false,timer:null};
 const chainFor=(id:string):Chain|undefined=>id===MASTER_ID?masterChain:buses.get(id);
 async function initializeMaster(){try{
  await install(ctx);
  if(!masterChain.ready||masterChain.error){masterChain.ready=true;rebuild(masterChain);}
  if(!masterMeter){const node=new AudioWorkletNode(ctx,'sa3-meter',{outputChannelCount:[2]});master.disconnect();master.connect(node);node.connect(ctx.destination);node.port.onmessage=e=>masterReading=e.data;masterMeter=node;}
 }catch(e){masterChain.error=`Effects unavailable: ${String(e)}`;scope.error('master initialization failed',{error:String(e)});}}
 void initializeMaster();
 const smooth=(param:AudioParam,v:number)=>param.setTargetAtTime(v,ctx.currentTime,.015);
 function ramp(param:AudioParam,value:number){param.cancelScheduledValues(ctx.currentTime);param.setValueAtTime(param.value,ctx.currentTime);param.linearRampToValueAtTime(value,ctx.currentTime+.02);}
 function rebuild(b:Chain){if(b.disposed||!b.ready)return;
 const previous=new Map(b.plugins.map(p=>[p.id,p]));const next:PluginNode[]=[];
 try{for(const p of b.mix.plugins){let node=previous.get(p.id);if(node?.type!==p.type)node=undefined;if(!node)node=pluginNodeFactories[p.type](ctx,p,tempo);else{node.update(p);node.tempo?.(tempo);}next.push(node);}}
 catch(e){for(const p of next)if(!b.plugins.includes(p))p.dispose();b.error=`Effects unavailable: ${String(e)}`;ramp(b.fade.gain,1);return;}
 b.input.disconnect();for(let i=0;i<b.plugins.length;i++)b.plugins[i]!.output.disconnect(b.plugins[i+1]?.input??b.fade);let output:AudioNode=b.input;for(const p of next){output.connect(p.input);output=p.output;}output.connect(b.fade);
 for(const p of b.plugins)if(!next.includes(p)){if(listening===p){p.listen?.(null);listening=null;}p.dispose();}b.plugins=next;b.error=null;ramp(b.fade.gain,1);
 }
 function change(b:Chain){if(!b.ready)return;if(b.timer)clearTimeout(b.timer);ramp(b.fade.gain,0);const silentAt=ctx.currentTime+.02;
 const apply=()=>{if(b.disposed)return;if(ctx.state==='running'&&ctx.currentTime<silentAt){b.timer=setTimeout(apply,5);return;}b.timer=null;if(ctx.state==='suspended'){b.fade.gain.cancelScheduledValues(ctx.currentTime);b.fade.gain.setValueAtTime(0,ctx.currentTime);}rebuild(b);};b.timer=setTimeout(apply,25);}
 async function initialize(b:Bus,id:string){try{await install(ctx);if(b.disposed)return;if(!b.ready||b.error){b.ready=true;rebuild(b);}if(!b.meter){const node=new AudioWorkletNode(ctx,'sa3-meter',{outputChannelCount:[2]});b.gate.disconnect();b.gate.connect(node);node.connect(sum);node.port.onmessage=e=>b.reading=e.data;b.meter=node;}}catch(e){if(!b.disposed){b.error=`Effects unavailable: ${String(e)}`;scope.error('initialization failed',{id,error:String(e)});}}}
 function bus(id:string){let b=buses.get(id);if(!b){const input=ctx.createGain(),fade=ctx.createGain(),panner=ctx.createStereoPanner(),volume=ctx.createGain(),gate=ctx.createGain(),analyser=ctx.createAnalyser();analyser.fftSize=2048;analyser.smoothingTimeConstant=.7;input.channelCount=2;input.channelCountMode='explicit';input.channelInterpretation='speakers';input.connect(fade);fade.connect(analyser);fade.connect(panner);panner.connect(volume);volume.connect(gate);gate.connect(sum);b={input,fade,analyser,values:new Float32Array(1024),panner,volume,gate,meter:null,reading:emptyMeter(),mix:normalizeMix(),plugins:[],error:null,disposed:false,ready:false,timer:null};buses.set(id,b);void initialize(b,id);}return b;}
 return {sampleRate:ctx.sampleRate,
 sync(p){tempo=Number.isFinite(p.bpm)&&p.bpm>0?p.bpm:120;smooth(master.gain,dbGain(finite(p.masterDb,20*Math.log10(.8),-60,6)));const ids=new Set(p.tracks.map(t=>t.id));for(const [id,b]of buses)if(!ids.has(id)){b.disposed=true;if(b.timer)clearTimeout(b.timer);for(const n of b.plugins){if(listening===n)listening=null;n.dispose();}b.meter?.port.postMessage({type:'dispose'});b.meter?.port.close();for(const n of [b.input,b.fade,b.analyser,b.panner,b.volume,b.gate,b.meter])n?.disconnect();buses.delete(id);}
 function apply(b:Chain,plugins:PluginInstance[]){const structure=plugins.map(p=>`${p.id}:${p.type}`).join('|')!==b.mix.plugins.map(p=>`${p.id}:${p.type}`).join('|');const old=b.mix.plugins;b.mix={plugins};
 if(structure)change(b);else for(const node of b.plugins){node.tempo?.(tempo);const plugin=plugins.find(p=>p.id===node.id);if(!plugin||plugin.type!==node.type)continue;if(JSON.stringify(plugin)!==JSON.stringify(old.find(p=>p.id===node.id)))node.update(plugin);}}
 apply(masterChain,normalizeMix({plugins:p.masterPlugins}).plugins);
 const solo=p.tracks.some(t=>t.solo);for(const t of p.tracks){const b=bus(t.id),m=normalizeMix(t.mix);apply(b,m.plugins);
 smooth(b.volume.gain,dbGain(m.volumeDb)*panGain(m.pan));smooth(b.panner.pan,m.pan);smooth(b.gate.gain,!t.muted&&(!solo||t.solo)?1:0);}},
 input(id){return bus(id).input;},clear(){for(const p of masterChain.plugins)p.clear();for(const b of buses.values()){for(const p of b.plugins)p.clear();b.meter?.port.postMessage({type:'clear'});b.reading=emptyMeter();}masterMeter?.port.postMessage({type:'clear'});masterReading=emptyMeter();},
 meter(id){return id?buses.get(id)?.reading??emptyMeter():masterReading;},
 spectrum(id,pluginId,post=true){const b=buses.get(id);if(b&&!pluginId){b.analyser.getFloatFrequencyData(b.values as Float32Array<ArrayBuffer>);return {values:b.values,sampleRate:ctx.sampleRate};}return chainFor(id)?.plugins.find(p=>p.id===pluginId)?.spectrum?.(post)??null;},
 listen(id,pluginId,band){listening?.listen?.(null);listening=id?chainFor(id)?.plugins.find(p=>p.id===pluginId)??null:null;listening?.listen?.(band??null);},
 reduction(id,pluginId){const n=chainFor(id)?.plugins.find(p=>p.id===pluginId);return n?.reduction?n.reduction():null;},
 error(id){const b=chainFor(id);return b?.error??b?.plugins.map(p=>p.error()).find(Boolean)??null;},retry(id){if(id===MASTER_ID){if(masterChain.error||!masterChain.ready)void initializeMaster();for(const p of masterChain.plugins)p.retry();return;}const b=buses.get(id);if(b){if(b.error)void initialize(b,id);for(const p of b.plugins)p.retry();}}
 };
}
