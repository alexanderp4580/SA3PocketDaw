export interface InstrumentControls {brightness:number;attack:number;release:number;behavior:'sustain'|'decay'}
const bounded=(n:number|undefined,fallback:number,min:number,max:number)=>typeof n==='number'&&Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;
export function resolveControls(value:Partial<InstrumentControls>|undefined,source:'sustain'|'decay'):InstrumentControls {
 return {brightness:bounded(value?.brightness,1,0,1),attack:bounded(value?.attack,.003,.003,2),release:bounded(value?.release,.15,.02,2),behavior:value?.behavior==='sustain'||value?.behavior==='decay'?value.behavior:source};
}
export function brightnessHz(brightness:number,sampleRate:number):number {
 return Math.min(sampleRate*.45,240*75**Math.max(0,Math.min(1,brightness)));
}
