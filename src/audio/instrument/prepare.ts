import { fft,nextPower } from './fft';
import type { InstrumentProfile,PreparedNote } from './types';
export const noteHz=(midi:number)=>440*2**((midi-69)/12);
/** Expensive sinc interpolation and noise notching happen off the audio thread. */
export function prepareNote(p:InstrumentProfile,midi:number):PreparedNote {
 const hz=noteHz(midi),rate=hz/p.hz,cutoff=Math.min(1,1/rate),attack=new Float32Array(Math.round(.09*p.sampleRate));
 for(let i=0;i<attack.length;i++){const pos=i*rate,base=Math.floor(pos);let sum=0,weight=0;for(let o=-24;o<=24;o++){const index=base+o,d=pos-index;if(Math.abs(d)>=24)continue;const z=cutoff*d,w=cutoff*(z===0?1:Math.sin(Math.PI*z)/(Math.PI*z))*(.5+.5*Math.cos(Math.PI*d/24));weight+=w;if(index>=0&&index<p.pcm.length)sum+=p.pcm[index]!*w;}attack[i]=sum/Math.max(weight,1e-9);}
 const n=nextPower(p.residual.length),re=new Float64Array(n),im=new Float64Array(n);re.set(p.residual);fft(re,im);
 for(const partial of p.partials){const center=hz*partial.ratio;if(center>=p.sampleRate*.47)continue;const width=Math.max(15,.025*center),lo=Math.max(1,Math.floor((center-width*1.5)*n/p.sampleRate)),hi=Math.min(n/2,Math.ceil((center+width*1.5)*n/p.sampleRate));for(let k=lo;k<=hi;k++){const dist=Math.abs(k*p.sampleRate/n-center),r=Math.max(0,Math.min(1,(dist-width)/(width*.5))),keep=.5-.5*Math.cos(Math.PI*r);re[k]!*=keep;im[k]!*=keep;re[n-k]!*=keep;im[n-k]!*=keep;}}
 fft(re,im,true);return {attack,residual:Float32Array.from(re.subarray(0,p.residual.length))};
}
