import {trackBars,velocityGain,noteVelocity,type Project} from '../store/projectModel';
import type {TranscribedNote} from '../transcribe/notes';
import {barSeconds} from './take';
export interface ContextEvent {trackId:string;midi:number;when:number;duration:number;velocity:number}
export interface ContextPlan {events:ContextEvent[];background:TranscribedNote[];maskStart:number;maskEnd:number;seconds:number;contextIds:string[]}
export function defaultContextTracks(p:Project,target:string,categories:Record<string,string>={}):string[]{return p.tracks.filter(t=>t.id!==target&&!t.muted&&categories[t.presetId??'']!=='drums'&&t.notes.length&&(t.soundType==='preset'||t.soundType==='instrument')).map(t=>t.id);}
/** Include every audible-source edit in the take stamp so a preview cannot outlive its song. */
export function contextStamp(p:Project,ids:string[]):string{return JSON.stringify([p.key,p.scale,p.bpm,ids,p.tracks.map(t=>[t.id,t.bars,t.notes,t.muted,t.solo,t.sampleId,t.soundType,t.presetId,t.trim,t.instrumentControls,t.sampleControls,t.mix])]);}
/** Two bars before and after the gap, phase-aligned to each track's repeating piano-roll pattern. */
export function contextPlan(p:Project,targetId:string,startBar:number,bars:number,contextIds:string[]):ContextPlan{
 const target=p.tracks.find(t=>t.id===targetId);
 if(!target||!Number.isInteger(startBar)||startBar<1||!Number.isInteger(bars)||bars<1||bars>2||startBar+bars-1>trackBars(target,p.bars))throw Error('Choose a range of one or two bars inside this track.');
 const step=15/p.bpm,mask=(startBar-1)*16,end=mask+bars*16,lo=mask-32,hi=end+32;
 const events:ContextEvent[]=[],background:TranscribedNote[]=[];
 const chosen=new Set(contextIds),used:string[]=[];
 for(const t of p.tracks){if(t.id!==targetId&&(!chosen.has(t.id)||t.muted))continue;
  const seed=t.id===targetId?t.notes.filter(n=>n.start<end&&n.start+n.length>mask).map(n=>({...n,start:Math.max(mask,n.start)-mask,length:Math.min(end,n.start+n.length)-Math.max(mask,n.start)})):[];
  const isSeed=seed.length>0,origin=isSeed?mask:0,length=isSeed?bars*16:trackBars(t,p.bars)*16,source=isSeed?seed:t.notes;let had=false;
  for(let cycle=Math.floor((lo-origin)/length)-1;cycle<=Math.floor((hi-origin)/length);cycle++)for(const n of source){
   if(n.start<0||n.start>=length||n.length<=0)continue;
   const a=origin+cycle*length+n.start,b=origin+cycle*length+Math.min(length,n.start+n.length);
   if(b<=lo||a>=hi)continue;
   if(t.id!==targetId&&a<end&&b>mask)background.push({onset:(Math.max(a,mask)-mask)*step,offset:(Math.min(b,end)-mask)*step,pitch:n.midi,velocity:noteVelocity(n)});
   for(const [from,to] of [[lo,mask]]){const begin=Math.max(a,from!),finish=Math.min(b,to!);if(finish>begin){events.push({trackId:t.id,midi:n.midi,when:(begin-lo)*step,duration:(finish-begin)*step,velocity:velocityGain(n.velocity)});had=true;}}
  }
  if(had&&t.id!==targetId)used.push(t.id);
 }
 events.push(...events.map(e=>({...e,when:e.when+(32+bars*16)*step})));
 if(!events.length)throw Error('Add notes to a pitched context track, or draw a seed phrase on this track first.');
 return {events:events.sort((a,b)=>a.when-b.when||a.midi-b.midi),background:background.sort((a,b)=>a.onset-b.onset||a.pitch-b.pitch),maskStart:32*step,maskEnd:(32+bars*16)*step,seconds:Math.max(6,barSeconds(4+bars,p.bpm)),contextIds:used};
}
