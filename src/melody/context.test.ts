import {it,expect} from 'vitest';
import {createProject,addTrack,setTrackPreset} from '../store/projectModel';
import {contextPlan,stripContextNotes,defaultContextTracks,contextStamp} from './context';
function project(){let p=createProject({id:'p',bpm:120,bars:4});p=addTrack(p,'Lead','lead');p=addTrack(p,'Chords','chords');p=setTrackPreset(p,'chords','mini-piano');p.tracks[1]!.bars=1;p.tracks[1]!.notes=[{id:'c',midi:60,start:0,length:8}];return p;}
it('renders phase-correct looped piano context around a two-bar silent gap',()=>{const p=project();const c=contextPlan(p,'lead',2,2,['chords']);expect(c.maskStart).toBe(4);expect(c.maskEnd).toBe(8);expect(c.seconds).toBe(12);expect(c.events.map(x=>x.when)).toEqual([0,2,8,10]);expect(c.background.map(x=>x.onset)).toEqual([0,2]);});
it('renders the target seed only outside the gap, and excludes muted background',()=>{const p=project();p.tracks[0]!.notes=[{id:'s',midi:67,start:16,length:4}];p.tracks[1]!.muted=true;const c=contextPlan(p,'lead',2,2,['chords']);expect(c.events.every(x=>x.trackId==='lead')).toBe(true);expect(c.background).toEqual([]);expect(c.events.some(x=>x.when>=c.maskStart&&x.when<c.maskEnd)).toBe(false);});
it('includes held notes at context and generation boundaries',()=>{const p=project();p.tracks[1]!.bars=4;p.tracks[1]!.notes=[{id:'held',midi:48,start:8,length:48}];const c=contextPlan(p,'lead',2,2,['chords']);expect(c.background[0]).toMatchObject({onset:0,pitch:48});expect(c.events.some(x=>x.when===0)).toBe(true);});
it('requires context and enforces two bars and valid track range',()=>{const p=project();expect(()=>contextPlan(p,'lead',1,2,[])).toThrow(/context/i);expect(()=>contextPlan(p,'lead',1,3,['chords'])).toThrow(/two|2/);expect(()=>contextPlan(p,'lead',4,2,['chords'])).toThrow(/range/i);});
it('defaults to unmuted pitched presets and instruments, and stamps changes to their notes',()=>{const p=project();expect(defaultContextTracks(p,'lead')).toEqual(['chords']);const a=contextStamp(p,['chords']);p.tracks[1]!.notes[0]!.midi=62;expect(contextStamp(p,['chords'])).not.toBe(a);});
it('removes nearby same-pitch context detections but preserves different pitches and distant notes',()=>{const n=(onset:number,pitch:number)=>({onset,offset:onset+.3,pitch,velocity:90});const out=stripContextNotes([n(.1,60),n(.1,64),n(.5,60)],[n(0,60)]);expect(out.notes).toEqual([n(.1,64),n(.5,60)]);expect(out.removed).toBe(1);});

it('repeats the first part after the gap instead of continuing with later song bars',()=>{
 const p=project();p.tracks[1]!.bars=4;p.tracks[1]!.notes=[60,62,64,65].map((midi,i)=>({id:String(i),midi,start:i*16,length:4}));
 const c=contextPlan(p,'lead',3,2,['chords']);
 expect(c.events.filter(n=>n.when<c.maskStart).map(n=>n.midi)).toEqual([60,62]);
 expect(c.events.filter(n=>n.when>=c.maskEnd).map(n=>n.midi)).toEqual([60,62]);
 expect(c.background.map(n=>n.pitch)).toEqual([64,65]);
});
