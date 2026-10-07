import {expect,it} from 'vitest';
import {createProject,addTrack,setTrackBars,trackBars,timelineBars,setLoopRange,loopRange,toggleSolo,addNote} from './projectModel';
it('track lengths are independent and shrinking preserves notes',()=>{
 let p=addTrack(addTrack(createProject({bars:4}),'A','a'),'B','b');p=addNote(p,'a',{id:'late',midi:60,start:48,length:4});
 const q=setTrackBars(p,'a',1);expect(trackBars(q.tracks[0]!,q.bars)).toBe(1);expect(trackBars(q.tracks[1]!,q.bars)).toBe(4);expect(q.tracks[0]!.notes).toEqual(p.tracks[0]!.notes);expect(timelineBars(q)).toBe(4);
 expect(addNote(q,'a',{midi:62,start:16,length:1})).toBe(q);
});
it('legacy tracks inherit the saved length and range stays valid',()=>{
 const p=createProject({bars:3});const t={id:'t',name:'t',muted:false,sampleId:null,rootMidi:60,notes:[]};
 expect(trackBars(t,p.bars)).toBe(3);const q={...p,tracks:[t]};expect(loopRange(q)).toEqual({startBar:1,endBar:3});expect(loopRange(setLoopRange(q,2,3))).toEqual({startBar:2,endBar:3});
 expect(loopRange(setTrackBars(setLoopRange(q,2,3),'t',1))).toEqual({startBar:1,endBar:1});
});
it('solo is independent of mute and can select multiple tracks',()=>{
 const p=addTrack(addTrack(createProject(),'A','a'),'B','b');const q=toggleSolo(toggleSolo(p,'a'),'b');expect(q.tracks.every(t=>t.solo)).toBe(true);expect(q.tracks.every(t=>!t.muted)).toBe(true);expect(toggleSolo(q,'a').tracks[0]!.solo).toBe(false);
});
