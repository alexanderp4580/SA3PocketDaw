export interface Partial {ratio:number; amplitudes:Float32Array; phase:number; decay:number}
export interface InstrumentProfile {version:1; hz:number; sampleRate:number; hop:number; pcm:Float32Array; residual:Float32Array; partials:Partial[]; harmonicEnergy:number; dynamics:'sustain'|'decay'; gain:number}
export interface PreparedNote {attack:Float32Array; residual:Float32Array}
