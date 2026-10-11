import {log} from '../../log';
const scope=log.scope('audio.mixer.plugins');
import {loadDragonfly} from './dragonfly';
import {normalizeEqSettings,normalizeReverbSettings,type EqBand,type ReverbSettings} from './model';
import {type PluginInstance,type PluginType} from './plugins';
import {normalizeFx} from './fx/spec';
export interface PluginNode {
 input:AudioNode;output:AudioNode;id:string;type:PluginType;
 update(plugin:PluginInstance):void;dispose():void;clear():void;retry():void;error():string|null;
 spectrum?(post:boolean):{values:Float32Array;sampleRate:number};listen?(band:EqBand|null):void;
 /** Effect plugins: follows the project tempo. */
 tempo?(bpm:number):void;
 /** Effect plugins with a gain-reduction meter: current reduction in dB. */
 reduction?():number;
}
/** Each insert owns a stable input/output pair, even if its processor stops. */
function createPlugin(ctx:AudioContext,initial:PluginInstance):PluginNode {
 const input=ctx.createGain(),output=ctx.createGain();let plugin=initial,worklet:AudioWorkletNode|null=null,disposed=false,failure:string|null=null,requested:string|null=null,algorithm:string|null=null,request=0;
 const pre=initial.type==='eq'?ctx.createAnalyser():null,post=initial.type==='eq'?ctx.createAnalyser():null,values=new Float32Array(1024);let band:EqBand|null=null;
 if(pre&&post){pre.fftSize=post.fftSize=2048;pre.smoothingTimeConstant=post.smoothingTimeConstant=.7;input.connect(pre);output.connect(post);}
 const settings=()=>initial.type==='eq'?normalizeEqSettings({...plugin.settings,bypass:plugin.bypass}):normalizeReverbSettings({...plugin.settings,bypass:plugin.bypass});
 function connect(){input.disconnect();if(pre)input.connect(pre);input.connect(worklet??output);worklet?.connect(output);}
 async function load(){if(initial.type!=='reverb'||!worklet||disposed)return;const mix=settings() as ReverbSettings;if(mix.bypass||mix.wet===0||algorithm===mix.algorithm||requested===mix.algorithm)return;
 const a=mix.algorithm,token=++request,node=worklet;requested=a;
 try{const bytes=await loadDragonfly(a);if(disposed||request!==token||node!==worklet)return;node.port.postMessage({type:'module',bytes,algorithm:a});}catch(e){if(disposed||token!==request)return;requested=null;failure=`Reverb unavailable: ${String(e)}`;scope.error('reverb load failed',{id:plugin.id,error:failure});}
 }
 function start(){if(disposed)return;const s=settings();worklet=new AudioWorkletNode(ctx,initial.type==='eq'?'sa3-eq':'sa3-reverb',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2],processorOptions:initial.type==='eq'?{eq:s}:{reverb:s}});const node=worklet;
 node.port.onmessage=e=>{if(disposed||worklet!==node)return;const m=e.data;if(m.type==='ready'&&m.algorithm===requested){algorithm=m.algorithm;requested=null;failure=null;}else if(m.type==='error'){requested=null;failure=String(m.message);scope.error('plugin error',{id:plugin.id,error:failure});}};
 node.addEventListener('processorerror',()=>{if(disposed||worklet!==node)return;failure='Plugin processor stopped. Dry playback is active.';scope.error('processor stopped',{id:plugin.id});request++;requested=null;algorithm=null;node.disconnect();node.port.close();worklet=null;connect();});connect();if(initial.type==='eq')failure=null;void load();}
 start();
 return {id:initial.id,type:initial.type,input,output,
 update(p){if(initial.type==='reverb'&&(plugin.settings as ReverbSettings).algorithm!==(p.settings as ReverbSettings).algorithm)algorithm=null;plugin=p;request++;requested=null;worklet?.port.postMessage(initial.type==='eq'?{type:'settings',eq:settings()}:{type:'settings',reverb:settings()});void load();},
 dispose(){disposed=true;request++;worklet?.port.postMessage({type:'dispose'});worklet?.disconnect();worklet?.port.close();input.disconnect();output.disconnect();pre?.disconnect();post?.disconnect();},
 clear(){worklet?.port.postMessage({type:'clear'});},retry(){if(!worklet){try{start();}catch(e){failure=String(e);}}else void load();},error(){return failure;},
 ...(pre&&post?{spectrum(after:boolean){(after?post:pre).getFloatFrequencyData(values);return {values,sampleRate:ctx.sampleRate};},listen(b:EqBand|null){band=b;worklet?.port.postMessage({type:'listen',band});}}:{})};
}
/** One effect plugin: a worklet processing the stereo input; on a processor failure the insert passes its input through. */
function createFxPlugin(ctx:AudioContext,initial:PluginInstance,bpm=120):PluginNode {
 const input=ctx.createGain(),output=ctx.createGain();let plugin=initial,tempo=bpm,worklet:AudioWorkletNode|null=null,disposed=false,failure:string|null=null,gr=0;
 const message=()=>({type:'settings',settings:normalizeFx(initial.type as never,plugin.settings),bypass:plugin.bypass,bpm:tempo});
 function connect(){input.disconnect();input.connect(worklet??output);worklet?.connect(output);}
 function start(){if(disposed)return;const m=message();
  worklet=new AudioWorkletNode(ctx,`sa3-fx-${initial.type}`,{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2],processorOptions:{settings:m.settings,bypass:m.bypass,bpm:m.bpm}});const node=worklet;
  node.port.onmessage=e=>{if(disposed||worklet!==node)return;const d=e.data;if(d.type==='reduction')gr=Number(d.value)||0;else if(d.type==='error'){failure=String(d.message);scope.error('plugin error',{id:plugin.id,error:failure});}};
  node.addEventListener('processorerror',()=>{if(disposed||worklet!==node)return;failure='Plugin processor stopped. Dry playback is active.';scope.error('processor stopped',{id:plugin.id});node.disconnect();node.port.close();worklet=null;gr=0;connect();});
  connect();failure=null;}
 start();
 return {id:initial.id,type:initial.type,input,output,
  update(p){plugin=p;worklet?.port.postMessage(message());},tempo(b){if(b===tempo)return;tempo=b;worklet?.port.postMessage(message());},
  dispose(){disposed=true;worklet?.port.postMessage({type:'dispose'});worklet?.disconnect();worklet?.port.close();input.disconnect();output.disconnect();},
  clear(){worklet?.port.postMessage({type:'clear'});gr=0;},retry(){if(!worklet){try{start();}catch(e){failure=String(e);}}},error(){return failure;},reduction(){return gr;}};
}
export type PluginNodeFactory=(ctx:AudioContext,plugin:PluginInstance,bpm?:number)=>PluginNode;
export const pluginNodeFactories:Record<PluginType,PluginNodeFactory>={eq:createPlugin,reverb:createPlugin,
 limiter:createFxPlugin,compressor:createFxPlugin,delay:createFxPlugin,saturation:createFxPlugin,chorus:createFxPlugin,phaser:createFxPlugin,flanger:createFxPlugin,
 filter:createFxPlugin,widener:createFxPlugin,bitcrusher:createFxPlugin,transient:createFxPlugin};
