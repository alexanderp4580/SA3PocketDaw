import type {ReverbAlgorithm} from './model';
interface Exports {memory:WebAssembly.Memory;dr_create(sr:number):number;dr_destroy(p:number):void;dr_buffer(p:number,ch:number):number;dr_param(p:number,index:number,value:number):void;dr_process(p:number,n:number):void;dr_mute(p:number):void;_initialize?():void;}
export class DragonflyDSP {
 private e:Exports;private p:number;private buffers:Float32Array[];
 constructor(module:WebAssembly.Module,sr:number){const instance=new WebAssembly.Instance(module,{wasi_snapshot_preview1:{fd_close:()=>0,fd_seek:()=>0,fd_write:()=>0,proc_exit:()=>{throw Error('Dragonfly exited');}}});this.e=instance.exports as unknown as Exports;this.e._initialize?.();this.p=this.e.dr_create(sr);if(!this.p)throw Error('Dragonfly allocation failed');this.buffers=[0,1,2,3].map(ch=>new Float32Array(this.e.memory.buffer,this.e.dr_buffer(this.p,ch),128));}
 parameters(values:number[]){values.forEach((v,i)=>this.e.dr_param(this.p,i,v));}
 render(l:Float32Array,r:Float32Array,ol:Float32Array,or:Float32Array){this.buffers[0]!.set(l);this.buffers[1]!.set(r);this.e.dr_process(this.p,l.length);ol.set(this.buffers[2]!);or.set(this.buffers[3]!);}
 clear(){this.e.dr_mute(this.p);}
 dispose(){this.e.dr_destroy(this.p);}
}
const modules=new Map<ReverbAlgorithm,Promise<WebAssembly.Module>>();
export function loadDragonfly(algorithm:ReverbAlgorithm){let p=modules.get(algorithm);if(!p){p=fetch(`/dragonfly/${algorithm}.wasm`).then(async r=>{if(!r.ok)throw Error(`Dragonfly ${algorithm}: HTTP ${r.status}`);return WebAssembly.compile(await r.arrayBuffer());});modules.set(algorithm,p);p.catch(()=>modules.delete(algorithm));}return p;}
