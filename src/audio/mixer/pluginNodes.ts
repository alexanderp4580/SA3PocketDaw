import {log} from '../../log';
const scope=log.scope('audio.mixer.plugins');
import {loadDragonfly} from './dragonfly';
import {normalizeEqSettings,normalizeReverbSettings,type EqBand,type ReverbSettings} from './model';
import {type PluginInstance,type PluginType} from './plugins';
export interface PluginNode {
 input:AudioNode;output:AudioNode;id:string;type:PluginType;
 update(plugin:PluginInstance):void;dispose():void;clear():void;retry():void;error():string|null;
 spectrum?(post:boolean):{values:Float32Array;sampleRate:number};listen?(band:EqBand|null):void;
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
export const pluginNodeFactories:Record<PluginType,(ctx:AudioContext,plugin:PluginInstance)=>PluginNode>={eq:createPlugin,reverb:createPlugin};
