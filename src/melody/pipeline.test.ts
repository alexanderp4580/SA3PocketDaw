import {it,expect} from 'vitest';
import {generateBars} from './pipeline';
const request={bpm:120,key:'C',scale:'major',startBar:2,bars:2,style:'gentle',seed:1};
it('generates piano audio, resamples it, transcribes it and places notes in the selected bars',async()=>{
 let params:any;let audio:Float32Array|undefined;
 const out=await generateBars(request,{generate:async p=>{params=p;return {channels:[new Float32Array(44100*4).fill(.1)],sampleRate:44100};},transcribe:async a=>{audio=a;return [{onset:0,offset:.5,pitch:60,velocity:100}];}});
 expect(params.seconds).toBe(4);expect(params.prompt).toContain('120 BPM');expect(audio?.length).toBe(64000);expect(out.notes[0]!.start).toBe(16);expect(out.raw).toHaveLength(1);
});
it('does not transcribe after cancellation during generation',async()=>{const c=new AbortController();let called=false;await expect(generateBars(request,{signal:c.signal,generate:async()=>{c.abort();return {channels:[new Float32Array(10)],sampleRate:16000};},transcribe:async()=>{called=true;return [];}})).rejects.toThrow(/Cancel/);expect(called).toBe(false);});
it('rejects empty transcription without producing an accepted take',async()=>{await expect(generateBars(request,{generate:async()=>({channels:[new Float32Array(10)],sampleRate:16000}),transcribe:async()=>[]})).rejects.toThrow(/No playable notes/);});
it('rejects ranges longer than the demo model duration before generating',async()=>{let called=false;await expect(generateBars({...request,bpm:40,bars:4},{generate:async()=>{called=true;throw Error();},transcribe:async()=>[]})).rejects.toThrow(/12 seconds/);expect(called).toBe(false);});
