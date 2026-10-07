import { log } from '../../log';
import { ingestWorkerMessage } from '../../log/logger';
import type { InstrumentProfile,PreparedNote } from './types';
let worker:Worker|null=null,id=0;
const jobs=new Map<number,{resolve:(v:unknown)=>void;reject:(e:Error)=>void;progress?:(f:number)=>void}>();
function request<T>(data:object,signal?:AbortSignal,progress?:(f:number)=>void):Promise<T>{
 if(signal?.aborted)return Promise.reject(Object.assign(new Error('Cancelled'),{code:'cancelled'}));
 if(!worker){worker=new Worker(new URL('./worker.ts',import.meta.url),{type:'module'});worker.onmessage=e=>{if(ingestWorkerMessage(log,e.data))return;const j=jobs.get(e.data.id);if(!j)return;if(e.data.type==='progress'){j.progress?.(e.data.fraction);return;}jobs.delete(e.data.id);e.data.error?j.reject(new Error(e.data.error)):j.resolve(e.data.result);};worker.onerror=e=>{for(const j of jobs.values())j.reject(new Error(e.message));jobs.clear();worker?.terminate();worker=null;};}
 const n=++id;return new Promise<T>((resolve,reject)=>{const abort=()=>{jobs.delete(n);reject(Object.assign(new Error('Cancelled'),{code:'cancelled'}));};signal?.addEventListener('abort',abort,{once:true});jobs.set(n,{resolve:v=>{signal?.removeEventListener('abort',abort);resolve(v as T);},reject:e=>{signal?.removeEventListener('abort',abort);reject(e);},progress});worker!.postMessage({...data,id:n});});
}
export const analyseInstrument=(pcm:Float32Array,sampleRate:number,dynamics:'sustain'|'decay',signal?:AbortSignal,progress?:(f:number)=>void)=>request<InstrumentProfile>({type:'analyse',pcm,sampleRate,dynamics},signal,progress);
export const prepareInstrumentNote=(profile:InstrumentProfile,midi:number)=>request<PreparedNote>({type:'prepare',profile,midi});
