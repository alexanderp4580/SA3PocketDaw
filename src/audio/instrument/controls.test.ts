import { expect,it } from 'vitest';
import { resolveControls,brightnessHz } from './controls';
import { InstrumentVoice } from './voice';
import type { InstrumentProfile } from './types';
it('keeps old instruments at their established defaults and clamps corrupted controls',()=>{
 expect(resolveControls(undefined,'decay')).toEqual({brightness:1,attack:.003,release:.15,behavior:'decay'});
 expect(resolveControls({brightness:NaN,attack:-5,release:99},'sustain')).toEqual({brightness:1,attack:.003,release:2,behavior:'sustain'});
 expect(brightnessHz(0,44100)).toBeLessThan(brightnessHz(1,44100));expect(brightnessHz(1,22050)).toBeLessThan(22050/2);
});
it('attack and release alter playback without changing the source profile',()=>{
 const p:InstrumentProfile={version:1,hz:220,sampleRate:44100,hop:512,pcm:new Float32Array(44100).fill(.5),residual:new Float32Array(44100),partials:[{ratio:1,amplitudes:new Float32Array(90).fill(.5),phase:0,decay:-1}],harmonicEnergy:1,dynamics:'sustain',gain:1};
 const assets={attack:p.pcm,residual:p.residual};
 const render=(attack:number,release:number)=>{const x=new Float32Array(44100);new InstrumentVoice(p,assets,57,44100,.2,1,{attack,release,brightness:1,behavior:'sustain'}).render(x,0,x.length);return x;};
 const fast=render(.003,.02),slow=render(.3,.5);expect(Math.abs(slow[220]!)).toBeLessThan(Math.abs(fast[220]!));expect(slow.slice(15000,17000).some(v=>Math.abs(v)>.01)).toBe(true);expect(fast.slice(15000).every(v=>v===0)).toBe(true);expect(p.dynamics).toBe('sustain');
});
