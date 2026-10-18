import type {Project,Track,Note,Bars} from '../store/projectModel';
/** Keep every source referenced so a temporary audition cannot evict other instruments. */
export function previewProject(project:Project,track:Track,notes:Note[],startBar:number,bars:number):Project{
 const draft:Track={...track,...(!track.sampleId&&track.soundType!=='preset'?{soundType:'preset' as const,presetId:'mini-piano'}:{}),notes:notes.map(n=>({...n,start:n.start-(startBar-1)*16})),bars:bars as Bars,muted:false,solo:false};
 return {...project,bars:bars as Bars,loop:{startBar:1,endBar:bars},tracks:project.tracks.map(t=>t.id===track.id?draft:{...t,muted:true,solo:false,notes:[]})};
}
