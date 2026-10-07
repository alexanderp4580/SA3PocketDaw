import { buildPrompt } from './prompt';
import type { ModelId } from './protocol';

export const INSTRUMENTS = [
 {id:'synth',label:'Synth',source:'Analog synthesizer'},
 {id:'pad',label:'Pad',source:'Synthesizer pad'},
 {id:'piano',label:'Piano',source:'Acoustic piano'},
 {id:'guitar',label:'Guitar',source:'Acoustic guitar'},
 {id:'bass',label:'Bass',source:'Synthesizer bass'},
 {id:'bell',label:'Bell',source:'Resonant bell'},
] as const;
export const CHARACTERS = [
 {id:'warm',label:'Warm',description:'warm rounded tone with rich harmonics'},
 {id:'bright',label:'Bright',description:'bright clear tone with sparkling harmonics'},
 {id:'soft',label:'Soft',description:'soft mellow tone with smooth harmonics'},
 {id:'metallic',label:'Metallic',description:'metallic resonant tone with clear overtones'},
] as const;
export const ATTACKS = [
 {id:'crisp',label:'Crisp',description:'crisp defined attack'},
 {id:'gentle',label:'Gentle',description:'gentle attack'},
] as const;
export const BEHAVIORS = [
 {id:'sustain',label:'Hold tone'},
 {id:'decay',label:'Natural decay'},
] as const;
export type InstrumentId=typeof INSTRUMENTS[number]['id'];
export interface InstrumentSelections {
 instrument:InstrumentId;
 character:typeof CHARACTERS[number]['id'];
 attack:typeof ATTACKS[number]['id'];
 behavior:'sustain'|'decay';
}
export function instrumentDefaults(instrument:InstrumentId):InstrumentSelections {
 return {instrument,character:'warm',attack:instrument==='pad'?'gentle':'crisp',behavior:instrument==='piano'||instrument==='guitar'||instrument==='bell'?'decay':'sustain'};
}
/** Behavior is supplied once, from the same selection used for resynthesis. */
export function instrumentDescription(s:InstrumentSelections):string {
 const source=INSTRUMENTS.find(x=>x.id===s.instrument)!.source;
 const character=CHARACTERS.find(x=>x.id===s.character)!.description;
 const attack=ATTACKS.find(x=>x.id===s.attack)!.description;
 const action=s.instrument==='piano'?'one piano key struck once':s.instrument==='guitar'?'one string plucked once':s.instrument==='bell'?'struck once':'one single note triggered once';
 const behavior=s.behavior==='sustain'?'one single note with a long even sustain and steady pitch':'one single note with a resonant natural decay, fading smoothly';
 return `${source}, ${action}, ${character}, ${attack}, ${behavior}, dry close recording`;
}
export function instrumentPrompt(s:InstrumentSelections,model:ModelId):string {
 return buildPrompt(instrumentDescription(s),model,'instrument');
}
