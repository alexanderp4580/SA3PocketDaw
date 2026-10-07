import type {Mp3Encoder} from '@breezystack/lamejs';
export function pcm16(pcm:Float32Array):Int16Array {return Int16Array.from(pcm,x=>Number.isFinite(x)?Math.round(Math.max(-1,Math.min(1,x))*(x<0?32768:32767)):0);}
export function encodeMp3(left:Float32Array,right:Float32Array,sampleRate:number,Encoder:typeof Mp3Encoder):Uint8Array {
 const encoder=new Encoder(2,sampleRate,192),parts:Uint8Array[]=[];
 for(let i=0;i<left.length;i+=1152){const part=encoder.encodeBuffer(pcm16(left.subarray(i,i+1152)),pcm16(right.subarray(i,i+1152)));if(part.length)parts.push(new Uint8Array(part));}
 parts.push(new Uint8Array(encoder.flush()));const bytes=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}return bytes;
}
