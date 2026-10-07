import {InstrumentVoice} from '../audio/instrument/voice';
import {prepareNote} from '../audio/instrument/prepare';
import type {InstrumentProfile,PreparedNote} from '../audio/instrument/types';
import type {InstrumentControls} from '../audio/instrument/controls';
const assets=new Map<number,PreparedNote>();let last:InstrumentProfile|null=null;
self.onmessage=(e:MessageEvent<{profile:InstrumentProfile;midi:number;duration:number;velocity:number;controls?:Partial<InstrumentControls>}>)=>{
 try{const {profile,midi,duration,velocity,controls}=e.data;
 // Each export track gets its own worker, so prepared pitches remain reusable.
 if(!last){last=profile;}let prepared=assets.get(midi);if(!prepared){prepared=prepareNote(profile,midi);assets.set(midi,prepared);}
 const voice=new InstrumentVoice(profile,prepared,midi,44100,duration,velocity,controls),pcm=new Float32Array(voice.endFrame);
 voice.render(pcm,0,pcm.length);self.postMessage({pcm},[pcm.buffer]);
 }catch(e){self.postMessage({error:String(e)});}
};
