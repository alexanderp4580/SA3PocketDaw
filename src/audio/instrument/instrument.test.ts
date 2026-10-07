import { expect, it } from 'vitest';
import { analyse } from './analysis';
import { prepareNote } from './prepare';
import { InstrumentVoice } from './voice';

const sr=44100;
const source=Float32Array.from({length:sr},(_,i)=>.3*(Math.cos(2*Math.PI*219*i/sr)+.4*Math.cos(4*Math.PI*219*i/sr))*Math.min(1,i/300));
it('detects an untuned note automatically and renders A3 at 220 Hz',()=>{
 const p=analyse(source,sr,'sustain');
 expect(p.hz).toBeCloseTo(219,0);
 const v=new InstrumentVoice(p,prepareNote(p,57),57,sr,1,1);
 const x=new Float32Array(sr);v.render(x,0,x.length);
 // Complex phase differences measure frequency independently of the detector.
 const phase=(start:number)=>{let re=0,im=0;for(let i=0;i<4096;i++){const t=(start+i)/sr;const w=.5-.5*Math.cos(2*Math.PI*i/4095);re+=x[start+i]!*Math.cos(2*Math.PI*220*t)*w;im-=x[start+i]!*Math.sin(2*Math.PI*220*t)*w;}return Math.atan2(im,re);};
 const delta=phase(25000)-phase(12000);
 expect(Math.abs(delta*sr/(2*Math.PI*13000))).toBeLessThan(.05);
 expect(x.every(Number.isFinite)).toBe(true);
});
it('rejects silence and noise instead of assigning an arbitrary note',()=>{
 expect(()=>analyse(new Float32Array(sr),sr,'decay')).toThrow();
 let s=9;const noise=Float32Array.from({length:sr},()=>((s=s*16807%2147483647)/2147483647-.5));
 expect(()=>analyse(noise,sr,'decay')).toThrow(/single note/);
});
it('finds the fundamental even when the second harmonic is louder',()=>{
 const pcm=Float32Array.from({length:sr},(_,i)=>.1*Math.cos(2*Math.PI*219*i/sr)+.4*Math.cos(4*Math.PI*219*i/sr)+.2*Math.cos(6*Math.PI*219*i/sr));
 expect(analyse(pcm,sr,'sustain').hz).toBeCloseTo(219,0);
});
it('rejects a chord with unrelated notes',()=>{
 const chord=Float32Array.from({length:sr},(_,i)=>.3*(Math.cos(2*Math.PI*220*i/sr)+Math.cos(2*Math.PI*277.18*i/sr)+Math.cos(2*Math.PI*329.63*i/sr)));
 expect(()=>analyse(chord,sr,'sustain')).toThrow(/single note/);
});
it('decay and sustain are distinct and release reaches silence',()=>{
 const pcm=source.map((v,i)=>v*Math.exp(-4*i/sr));
 const p=analyse(pcm,sr,'decay');const sustained={...p,dynamics:'sustain' as const};
 function energy(profile:typeof p){const voice=new InstrumentVoice(profile,prepareNote(profile,57),57,sr,3,1);const x=new Float32Array(sr*4);voice.render(x,0,x.length);return {x,rms:Math.sqrt(x.slice(sr*2,sr*3).reduce((a,v)=>a+v*v,0)/sr)};}
 const d=energy(p),s=energy(sustained);expect(s.rms).toBeGreaterThan(d.rms*2);expect(d.x[sr*4-1]).toBe(0);
});
