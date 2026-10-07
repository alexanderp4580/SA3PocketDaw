export type GenerationMode = 'sample' | 'instrument';
export interface ModeSettings { seconds: number; steps: number }
export interface Preset { id: string; label: string; prompt: string; seconds: number }
const sample: Preset[] = [
 {id:'kick',label:'Kick',prompt:'Deep electronic kick drum, one hit, sharp initial click, short punchy low-end decay, dry',seconds:1},
 {id:'snare',label:'Snare',prompt:'Snare drum struck once, crisp attack, short noisy decay, dry close recording',seconds:1},
 {id:'hat',label:'Closed hat',prompt:'Tightly closed hi-hat struck once, crisp metallic attack, very fast decay, dry',seconds:.5},
 {id:'laser',label:'Laser',prompt:'One electronic laser zap, bright descending pitch, short decay, dry',seconds:2},
];
const instrument: Preset[] = [
 {id:'synth',label:'Synth',prompt:'Warm analog synthesizer, one steady sustained note, rich harmonic tone, dry',seconds:4},
 {id:'pad',label:'Pad',prompt:'Soft synthesizer pad, one held note, gentle attack, steady pitch and slowly evolving tone, dry',seconds:4},
 {id:'piano',label:'Piano',prompt:'Acoustic piano, one single note struck once, clear hammer attack, resonant natural decay, dry',seconds:4},
 {id:'guitar',label:'Guitar',prompt:'Acoustic guitar, one single plucked string note, clear pick attack, warm wooden resonance, natural decay, dry',seconds:4},
 {id:'bass',label:'Bass',prompt:'Warm synthesizer bass, one steady sustained note, rounded low end and clear harmonics, dry',seconds:4},
];
export const generationPresets=(mode:GenerationMode)=>mode==='sample'?sample:instrument;
export const generationHint=(mode:GenerationMode)=>mode==='sample'
 ? 'Describe one hit or sound: its source, attack, decay and texture.'
 : 'Describe one note and how it is played. A steady, dry tone is easiest to turn into an instrument. Avoid chords and strong pitch glides.';
export const lengthHint=(mode:GenerationMode)=>mode==='sample'
 ? 'Allow time for the decay. Preset lengths are suggested starting points.'
 : '4 s worked in our listening test. This is the source length; played notes can be longer. Try 4–6 s for a longer natural decay.';
interface StorageLike {getItem(k:string):string|null;setItem(k:string,v:string):void}
export function loadModeSettings(storage:StorageLike|null,mode:GenerationMode):ModeSettings {
 const defaults=mode==='sample'?{seconds:2,steps:8}:{seconds:4,steps:16};
 try {const s=JSON.parse(storage?.getItem('sa3daw.gen.'+mode)??'null');
  return s&&typeof s.seconds==='number'&&Number.isFinite(s.seconds)&&s.seconds>=.5&&s.seconds<=10&&Number.isInteger(s.steps)&&s.steps>=4&&s.steps<=16?s:defaults;
 }catch{return defaults;}
}
export function saveModeSettings(storage:StorageLike|null,mode:GenerationMode,s:ModeSettings){try{storage?.setItem('sa3daw.gen.'+mode,JSON.stringify(s));}catch{/* unavailable */}}
