import { log } from '../../log';
import { ingestWorkerMessage } from '../../log/logger';
import type { InstrumentProfile,PreparedNote } from './types';
interface Job {worker:number;resolve:(v:unknown)=>void;reject:(e:Error)=>void;progress?:(f:number)=>void}
/** Analysis runs on worker 0; note preparation spreads over up to POOL workers, least busy first. */
const POOL=Math.max(1,Math.min(3,(globalThis.navigator?.hardwareConcurrency??2)-1));
const workers:Array<Worker|null>=Array.from({length:POOL},()=>null);
const jobs=new Map<number,Job>();
let id=0;
function workerAt(slot:number):Worker{
 let w=workers[slot];if(w)return w;
 w=new Worker(new URL('./worker.ts',import.meta.url),{type:'module'});workers[slot]=w;
 w.onmessage=e=>{if(ingestWorkerMessage(log,e.data))return;const j=jobs.get(e.data.id);if(!j)return;if(e.data.type==='progress'){j.progress?.(e.data.fraction);return;}jobs.delete(e.data.id);e.data.error?j.reject(new Error(e.data.error)):j.resolve(e.data.result);};
 w.onerror=e=>{for(const [key,j] of jobs)if(j.worker===slot){jobs.delete(key);j.reject(new Error(e.message));}w?.terminate();workers[slot]=null;};
 return w;
}
const busyness=(slot:number)=>{let n=0;for(const j of jobs.values())if(j.worker===slot)n++;return n;};
const leastBusy=()=>{let best=0;for(let s=1;s<POOL;s++)if(busyness(s)<busyness(best))best=s;return best;};
function request<T>(data:object,slot:number,signal?:AbortSignal,progress?:(f:number)=>void):Promise<T>{
 if(signal?.aborted)return Promise.reject(Object.assign(new Error('Cancelled'),{code:'cancelled'}));
 const worker=workerAt(slot),n=++id;
 return new Promise<T>((resolve,reject)=>{const abort=()=>{jobs.delete(n);reject(Object.assign(new Error('Cancelled'),{code:'cancelled'}));};signal?.addEventListener('abort',abort,{once:true});jobs.set(n,{worker:slot,resolve:v=>{signal?.removeEventListener('abort',abort);resolve(v as T);},reject:e=>{signal?.removeEventListener('abort',abort);reject(e);},progress});worker.postMessage({...data,id:n});});
}
export const analyseInstrument=(pcm:Float32Array,sampleRate:number,dynamics:'sustain'|'decay',signal?:AbortSignal,progress?:(f:number)=>void)=>request<InstrumentProfile>({type:'analyse',pcm,sampleRate,dynamics},0,signal,progress);
export const prepareInstrumentNote=(profile:InstrumentProfile,midi:number)=>request<PreparedNote>({type:'prepare',profile,midi},leastBusy());
