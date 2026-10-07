import { log } from '../../log';
import { forwardLogs } from '../../log/logger';
import { analyse } from './analysis';
import { prepareNote } from './prepare';
import type { InstrumentProfile } from './types';
forwardLogs(log,m=>self.postMessage(m));
self.onmessage=(event:MessageEvent)=>{const m=event.data as {id:number;type:'analyse'|'prepare';pcm:Float32Array;sampleRate:number;dynamics:'sustain'|'decay';profile:InstrumentProfile;midi:number};try{const result=m.type==='analyse'?analyse(m.pcm,m.sampleRate,m.dynamics,fraction=>self.postMessage({type:'progress',id:m.id,fraction})):prepareNote(m.profile,m.midi);self.postMessage({id:m.id,result});}catch(e){self.postMessage({id:m.id,error:e instanceof Error?e.message:String(e)});}};
