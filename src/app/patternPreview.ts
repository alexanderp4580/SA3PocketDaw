import {trackBars,type Track} from '../store/projectModel';
/** Note rectangles for the shared timeline, repeating each track's own pattern. */
export function previewNotes(track:Track,timeline:number,legacyBars:number){
 const length=trackBars(track,legacyBars)*16,total=timeline*16;
 const active=track.notes.filter(n=>n.start>=0&&n.start<length);
 const min=active.length?Math.floor(Math.min(...active.map(n=>n.midi))/12)*12:60;
 const max=Math.max(min+11,...active.map(n=>n.midi));
 const rows=max-min+1;
 const notes=[];
 for(let offset=0;offset<total;offset+=length)for(const n of active){const start=offset+n.start;if(start>=total)continue;notes.push({...n,start,length:Math.min(n.length,length-n.start,total-start),y:max-n.midi});}
 return {notes,rows,total};
}
