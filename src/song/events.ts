import {trackBars,velocityGain,type Project} from '../store/projectModel';
import type {NoteEvent} from '../audio/scheduler';
import {arrangement} from './arrangement';
export interface CompiledSong {events:NoteEvent[];duration:number}
export function compileSong(p:Project):CompiledSong {
 const a=arrangement(p),step=60/p.bpm/4,events:NoteEvent[]=[];const solo=p.tracks.some(t=>t.solo);
 for(const b of a.blocks){const t=p.tracks.find(t=>t.id===b.trackId);if(!t||t.muted||(solo&&!t.solo))continue;
 const next=a.blocks.filter(x=>x.trackId===b.trackId&&x.startBar>b.startBar).reduce((v,x)=>Math.min(v,x.startBar),a.bars+1);
 const length=Math.min(trackBars(t,p.bars),next-b.startBar,a.bars-b.startBar+1)*16;
 for(const n of t.notes){if(n.start<0||n.start>=length||n.length<=0)continue;
 events.push({trackId:t.id,noteId:b.id+':'+n.id,midi:n.midi,when:((b.startBar-1)*16+n.start)*step,duration:Math.min(n.length,length-n.start)*step,velocity:velocityGain(n.velocity)});}
 }
 return {events:events.sort((a,b)=>a.when-b.when),duration:a.bars*16*step};
}
