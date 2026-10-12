import { log } from '../../log';
import { forwardLogs } from '../../log/logger';
import { analyse } from './analysis';
import { prepareNote } from './prepare';
import { createProfileStore,PROFILE_CAPACITY } from './profileShare';
import type { InstrumentProfile } from './types';
forwardLogs(log,m=>self.postMessage(m));
const profiles=createProfileStore<InstrumentProfile>(PROFILE_CAPACITY);
interface Message {id:number;type:'analyse'|'prepare';pcm:Float32Array;sampleRate:number;dynamics:'sustain'|'decay';key:number;profile?:InstrumentProfile;midi:number}
self.onmessage=(event:MessageEvent)=>{
 const m=event.data as Message;
 try{
  if(m.type==='analyse'){self.postMessage({id:m.id,result:analyse(m.pcm,m.sampleRate,m.dynamics,fraction=>self.postMessage({type:'progress',id:m.id,fraction}))});return;}
  if(m.profile)profiles.put(m.key,m.profile);
  const profile=profiles.get(m.key);
  if(!profile){self.postMessage({id:m.id,error:'profile-missing'});return;}
  const result=prepareNote(profile,m.midi);
  self.postMessage({id:m.id,result},[result.attack.buffer,result.residual.buffer]);
 }catch(e){self.postMessage({id:m.id,error:e instanceof Error?e.message:String(e)});}
};
