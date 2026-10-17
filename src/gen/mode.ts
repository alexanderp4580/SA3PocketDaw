import {MAX_STEPS} from './protocol';
import {MIN_STEPS} from './steps';
export type GenerationMode = 'sample' | 'instrument' | 'loop';
export const modeLabel=(mode:GenerationMode|undefined)=>mode==='loop'?'Looped':mode==='instrument'?'Instrument':'Sample';
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
const loop: Preset[] = [
 {id:'synth',label:'Synth',prompt:'Warm analog synthesizer, one steady sustained note, rich harmonic tone, constant volume, dry',seconds:4},
 {id:'pad',label:'Pad',prompt:'Soft synthesizer pad, one held note, steady pitch and constant volume, slowly evolving tone, dry',seconds:4},
 {id:'organ',label:'Organ',prompt:'Warm electric organ, one held note, steady pitch and constant volume, dry',seconds:4},
 {id:'strings',label:'Strings',prompt:'Bowed string ensemble, one long held note, smooth steady tone, dry',seconds:4},
 {id:'flute',label:'Flute',prompt:'Breathy flute, one long held note, steady pitch, dry',seconds:4},
];
export const generationPresets=(mode:GenerationMode)=>mode==='sample'?sample:mode==='loop'?loop:instrument;
export const generationHint=(mode:GenerationMode)=>mode==='sample'
 ? 'Describe one hit or sound: its source, attack, decay and texture.'
 : mode==='loop'
 ? 'Describe one long held note with a steady pitch and volume. The app loops its sustained part, so avoid chords, pitch glides and a fading tone.'
 : 'Describe one note and how it is played. A steady, dry tone is easiest to turn into an instrument. Avoid chords and strong pitch glides.';
export const lengthHint=(mode:GenerationMode)=>mode==='sample'
 ? 'Allow time for the decay. Preset lengths are suggested starting points.'
 : mode==='loop'
 ? 'The loop is taken from the sustained part after the first 0.15 s, so a longer source gives it more to choose from. 4 s is the starting point.'
 : '4 s worked in our listening test. This is the source length; played notes can be longer. Try 4–6 s for a longer natural decay.';
interface StorageLike {getItem(k:string):string|null;setItem(k:string,v:string):void}
export function loadModeSettings(storage:StorageLike|null,mode:GenerationMode):ModeSettings {
 const defaults=mode==='sample'?{seconds:2,steps:8}:{seconds:4,steps:16};
 try {const s=JSON.parse(storage?.getItem('sa3daw.gen.'+mode)??'null');
  return s&&typeof s.seconds==='number'&&Number.isFinite(s.seconds)&&s.seconds>=.5&&s.seconds<=10&&Number.isInteger(s.steps)&&s.steps>=MIN_STEPS&&s.steps<=MAX_STEPS?s:defaults;
 }catch{return defaults;}
}
export function saveModeSettings(storage:StorageLike|null,mode:GenerationMode,s:ModeSettings){try{storage?.setItem('sa3daw.gen.'+mode,JSON.stringify(s));}catch{/* unavailable */}}
