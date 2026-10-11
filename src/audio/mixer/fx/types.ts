/** Allocation-free stereo effect DSP shared by the AudioWorklet and offline tests. */
export interface FxDsp {
 /** Samples by which the wet path trails the input (0 when the effect adds none). */
 readonly latency:number;
 /** Current gain reduction in dB (>= 0), 0 for effects without a reduction meter. */
 reduction:number;
 /**
  * Receives every parameter of the effect's spec in spec units (dB, ms, Hz, percent as 0..100, choice index).
  * The first call applies at once; later calls move gains, times and frequencies smoothly during the next process calls.
  * `bpm` is the project tempo.
  */
 setParams(params:Readonly<Record<string,number>>,bpm:number):void;
 /** Processes `n` frames. Input and output arrays never alias and each contains at least `n` frames. */
 process(l:Float32Array,r:Float32Array,ol:Float32Array,or:Float32Array,n:number):void;
 /** Empties delay lines and filter state. */
 clear():void;
}
export type FxFactory=(sampleRate:number)=>FxDsp;
