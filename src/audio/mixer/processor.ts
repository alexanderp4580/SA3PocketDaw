import {EqProcessor} from './eq';
import {DragonflyDSP} from './dragonfly';
import {type FxView,type EqBand,dragonfly} from './model';
import {fxView,normalizeMix} from './plugins';
import {StereoMeter} from './meter';
declare const sampleRate:number;
declare class AudioWorkletProcessor {port:MessagePort;constructor();}
declare function registerProcessor(name:string,processor:typeof AudioWorkletProcessor):void;
class Processor extends AudioWorkletProcessor {
 private disposed=false;private moduleRequest=0;private hasTail=false;private flush=0;private eq=new EqProcessor(sampleRate);private mix:FxView=fxView(normalizeMix());private listen:EqBand|null=null;
 private dspAlgorithm:FxView['reverb']['algorithm']='hall';private dsp:DragonflyDSP|null=null;private old:DragonflyDSP|null=null;private cross=1;private wet=0;private idle=sampleRate*60;
 private el=new Float32Array(128);private er=new Float32Array(128);private wl=new Float32Array(128);private wr=new Float32Array(128);private oldL=new Float32Array(128);private oldR=new Float32Array(128);private zero=new Float32Array(128);
 constructor(options?:{processorOptions?:{mix?:FxView;module?:WebAssembly.Module;algorithm?:FxView['reverb']['algorithm']}}){super();const initial=options?.processorOptions;if(initial?.mix){this.mix=initial.mix;this.eq.set(this.mix.eq);}if(initial?.module){this.dspAlgorithm=initial.algorithm??this.mix.reverb.algorithm;this.dsp=new DragonflyDSP(initial.module,sampleRate);this.updateParameters();this.idle=0;}this.port.onmessage=e=>{const m=e.data;try{if(m.type==='mix'){this.mix=m.mix;this.eq.set(this.mix.eq,this.listen);this.updateParameters();}else if(m.type==='listen'){this.listen=m.band;this.eq.set(this.mix.eq,this.listen);}else if(m.type==='module'){const request=++this.moduleRequest;return WebAssembly.compile(m.bytes).then(module=>{if(this.disposed||request!==this.moduleRequest)return;const replacement=new DragonflyDSP(module,sampleRate);try{this.applyParameters(replacement,m.algorithm);}catch(error){replacement.dispose();throw error;}this.old?.dispose();this.old=this.dsp;this.dspAlgorithm=m.algorithm;this.dsp=replacement;this.cross=0;this.idle=0;this.port.postMessage({type:'ready',algorithm:m.algorithm});}).catch(error=>this.port.postMessage({type:'error',message:String(error)}));}else if(m.type==='clear'){this.flush=Math.ceil(sampleRate*.01);this.eq.clear();this.dsp?.clear();this.old?.clear();this.idle=sampleRate*60;}else if(m.type==='dispose'){this.disposed=true;this.dsp?.dispose();this.old?.dispose();this.dsp=null;this.old=null;}}catch(error){this.port.postMessage({type:'error',message:String(error)});}};}
 private updateParameters(){if(this.dsp)this.applyParameters(this.dsp,this.dspAlgorithm);}
 private applyParameters(dsp:DragonflyDSP,a:FxView['reverb']['algorithm']){const values=[...this.mix.reverb.parameters[a]];values[0]=0;if(a==='plate')values[1]=100;else {const late=a==='hall'?2:3,total=values[1]!+values[late]!;values[1]=total?values[1]!/total*100:30;values[late]=total?values[late]!/total*100:70;}dsp.parameters(values);}
 process(inputs:Float32Array[][],outputs:Float32Array[][]){if(this.disposed)return false;const out=outputs[0],l=inputs[0]?.[0]??this.zero,r=inputs[0]?.[1]??l;if(!out?.[0])return true;
 if(this.flush>0){this.flush-=128;out[0].fill(0);out[1]?.fill(0);outputs[1]?.[0]?.fill(0);outputs[1]?.[1]?.fill(0);this.eq.clear();this.dsp?.clear();this.old?.clear();return true;}
 this.eq.process(l,r,this.el,this.er);outputs[1]?.[0]?.set(this.el);outputs[1]?.[1]?.set(this.er);const target=this.mix.reverb.bypass||!this.dsp?0:this.mix.reverb.wet;
 let signal=false;for(let i=0;i<128;i++)if(Math.abs(this.el[i]!)>1e-8||Math.abs(this.er[i]!)>1e-8){signal=true;break;}
 this.idle=signal?0:this.idle+128;const a=this.mix.reverb.algorithm,p=dragonfly[a].params.find(p=>p.name==='Decay'),decay=p?this.mix.reverb.parameters[a][p.index]!:3;
 this.wl.fill(0);this.wr.fill(0);
 if(this.dsp&&(target>0||this.wet>1e-5)&&this.idle<sampleRate*(decay*3+2)){this.dsp.render(this.el,this.er,this.wl,this.wr);if(this.old&&this.cross<1)this.old.render(this.el,this.er,this.oldL,this.oldR);this.hasTail=true;}else if(this.hasTail){this.dsp?.clear();this.old?.clear();this.hasTail=false;}
 for(let i=0;i<128;i++){this.wet+=(target-this.wet)*.002;this.cross=Math.min(1,this.cross+1/(sampleRate*.03));let wl=this.wl[i]!,wr=this.wr[i]!;if(this.old){wl=wl*this.cross+this.oldL[i]!*(1-this.cross);wr=wr*this.cross+this.oldR[i]!*(1-this.cross);}out[0][i]=this.el[i]!*(1-this.wet)+wl*this.wet;if(out[1])out[1][i]=this.er[i]!*(1-this.wet)+wr*this.wet;}
 if(this.old&&this.cross===1){this.old.dispose();this.old=null;}
 return true;
 }
}
class MeterProcessor extends AudioWorkletProcessor {
 private disposed=false;private meter=new StereoMeter(sampleRate);private frames=0;private zero=new Float32Array(128);
 constructor(){super();this.port.onmessage=e=>{if(e.data.type==='clear')this.meter.clear();else if(e.data.type==='dispose')this.disposed=true;};}
 process(inputs:Float32Array[][],outputs:Float32Array[][]){if(this.disposed)return false;const l=inputs[0]?.[0]??this.zero,r=inputs[0]?.[1]??l,o=outputs[0];o?.[0]?.set(l);o?.[1]?.set(r);this.meter.add(l,r);this.frames+=128;if(this.frames>=sampleRate/25){this.frames=0;this.port.postMessage(this.meter.read());}return true;}
}
registerProcessor('sa3-track-fx',Processor);registerProcessor('sa3-meter',MeterProcessor);
