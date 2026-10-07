import { expect,it } from 'vitest';
import { clearTrackNotes } from './edit';
import { emptyHistory,record,undo,redo } from './history';
import type { Track } from '../../store/projectModel';
it('clears only notes, preserves the sound and can undo and redo',()=>{
 const original:Track={id:'t',name:'Piano',muted:false,sampleId:'sound',soundType:'instrument',rootMidi:57,notes:[{id:'n',midi:60,start:0,length:2,velocity:96}]};
 const cleared=clearTrackNotes(original);expect(cleared).toEqual({...original,notes:[]});expect(original.notes).toHaveLength(1);
 const history=record(emptyHistory<Track>(),original),u=undo(history,cleared)!;expect(u.value).toEqual(original);expect(redo(u.history,u.value)!.value).toEqual(cleared);
 expect(clearTrackNotes(cleared)).toBe(cleared);
});
