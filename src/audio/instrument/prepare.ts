import { fft,nextPower } from './fft';
import type { InstrumentProfile,PreparedNote } from './types';
export const noteHz=(midi:number)=>440*2**((midi-69)/12);
const TAPS=24;
/** The residual's forward transform does not depend on pitch; the latest few are kept per realm. */
const spectra:Array<{key:string;re:Float64Array;im:Float64Array}>=[];
function residualSpectrum(residual:Float32Array):{re:Float64Array;im:Float64Array} {
 const bits=new Uint32Array(residual.buffer,residual.byteOffset,residual.length);let h=2166136261;
 for(let i=0;i<bits.length;i++)h=Math.imul(h^bits[i]!,16777619);
 const key=`${residual.length}:${h>>>0}`,hit=spectra.find(s=>s.key===key);
 if(hit)return {re:Float64Array.from(hit.re),im:Float64Array.from(hit.im)};
 const n=nextPower(residual.length),re=new Float64Array(n),im=new Float64Array(n);re.set(residual);fft(re,im);
 spectra.push({key,re:Float64Array.from(re),im:Float64Array.from(im)});if(spectra.length>3)spectra.shift();
 return {re,im};
}
/** Expensive sinc interpolation and noise notching happen off the audio thread. */
export function prepareNote(p:InstrumentProfile,midi:number):PreparedNote {
 const hz=noteHz(midi),rate=hz/p.hz,cutoff=Math.min(1,1/rate),attack=new Float32Array(Math.round(.09*p.sampleRate));
 // sin(pi*cutoff*d) and the window cosine advance by one fixed rotation per tap instead of a trigonometric call.
 const sinStep=Math.sin(-Math.PI*cutoff),cosStep=Math.cos(-Math.PI*cutoff),winStep=Math.sin(-Math.PI/TAPS),winCosStep=Math.cos(-Math.PI/TAPS);
 for(let i=0;i<attack.length;i++){
  const pos=i*rate,base=Math.floor(pos),first=base-TAPS,d0=pos-first;
  let s=Math.sin(Math.PI*cutoff*d0),c=Math.cos(Math.PI*cutoff*d0),ws=Math.sin(Math.PI*d0/TAPS),wc=Math.cos(Math.PI*d0/TAPS),sum=0,weight=0;
  for(let o=-TAPS;o<=TAPS;o++){
   const index=base+o,d=pos-index;
   if(Math.abs(d)<TAPS){const z=cutoff*d,sinc=z===0?1:Math.abs(z)<1e-6?Math.sin(Math.PI*z)/(Math.PI*z):s/(Math.PI*z),w=cutoff*sinc*(.5+.5*wc);weight+=w;if(index>=0&&index<p.pcm.length)sum+=p.pcm[index]!*w;}
   const ns=s*cosStep+c*sinStep;c=c*cosStep-s*sinStep;s=ns;
   const nws=ws*winCosStep+wc*winStep;wc=wc*winCosStep-ws*winStep;ws=nws;
  }
  attack[i]=sum/Math.max(weight,1e-9);
 }
 const {re,im}=residualSpectrum(p.residual),n=re.length;
 for(const partial of p.partials){const center=hz*partial.ratio;if(center>=p.sampleRate*.47)continue;const width=Math.max(15,.025*center),lo=Math.max(1,Math.floor((center-width*1.5)*n/p.sampleRate)),hi=Math.min(n/2,Math.ceil((center+width*1.5)*n/p.sampleRate));for(let k=lo;k<=hi;k++){const dist=Math.abs(k*p.sampleRate/n-center),r=Math.max(0,Math.min(1,(dist-width)/(width*.5))),keep=.5-.5*Math.cos(Math.PI*r);re[k]!*=keep;im[k]!*=keep;re[n-k]!*=keep;im[n-k]!*=keep;}}
 fft(re,im,true);return {attack,residual:Float32Array.from(re.subarray(0,p.residual.length))};
}
