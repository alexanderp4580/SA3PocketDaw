import processorUrl from './processor?worker&url';
import {dbGain,finite,panGain,type EqBand} from './model';
import {normalizeMix,type TrackMix} from './plugins';
import {pluginNodeFactories,type PluginNode} from './pluginNodes';
import {emptyMeter,type MeterReading} from './meter';
import type {Project} from '../../store/projectModel';
import {log} from '../../log';
const scope=log.scope('audio.mixer');
export interface MixerController {
 sync(project:Project):void;input(id:string):AudioNode;clear():void;meter(id?:string):MeterReading;
 spectrum(id:string,pluginId:string,post?:boolean):{values:Float32Array;sampleRate:number}|null;
 listen(id:string|null,pluginId?:string,band?:EqBand):void;error(id:string):string|null;retry(id:string):void;sampleRate:number;
}
const installed=new WeakMap<AudioContext,Promise<void>>();
async function install(ctx:AudioContext){let p=installed.get(ctx);if(!p){p=ctx.audioWorklet.addModule(processorUrl);installed.set(ctx,p);p.catch(()=>installed.delete(ctx));}await p;}
interface Bus {input:GainNode;fade:GainNode;analyser:AnalyserNode;values:Float32Array;panner:StereoPannerNode;volume:GainNode;gate:GainNode;meter:AudioWorkletNode|null;reading:MeterReading;mix:TrackMix;plugins:PluginNode[];error:string|null;disposed:boolean;ready:boolean;timer:ReturnType<typeof setTimeout>|null;}
export function createMixer(ctx:AudioContext,master:GainNode):MixerController {
 const buses=new Map<string,Bus>();let listening:PluginNode|null=null;let masterReading=emptyMeter();let masterMeter:AudioWorkletNode|null=null;
 void install(ctx).then(()=>{masterMeter=new AudioWorkletNode(ctx,'sa3-meter',{outputChannelCount:[2]});master.disconnect();master.connect(masterMeter);masterMeter.connect(ctx.destination);masterMeter.port.onmessage=e=>masterReading=e.data;}).catch(e=>scope.error('master meter unavailable',{error:String(e)}));
 const smooth=(param:AudioParam,v:number)=>param.setTargetAtTime(v,ctx.currentTime,.015);
 function ramp(param:AudioParam,value:number){param.cancelScheduledValues(ctx.currentTime);param.setValueAtTime(param.value,ctx.currentTime);param.linearRampToValueAtTime(value,ctx.currentTime+.02);}
 function rebuild(b:Bus){if(b.disposed||!b.ready)return;
 const previous=new Map(b.plugins.map(p=>[p.id,p]));const next:PluginNode[]=[];
 try{for(const p of b.mix.plugins){let node=previous.get(p.id);if(node?.type!==p.type)node=undefined;if(!node)node=pluginNodeFactories[p.type](ctx,p);else node.update(p);next.push(node);}}
 catch(e){for(const p of next)if(!b.plugins.includes(p))p.dispose();b.error=`Effects unavailable: ${String(e)}`;ramp(b.fade.gain,1);return;}
 b.input.disconnect();for(let i=0;i<b.plugins.length;i++)b.plugins[i]!.output.disconnect(b.plugins[i+1]?.input??b.fade);let output:AudioNode=b.input;for(const p of next){output.connect(p.input);output=p.output;}output.connect(b.fade);
 for(const p of b.plugins)if(!next.includes(p)){if(listening===p){p.listen?.(null);listening=null;}p.dispose();}b.plugins=next;b.error=null;ramp(b.fade.gain,1);
 }
 function change(b:Bus){if(!b.ready)return;if(b.timer)clearTimeout(b.timer);ramp(b.fade.gain,0);const silentAt=ctx.currentTime+.02;
 const apply=()=>{if(b.disposed)return;if(ctx.state==='running'&&ctx.currentTime<silentAt){b.timer=setTimeout(apply,5);return;}b.timer=null;if(ctx.state==='suspended'){b.fade.gain.cancelScheduledValues(ctx.currentTime);b.fade.gain.setValueAtTime(0,ctx.currentTime);}rebuild(b);};b.timer=setTimeout(apply,25);}
 async function initialize(b:Bus,id:string){try{await install(ctx);if(b.disposed)return;if(!b.ready||b.error){b.ready=true;rebuild(b);}if(!b.meter){const node=new AudioWorkletNode(ctx,'sa3-meter',{outputChannelCount:[2]});b.gate.disconnect();b.gate.connect(node);node.connect(master);node.port.onmessage=e=>b.reading=e.data;b.meter=node;}}catch(e){if(!b.disposed){b.error=`Effects unavailable: ${String(e)}`;scope.error('initialization failed',{id,error:String(e)});}}}
 function bus(id:string){let b=buses.get(id);if(!b){const input=ctx.createGain(),fade=ctx.createGain(),panner=ctx.createStereoPanner(),volume=ctx.createGain(),gate=ctx.createGain(),analyser=ctx.createAnalyser();analyser.fftSize=2048;analyser.smoothingTimeConstant=.7;input.channelCount=2;input.channelCountMode='explicit';input.channelInterpretation='speakers';input.connect(fade);fade.connect(analyser);fade.connect(panner);panner.connect(volume);volume.connect(gate);gate.connect(master);b={input,fade,analyser,values:new Float32Array(1024),panner,volume,gate,meter:null,reading:emptyMeter(),mix:normalizeMix(),plugins:[],error:null,disposed:false,ready:false,timer:null};buses.set(id,b);void initialize(b,id);}return b;}
 return {sampleRate:ctx.sampleRate,
 sync(p){smooth(master.gain,dbGain(finite(p.masterDb,20*Math.log10(.8),-60,6)));const ids=new Set(p.tracks.map(t=>t.id));for(const [id,b]of buses)if(!ids.has(id)){b.disposed=true;if(b.timer)clearTimeout(b.timer);for(const n of b.plugins){if(listening===n)listening=null;n.dispose();}b.meter?.port.postMessage({type:'dispose'});b.meter?.port.close();for(const n of [b.input,b.fade,b.analyser,b.panner,b.volume,b.gate,b.meter])n?.disconnect();buses.delete(id);}
 const solo=p.tracks.some(t=>t.solo);for(const t of p.tracks){const b=bus(t.id),m=normalizeMix(t.mix),structure=m.plugins.map(p=>`${p.id}:${p.type}`).join('|')!==b.mix.plugins.map(p=>`${p.id}:${p.type}`).join('|');const old=b.mix;b.mix=m;
 if(structure)change(b);else for(const node of b.plugins){const plugin=m.plugins.find(p=>p.id===node.id);if(!plugin||plugin.type!==node.type)continue;if(JSON.stringify(plugin)!==JSON.stringify(old.plugins.find(p=>p.id===node.id)))node.update(plugin);}
 smooth(b.volume.gain,dbGain(m.volumeDb)*panGain(m.pan));smooth(b.panner.pan,m.pan);smooth(b.gate.gain,!t.muted&&(!solo||t.solo)?1:0);}},
 input(id){return bus(id).input;},clear(){for(const b of buses.values()){for(const p of b.plugins)p.clear();b.meter?.port.postMessage({type:'clear'});b.reading=emptyMeter();}masterMeter?.port.postMessage({type:'clear'});masterReading=emptyMeter();},
 meter(id){return id?buses.get(id)?.reading??emptyMeter():masterReading;},
 spectrum(id,pluginId,post=true){const b=buses.get(id);if(!b)return null;if(!pluginId){b.analyser.getFloatFrequencyData(b.values as Float32Array<ArrayBuffer>);return {values:b.values,sampleRate:ctx.sampleRate};}return b.plugins.find(p=>p.id===pluginId)?.spectrum?.(post)??null;},
 listen(id,pluginId,band){listening?.listen?.(null);listening=id?buses.get(id)?.plugins.find(p=>p.id===pluginId)??null:null;listening?.listen?.(band??null);},
 error(id){const b=buses.get(id);return b?.error??b?.plugins.map(p=>p.error()).find(Boolean)??null;},retry(id){const b=buses.get(id);if(b){if(b.error)void initialize(b,id);for(const p of b.plugins)p.retry();}}
 };
}
