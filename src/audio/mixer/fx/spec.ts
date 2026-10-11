/** Pure parameter specs of the effect plugins; shared by normalisation, the editor and tests. */
export type FxKind='limiter'|'compressor'|'delay'|'saturation'|'chorus'|'phaser'|'flanger'|'filter'|'widener'|'bitcrusher'|'transient';
export interface ParamSpec {
 id:string;label:string;min:number;max:number;step:number;def:number;unit:string;
 /** Slider position follows the logarithm of the value. */
 log?:boolean;
 /** Value is an index into `choices`. */
 choices?:string[];
}
export interface FxSpec {kind:FxKind;label:string;description:string;params:ParamSpec[];reduction:boolean;}
export type FxSettings=Record<string,number>;
const p=(id:string,label:string,min:number,max:number,step:number,def:number,unit='',log=false):ParamSpec=>({id,label,min,max,step,def,unit,...(log?{log:true}:{})});
const c=(id:string,label:string,choices:string[],def=0):ParamSpec=>({id,label,min:0,max:choices.length-1,step:1,def,unit:'',choices});
/** Note values of tempo-synced delay and filter sweep, in quarter-note beats. */
export const noteValues:Array<{label:string;beats:number}>=[
 {label:'1/1',beats:4},{label:'1/2',beats:2},{label:'1/4',beats:1},{label:'1/8',beats:.5},{label:'1/16',beats:.25},
 {label:'1/2.',beats:3},{label:'1/4.',beats:1.5},{label:'1/8.',beats:.75},{label:'1/16.',beats:.375},
 {label:'1/2T',beats:4/3},{label:'1/4T',beats:2/3},{label:'1/8T',beats:1/3},{label:'1/16T',beats:1/6}
];
/** Delay choice 0 is free time in ms; choice i+1 is `noteValues[i]`. */
export const delaySync=['Free',...noteValues.map(n=>n.label)];
export const delayMaxMs=2000;
/** Capacity for the longest offered note at the tempo floor accepted by delayMs. */
export const delayBufferMaxMs=Math.max(...noteValues.map(n=>n.beats))*60000/20;
export function delayMs(sync:number,timeMs:number,bpm:number):number{
 const i=Math.round(sync)-1,note=noteValues[i]!;
 return note?note.beats*60000/Math.max(20,bpm):Math.min(delayMaxMs,Math.max(1,timeMs));
}
export const phaserStages=[4,6,8];
export const filterSweep=['4 bars','2 bars','1 bar','1/2','1/4','1/8'];
export const filterSweepBeats=[16,8,4,2,1,.5];
export const fxSpecs:Record<FxKind,FxSpec>={
 limiter:{kind:'limiter',label:'Limiter',description:'Keeps peaks under a ceiling with 3 ms look-ahead',reduction:true,params:[
  p('threshold','Threshold',-24,0,.1,0,'dB'),p('ceiling','Ceiling',-12,0,.1,-.3,'dB'),p('release','Release',10,1000,1,100,'ms',true)]},
 compressor:{kind:'compressor',label:'Compressor',description:'Evens out loud and quiet parts',reduction:true,params:[
  p('threshold','Threshold',-60,0,.1,-18,'dB'),p('ratio','Ratio',1,20,.1,4,':1',true),p('attack','Attack',.1,200,.1,10,'ms',true),p('release','Release',5,2000,1,120,'ms',true),
  p('knee','Knee',0,24,.1,6,'dB'),p('makeup','Makeup gain',-12,24,.1,0,'dB')]},
 delay:{kind:'delay',label:'Delay',description:'Echoes in note values of the project tempo or free time',reduction:false,params:[
  c('sync','Time mode',delaySync,3),p('time','Time',1,delayMaxMs,1,350,'ms',true),p('feedback','Feedback',0,95,1,35,'%'),
  p('tone','Feedback tone',500,20000,1,6000,'Hz',true),c('pingpong','Ping-pong',['Off','On']),p('mix','Mix',0,100,1,30,'%')]},
 saturation:{kind:'saturation',label:'Saturation',description:'Warm overdrive and distortion',reduction:false,params:[
  c('shape','Shape',['Soft','Hard']),p('drive','Drive',0,36,.1,12,'dB'),p('tone','Tone',500,20000,1,8000,'Hz',true),p('mix','Mix',0,100,1,100,'%'),p('output','Output',-12,12,.1,0,'dB')]},
 chorus:{kind:'chorus',label:'Chorus',description:'Thickens a sound with slowly moving copies',reduction:false,params:[
  p('rate','Rate',.1,8,.01,.8,'Hz',true),p('depth','Depth',0,100,1,50,'%'),p('mix','Mix',0,100,1,50,'%')]},
 phaser:{kind:'phaser',label:'Phaser',description:'Sweeping notches from all-pass stages',reduction:false,params:[
  p('rate','Rate',.05,10,.01,.4,'Hz',true),p('depth','Depth',0,100,1,70,'%'),p('feedback','Feedback',0,95,1,40,'%'),c('stages','Stages',['4','6','8']),p('mix','Mix',0,100,1,50,'%')]},
 flanger:{kind:'flanger',label:'Flanger',description:'Jet sweep from a short modulated delay',reduction:false,params:[
  p('rate','Rate',.05,5,.01,.25,'Hz',true),p('depth','Depth',0,100,1,70,'%'),p('feedback','Feedback',-95,95,1,50,'%'),p('mix','Mix',0,100,1,50,'%')]},
 filter:{kind:'filter',label:'Resonant Filter',description:'Low-pass, high-pass or band-pass with optional sweep',reduction:false,params:[
  c('type','Type',['Low-pass','High-pass','Band-pass']),p('cutoff','Cutoff',20,20000,1,1000,'Hz',true),p('resonance','Resonance',0,100,1,30,'%'),
  c('sweep','Sweep',['Off','Free','Tempo']),p('rate','Sweep rate',.05,10,.01,.5,'Hz',true),c('note','Sweep length',filterSweep,2),p('depth','Sweep depth',0,100,1,50,'%'),p('mix','Mix',0,100,1,100,'%')]},
 widener:{kind:'widener',label:'Stereo Widener',description:'Narrows or widens the stereo image; the mono sum stays the same',reduction:false,params:[
  p('width','Width',0,200,1,100,'%'),p('bassMono','Mono below',0,300,10,0,'Hz')]},
 bitcrusher:{kind:'bitcrusher',label:'Bitcrusher',description:'Lo-fi bit depth and sample-rate reduction',reduction:false,params:[
  p('bits','Bits',1,16,1,8),p('downsample','Rate reduction',1,32,1,4,'÷'),p('mix','Mix',0,100,1,100,'%')]},
 transient:{kind:'transient',label:'Transient Shaper',description:'Boosts or softens attacks and sustain',reduction:false,params:[
  p('attack','Attack',-100,100,1,0,'%'),p('sustain','Sustain',-100,100,1,0,'%'),p('output','Output',-12,12,.1,0,'dB')]}
};
export const fxKinds=Object.keys(fxSpecs) as FxKind[];
export const isFxKind=(v:unknown):v is FxKind=>typeof v==='string'&&Object.hasOwn(fxSpecs,v);
export function clampParam(spec:ParamSpec,v:unknown):number{
 if(typeof v!=='number'||!Number.isFinite(v))return spec.def;
 const x=Math.min(spec.max,Math.max(spec.min,v)),snapped=spec.min+Math.round((x-spec.min)/spec.step)*spec.step;
 return Math.min(spec.max,Math.max(spec.min,+snapped.toFixed(6)));
}
export function defaultFx(kind:FxKind):FxSettings{return Object.fromEntries(fxSpecs[kind]!.params.map(s=>[s.id,s.def]));}
/** Fills missing values with defaults, clamps to range and snaps to the step; unknown keys are dropped. */
export function normalizeFx(kind:FxKind,raw:unknown):FxSettings{
 const o=raw&&typeof raw==='object'?raw as Record<string,unknown>:{};
 return Object.fromEntries(fxSpecs[kind]!.params.map(s=>[s.id,clampParam(s,o[s.id]!)]));
}
/** Maps a value to 0..1 slider position (logarithmic when the spec asks for it). */
export function toSlider(spec:ParamSpec,v:number):number{
 const x=Math.min(spec.max,Math.max(spec.min,v));
 return spec.log?Math.log(x/spec.min)/Math.log(spec.max/spec.min):(x-spec.min)/(spec.max-spec.min);
}
export function fromSlider(spec:ParamSpec,t:number):number{
 const u=Math.min(1,Math.max(0,t));
 return clampParam(spec,spec.log?spec.min*Math.pow(spec.max/spec.min,u):spec.min+u*(spec.max-spec.min));
}
export function formatParam(spec:ParamSpec,v:number):string{
 if(spec.choices)return spec.choices[Math.round(v)]!??String(v);
 const decimals=spec.step>=1?0:spec.step>=.1?1:2,abs=Math.abs(v);
 const text=spec.unit==='Hz'&&abs>=1000?`${(v/1000).toFixed(abs>=10000?1:2)} kHz`:`${v.toFixed(decimals)}${spec.unit?` ${spec.unit}`:''}`;
 return text.replace(/^-0(\.0+)?( |$)/,'0$1$2');
}
