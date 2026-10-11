import { expect,it } from 'vitest';
import { fft,nextPower } from './fft';
import { noteHz,prepareNote } from './prepare';
import type { InstrumentProfile,PreparedNote } from './types';
const SR=44100;
/** Direct evaluation of the sinc attack and notched residual, used as the reference. */
function reference(p:InstrumentProfile,midi:number):PreparedNote {
 const hz=noteHz(midi),rate=hz/p.hz,cutoff=Math.min(1,1/rate),attack=new Float32Array(Math.round(.09*p.sampleRate));
 for(let i=0;i<attack.length;i++){const pos=i*rate,base=Math.floor(pos);let sum=0,weight=0;for(let o=-24;o<=24;o++){const index=base+o,d=pos-index;if(Math.abs(d)>=24)continue;const z=cutoff*d,w=cutoff*(z===0?1:Math.sin(Math.PI*z)/(Math.PI*z))*(.5+.5*Math.cos(Math.PI*d/24));weight+=w;if(index>=0&&index<p.pcm.length)sum+=p.pcm[index]!*w;}attack[i]=sum/Math.max(weight,1e-9);}
 const n=nextPower(p.residual.length),re=new Float64Array(n),im=new Float64Array(n);re.set(p.residual);fft(re,im);
 for(const partial of p.partials){const center=hz*partial.ratio;if(center>=p.sampleRate*.47)continue;const width=Math.max(15,.025*center),lo=Math.max(1,Math.floor((center-width*1.5)*n/p.sampleRate)),hi=Math.min(n/2,Math.ceil((center+width*1.5)*n/p.sampleRate));for(let k=lo;k<=hi;k++){const dist=Math.abs(k*p.sampleRate/n-center),r=Math.max(0,Math.min(1,(dist-width)/(width*.5))),keep=.5-.5*Math.cos(Math.PI*r);re[k]!*=keep;im[k]!*=keep;re[n-k]!*=keep;im[n-k]!*=keep;}}
 fft(re,im,true);return {attack,residual:Float32Array.from(re.subarray(0,p.residual.length))};
}
function profile(seed:number):InstrumentProfile {
 const n=SR/2,pcm=Float32Array.from({length:n},(_,i)=>Math.sin(i*.031*seed)*Math.exp(-i/9000)+.1*Math.sin(i*.9));
 return {version:1,hz:220,sampleRate:SR,hop:512,pcm,residual:Float32Array.from({length:n},(_,i)=>.2*Math.sin(i*.37*seed)+.05*Math.cos(i*1.3)),harmonicEnergy:1,dynamics:'sustain',gain:1,
  partials:Array.from({length:12},(_,i)=>({ratio:i+1,amplitudes:new Float32Array(4),phase:0,decay:-1}))};
}
const maxDiff=(a:Float32Array,b:Float32Array)=>{let m=0;for(let i=0;i<a.length;i++)m=Math.max(m,Math.abs(a[i]!-b[i]!));return m;};
it('matches the direct evaluation across transpositions',()=>{
 const p=profile(1);
 for(const midi of [45,57,60,69,81]){const got=prepareNote(p,midi),want=reference(p,midi);expect(got.attack.length).toBe(want.attack.length);expect(maxDiff(got.attack,want.attack)).toBeLessThan(1e-5);expect(maxDiff(got.residual,want.residual)).toBeLessThan(1e-5);}
});
it('does not reuse a spectrum between different residuals',()=>{
 const a=profile(1),b=profile(2);
 prepareNote(a,60);
 expect(maxDiff(prepareNote(b,60).residual,reference(b,60).residual)).toBeLessThan(1e-5);
 expect(maxDiff(prepareNote(a,64).residual,reference(a,64).residual)).toBeLessThan(1e-5);
});
