import {newId,trackBars,type Project} from '../store/projectModel';
export interface SongBlock {id:string;trackId:string;startBar:number}
export interface Arrangement {blocks:SongBlock[]}
export const MAX_SONG_BARS=256,MIN_GRID_BARS=16,GRID_TAIL_BARS=8;
export function arrangement(p:Project):Arrangement{return p.arrangement??{blocks:[]};}
export function blockBars(p:Project,b:SongBlock){return trackBars(p.tracks.find(t=>t.id===b.trackId)??{id:b.trackId},p.bars);}
/** Last bar covered by any block; 0 when the arrangement is empty. */
export function arrangementBars(p:Project){return arrangement(p).blocks.reduce((n,b)=>Math.max(n,b.startBar+blockBars(p,b)-1),0);}
/** Bars shown in the layout grid: the song plus a tail of empty bars, at least MIN_GRID_BARS. */
export function gridBars(p:Project){return Math.min(MAX_SONG_BARS,Math.max(MIN_GRID_BARS,arrangementBars(p)+GRID_TAIL_BARS));}
export function canPlace(p:Project,trackId:string,startBar:number,except?:string):boolean {
 const a=arrangement(p),t=p.tracks.find(t=>t.id===trackId);if(!t||!Number.isInteger(startBar)||startBar<1)return false;
 const end=startBar+trackBars(t,p.bars);return end<=MAX_SONG_BARS+1&&!a.blocks.some(b=>b.id!==except&&b.trackId===trackId&&startBar<b.startBar+blockBars(p,b)&&end>b.startBar);
}
export function placeBlock(p:Project,trackId:string,startBar:number,id=newId('sb')):Project {
 if(!canPlace(p,trackId,startBar)||arrangement(p).blocks.some(b=>b.id===id))return p;
 const a=arrangement(p);return {...p,arrangement:{...a,blocks:[...a.blocks,{id,trackId,startBar}]}};
}
export function repeatBlock(p:Project,id:string,nextId=newId('sb')) {const b=arrangement(p).blocks.find(b=>b.id===id);return b?placeBlock(p,b.trackId,b.startBar+blockBars(p,b),nextId):p;}
export function moveBlock(p:Project,id:string,startBar:number):Project {const a=arrangement(p),b=a.blocks.find(b=>b.id===id);return !b||b.startBar===startBar||!canPlace(p,b.trackId,startBar,id)?p:{...p,arrangement:{...a,blocks:a.blocks.map(b=>b.id===id?{...b,startBar}:b)}};}
export function removeBlock(p:Project,id:string):Project {const a=arrangement(p);return a.blocks.some(b=>b.id===id)?{...p,arrangement:{...a,blocks:a.blocks.filter(b=>b.id!==id)}}:p;}
export function addAllPatterns(p:Project,startBar:number):Project {let next=p;for(const t of p.tracks){const q=placeBlock(next,t.id,startBar);if(q===next)return p;next=q;}return next;}
export function duplicateRange(p:Project,start:number,end:number):Project {
 if(!Number.isInteger(start)||!Number.isInteger(end)||start<1||end<start)return p;
 const blocks=arrangement(p).blocks.filter(b=>b.startBar>=start&&b.startBar<=end);if(!blocks.length||blocks.some(b=>b.startBar+blockBars(p,b)>end+1))return p;
 let next=p;for(const b of blocks){const q=placeBlock(next,b.trackId,b.startBar+end-start+1);if(q===next)return p;next=q;}return next;
}
export function normalizeArrangement(p:Project):Project {
 if(!p.arrangement)return p;
 const a=p.arrangement;let next:Project={...p,arrangement:{blocks:[]}};
 if(Array.isArray(a.blocks))for(const b of a.blocks)if(b&&typeof b.id==='string'&&typeof b.trackId==='string'&&Number.isInteger(b.startBar)&&b.startBar>=1&&p.tracks.some(t=>t.id===b.trackId)&&b.startBar+blockBars(p,b)<=MAX_SONG_BARS+1&&!next.arrangement!.blocks.some(x=>x.id===b.id||x.trackId===b.trackId&&x.startBar===b.startBar))next.arrangement!.blocks.push({...b});
 return next;
}
