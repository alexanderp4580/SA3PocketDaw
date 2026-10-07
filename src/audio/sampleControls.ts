export interface SampleControls {brightness:number;attack:number;release:number}
export const SAMPLE_ATTACK_SEC=.004;
export const SAMPLE_RELEASE_SEC=.05;
const bounded=(n:number|undefined,fallback:number,min:number,max:number)=>typeof n==='number'&&Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;
/** Full brightness bypasses filtering; envelope defaults preserve established sample playback. */
export function resolveSampleControls(value?:Partial<SampleControls>):SampleControls {
 return {brightness:bounded(value?.brightness,1,0,1),attack:bounded(value?.attack,SAMPLE_ATTACK_SEC,.001,2),release:bounded(value?.release,SAMPLE_RELEASE_SEC,.005,2)};
}
/** Leave time for the attack even when the requested release is longer than the recording. */
export function samplePreviewDuration(seconds:number,value?:Partial<SampleControls>):number {
 const controls=resolveSampleControls(value);
 return Math.max(Math.min(seconds,Math.max(SAMPLE_ATTACK_SEC,controls.attack)),seconds-controls.release);
}
