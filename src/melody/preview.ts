import {trackBars,type Project,type Track,type Note,type Bars} from '../store/projectModel';
/** Unroll exactly the selected interval, including a note already held at its start. */
export function notesInRange(project:Project,track:Track,startBar:number,bars:number):Note[]{
 const from=(startBar-1)*16,to=from+bars*16,length=trackBars(track,project.bars)*16,out:Note[]=[];
 for(let cycle=Math.floor(from/length)-1;cycle<=Math.floor(to/length);cycle++)for(const n of track.notes){
  if(n.start<0||n.start>=length||n.length<=0)continue;
  const a=cycle*length+n.start,b=cycle*length+Math.min(length,n.start+n.length),begin=Math.max(a,from),end=Math.min(b,to);
  if(end>begin)out.push({...n,id:`preview:${cycle}:${n.id}`,start:begin-from,length:end-begin});
 }
 return out;
}
/** Keep every source referenced so temporary audition cannot evict another instrument. */
export function previewProject(project:Project,track:Track,notes:Note[],startBar:number,bars:number,withSong=false):Project{
 const draft:Track={...track,...(!track.sampleId&&track.soundType!=='preset'?{soundType:'preset' as const,presetId:'mini-piano'}:{}),notes:notes.map(n=>({...n,start:n.start-(startBar-1)*16})),bars:bars as Bars,muted:false,solo:false};
 return {...project,bars:bars as Bars,loop:{startBar:1,endBar:bars},tracks:project.tracks.map(t=>t.id===track.id?draft:{...t,bars:bars as Bars,muted:withSong?t.muted:true,solo:false,notes:withSong?notesInRange(project,t,startBar,bars):[]})};
}
