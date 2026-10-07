import {describe,it,expect} from 'vitest';
import {createProject,addTrack,addNote,removeTrack} from '../store/projectModel';
import {placeBlock,repeatBlock,moveBlock,removeBlock,resizeSong,duplicateRange,addAllPatterns,normalizeArrangement} from './arrangement';
import {compileSong} from './events';
function fixture(){let p=addTrack(createProject({bpm:120,bars:2}),'Bass','t');return addNote(p,'t',{id:'n',midi:57,start:0,length:32,velocity:127});}
describe('song placements',()=>{
 it('places a full pattern, prevents overlap and rejects out-of-bounds',()=>{const p=placeBlock(fixture(),'t',1,'a');expect(p.arrangement?.blocks).toEqual([{id:'a',trackId:'t',startBar:1}]);expect(placeBlock(p,'t',2,'b')).toBe(p);expect(placeBlock(p,'t',16,'b')).toBe(p);expect(placeBlock(p,'unknown',3)).toBe(p);});
 it('repeats, moves and removes placements without changing notes',()=>{const p=placeBlock(fixture(),'t',1,'a'),q=repeatBlock(p,'a','b');expect(q.arrangement?.blocks[1]?.startBar).toBe(3);const moved=moveBlock(q,'b',5);expect(moved.arrangement?.blocks[1]?.startBar).toBe(5);expect(moveBlock(moved,'b',2)).toBe(moved);expect(removeBlock(moved,'a').arrangement?.blocks).toHaveLength(1);expect(moved.tracks[0]?.notes).toEqual(p.tracks[0]?.notes);});
 it('copies ranges atomically and add-all aligns tracks',()=>{let p=addTrack(fixture(),'Drums','d');p=addAllPatterns(p,1);expect(p.arrangement?.blocks.map(b=>b.startBar)).toEqual([1,1]);p=duplicateRange(p,1,2);expect(p.arrangement?.blocks.map(b=>b.startBar)).toEqual([1,1,3,3]);expect(duplicateRange(p,1,2)).toBe(p);});
 it('requires explicit trim and removes blocks when their track is removed',()=>{let p=placeBlock(fixture(),'t',9,'a');expect(resizeSong(p,4)).toBe(p);p=resizeSong(p,4,true);expect(p.arrangement?.blocks).toEqual([]);expect(p.arrangement?.bars).toBe(4);expect(removeTrack(placeBlock(fixture(),'t',1,'a'),'t').arrangement?.blocks).toEqual([]);});
 it('normalizes invalid persisted placements and leaves legacy projects untouched',()=>{const p=fixture();expect(normalizeArrangement(p)).toBe(p);const q=normalizeArrangement({...p,arrangement:{bars:Infinity,blocks:[{id:'a',trackId:'t',startBar:1},{id:'a',trackId:'t',startBar:3},{id:'x',trackId:'bad',startBar:1}]}});expect(q.arrangement?.bars).toBe(16);expect(q.arrangement?.blocks).toEqual([{id:'a',trackId:'t',startBar:1}]);});
});
describe('song events',()=>{
 it('compiles gaps, repeats and trims held notes to placement boundary',()=>{let p=placeBlock(fixture(),'t',3,'a');p=repeatBlock(p,'a','b');const song=compileSong(p);expect(song.duration).toBe(32);expect(song.events.map(e=>[e.when,e.duration,e.velocity])).toEqual([[4,4,1],[8,4,1]]);});
 it('honors mute and solo and leaves empty bars silent',()=>{let p=addAllPatterns(addTrack(fixture(),'Drums','d'),1);p={...p,tracks:p.tracks.map(t=>({...t,solo:t.id==='d'}))};expect(compileSong(p).events).toHaveLength(0);p={...p,tracks:p.tracks.map(t=>({...t,solo:false,muted:t.id==='t'}))};expect(compileSong(p).events).toHaveLength(0);});
});
it('keeps existing placements after extending the shared piano-roll pattern',()=>{
 let p=placeBlock(fixture(),'t',1,'a');p=repeatBlock(p,'a','b');p={...p,tracks:p.tracks.map(t=>({...t,bars:4}))};
 const loaded=normalizeArrangement(p);expect(loaded.arrangement?.blocks).toHaveLength(2);
 expect(compileSong(loaded).events.map(e=>[e.when,e.duration])).toEqual([[0,4],[4,4]]);
});
