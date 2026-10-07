import {it,expect} from 'vitest';
import {createEngine} from '../engine';import {createProject,addTrack,setTrackSample} from '../../store/projectModel';
it('scheduled and audition sources route to independent track buses, previews to master',async()=>{
 const targets:string[]=[];let n=0;const ctx:any={currentTime:0,destination:'speaker',createBuffer:()=>({duration:1,copyToChannel(){}}),createGain:()=>({id:`gain${n++}`,gain:{value:1,setValueAtTime(){},linearRampToValueAtTime(){}},connect(x:any){if(x.id)targets.push(x.id);}}),createBufferSource:()=>({buffer:null,playbackRate:{value:1},connect(){},start(){},stop(){}})};
 const buses=new Map<string,any>();const e=createEngine({createContext:()=>ctx,createMixer:(_ctx,master)=>({sync(p:any){for(const t of p.tracks)if(!buses.has(t.id))buses.set(t.id,{id:t.id});},input:(id:string)=>buses.get(id),clear(){},meter:()=>({rms:[0,0],peak:[0,0],clip:false}),spectrum:()=>null,listen(){},error:()=>null,retry(){},sampleRate:48000})});
 let p=addTrack(addTrack(createProject(),'A','a'),'B','b');p=setTrackSample(setTrackSample(p,'a','same'),'b','same');e.setProject(p);e.setSample('same',new Float32Array(128),48000);await e.audition('a',60);await e.audition('b',60);await e.previewSource(new Float32Array(128),48000);expect(targets).toEqual(['a','b','gain0']);
});
