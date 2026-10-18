import {MIDI_MIN,MIDI_MAX,clampVelocity,newId,type Note} from '../store/projectModel';
import type {TranscribedNote} from '../transcribe/notes';
export const barSeconds=(bars:number,bpm:number)=>bars*240/bpm;
/** The editable style is always last; the fixed setup also serves Follow song. */
export function melodyPrompt(style:string,bpm:number,key:string,scale:string,bars:number,followSong=false){
 const setup=`TrackType: Instrument, Instruments: Piano, VocalType: Instrumental. Solo acoustic piano melody, ${bpm} BPM, ${key} ${scale}, 4/4 time, ${bars} bars. Dry close recording, clear individual note attacks and distinct pitches, steady rhythm, no vocals, drums, accompaniment or reverb.`;
 const phrase=followSong
  ?'A complementary melodic phrase in the gap, following the surrounding harmony and rhythm, with a smooth return to the repeated opening phrase.'
  :'A complete melodic phrase, starting immediately on the first beat.';
 return [setup,phrase,style.trim()].filter(Boolean).join(' ');
}
/** Convert raw note seconds to the roll's sixteenth-step format without changing pitch. */
export function notesForBars(raw:TranscribedNote[],bpm:number,startBar:number,bars:number,id=()=>newId('n')):Note[]{
 const total=bars*16,offset=(startBar-1)*16,seconds=barSeconds(bars,bpm),byKey=new Map<string,Note>();
 for(const r of raw){
  if(![r.onset,r.offset,r.pitch,r.velocity].every(Number.isFinite)||!Number.isInteger(r.pitch)||r.pitch<MIDI_MIN||r.pitch>MIDI_MAX||r.offset<=Math.max(0,r.onset)||r.onset>=seconds)continue;
  const start=Math.round(Math.max(0,r.onset)*bpm/15);if(start>=total)continue;
  const end=Math.min(total,Math.max(start+1,Math.round(r.offset*bpm/15)));
  const key=`${r.pitch}/${start}`,old=byKey.get(key);
  if(old){old.length=Math.max(old.length,end-start);old.velocity=Math.max(old.velocity??0,clampVelocity(r.velocity));}
  else byKey.set(key,{id:id(),midi:r.pitch,start:offset+start,length:end-start,velocity:clampVelocity(r.velocity)});
 }
 const notes=[...byKey.values()].sort((a,b)=>a.start-b.start||a.midi-b.midi);
 for(let i=0;i<notes.length;i++){const n=notes[i]!;const next=notes.slice(i+1).find(x=>x.midi===n.midi);if(next)n.length=Math.min(n.length,next.start-n.start);}
 return notes;
}
/** Replace just the requested bars; crossing notes keep their portions outside the range. */
export function replaceBars(old:Note[],take:Note[],startBar:number,bars:number,id=()=>newId('n')):Note[]{
 const a=(startBar-1)*16,b=a+bars*16,out:Note[]=[];
 for(const n of old){const end=n.start+n.length;
  if(end<=a||n.start>=b){out.push(n);continue;}
  if(n.start<a)out.push({...n,length:a-n.start});
  if(end>b)out.push({...n,id:n.start<a?id():n.id,start:b,length:end-b});
 }
 return [...out,...take].sort((a,b)=>a.start-b.start||a.midi-b.midi);
}
export interface TakeStamp {context?:string;key?:string;projectId:string;trackId:string;bpm:number;bars:number;notes:string;sound:string}
export function canKeepTake(a:TakeStamp,b:TakeStamp){return (Object.keys(a) as (keyof TakeStamp)[]).every(k=>a[k]===b[k]);}
