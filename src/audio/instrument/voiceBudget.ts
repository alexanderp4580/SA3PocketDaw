/** Oscillators the audio thread renders per quantum across all instrument voices before new voices are thinned. */
export const OSCILLATOR_BUDGET=256;
const FULL_PARTIALS=64,MIN_PARTIALS=12;
/** Partials a new voice may use given the voices already sounding: full quality while the budget lasts, then an equal share. */
export function partialsFor(activeVoices:number):number {
 const share=Math.floor(OSCILLATOR_BUDGET/(Math.max(0,activeVoices)+1));
 return share>=FULL_PARTIALS?Infinity:Math.max(MIN_PARTIALS,share);
}
