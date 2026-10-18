import {it,expect} from 'vitest';
import {createProject,addTrack,setTrackSample,setTrackPreset} from '../store/projectModel';
import {previewProject} from './preview';
it('keeps every instrument source installed while auditioning only the draft and does not mutate the saved project',()=>{
 let p=createProject({id:'p',bpm:120});p=addTrack(p,'Lead','lead');p=addTrack(p,'Pad','pad');p=setTrackPreset(p,'lead','mini-piano');p=setTrackSample(p,'pad','analysed-pad',57,'instrument');
 const notes=[{id:'n',midi:60,start:16,length:4}];
 const next=previewProject(p,p.tracks[0]!,notes,2,1);
 expect(next.tracks).toHaveLength(2);expect(next.tracks[1]!.sampleId).toBe('analysed-pad');expect(next.tracks[1]!.muted).toBe(true);expect(next.tracks[0]!.notes[0]!.start).toBe(0);expect(next.loop).toEqual({startBar:1,endBar:1});expect(p.tracks[1]!.muted).toBe(false);expect(notes[0]!.start).toBe(16);
});
