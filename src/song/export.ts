import type {Project} from '../store/projectModel';
import type {StoredSample} from '../store/projectStore';
import {compileSong} from './events';
import {renderSong,trimTail} from './render';
import {log} from '../log';
const scope=log.scope('song.export');
export interface ExportProgress {stage:'Preparing'|'Rendering'|'Encoding';fraction:number}
export interface ExportOptions {signal?:AbortSignal;onProgress?:(p:ExportProgress)=>void}
export function checkAbort(signal?:AbortSignal){if(signal?.aborted)throw new DOMException('Export cancelled','AbortError');}
export function mp3Filename(name:string){return (name.replace(/[\/\\:*?"<>|]/g,'').replace(/^\.+/,'').trim()||'My song')+'.mp3';}
export async function loadSongSnapshot(project:Project,store:{getSample:(id:string)=>Promise<StoredSample|null>},signal?:AbortSignal){
 checkAbort(signal);const snapshot=structuredClone(project),song=compileSong(snapshot);if(!song.events.length)throw Error('Add audible notes to the layout before exporting.');
 const sounds=new Map<string,StoredSample>();for(const id of new Set(song.events.map(e=>e.trackId))){checkAbort(signal);const track=snapshot.tracks.find(t=>t.id===id)!;const sample=track.sampleId?await store.getSample(track.sampleId):null;checkAbort(signal);if(!sample)throw Error(track.name+': sound is missing. Generate or restore it before exporting.');sounds.set(id,sample);}
 return {project:snapshot,sounds};
}
export async function exportSong(project:Project,store:{getSample:(id:string)=>Promise<StoredSample|null>},options:ExportOptions={}):Promise<Blob>{
 const {signal,onProgress}=options;let worker:Worker|null=null;
 try{scope.info('start',{bars:project.arrangement?.bars});onProgress?.({stage:'Preparing',fraction:0});const snapshot=await loadSongSnapshot(project,store,signal);
 const buffer=await renderSong(snapshot.project,snapshot.sounds,options);checkAbort(signal);const pcm=trimTail([buffer.getChannelData(0),buffer.getChannelData(1)],44100,compileSong(snapshot.project).duration);onProgress?.({stage:'Encoding',fraction:0});checkAbort(signal);
 worker=new Worker(new URL('./mp3.worker.ts',import.meta.url),{type:'module'});const active=worker;
 const blob=await new Promise<Blob>((resolve,reject)=>{const abort=()=>reject(new DOMException('Export cancelled','AbortError'));
 signal?.addEventListener('abort',abort,{once:true});const cleanup=()=>signal?.removeEventListener('abort',abort);
 active.onerror=e=>{cleanup();reject(Error(e.message));};active.onmessage=e=>{const m=e.data;if(m.type==='progress')onProgress?.({stage:'Encoding',fraction:m.fraction});else {cleanup();m.type==='done'?resolve(m.blob):reject(Error(m.message));}};
 active.postMessage({left:pcm[0],right:pcm[1]},[pcm[0]!.buffer,pcm[1]!.buffer]);});
 checkAbort(signal);scope.info('complete',{bytes:blob.size});return blob;
 }catch(e){scope.error('export stopped',{error:String(e)});throw e;}finally{worker?.terminate();}
}
