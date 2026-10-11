import {describe,expect,it} from 'vitest';
import {clampParam,defaultFx,delayMs,formatParam,fromSlider,fxKinds,fxSpecs,normalizeFx,toSlider,noteValues} from './spec';
describe('fx spec',()=>{
 it('defaults lie inside every range and survive normalisation',()=>{
  for(const k of fxKinds){const d=defaultFx(k);for(const s of fxSpecs[k]!.params){expect(d[s.id]!).toBeGreaterThanOrEqual(s.min);expect(d[s.id]!).toBeLessThanOrEqual(s.max);}expect(normalizeFx(k,d)).toEqual(d);}
 });
 it('normalises junk to defaults and clamps ranges',()=>{
  const n=normalizeFx('compressor',{threshold:'x',ratio:1e9,attack:-4,release:NaN,knee:Infinity,extra:3});
  expect(n).toEqual({threshold:-18,ratio:20,attack:.1,release:120,knee:6,makeup:0});
  expect(normalizeFx('limiter',null)).toEqual(defaultFx('limiter'));
  expect(normalizeFx('delay',{sync:2.4}).sync).toBe(2);
 });
 it('snaps values to their step',()=>{expect(clampParam(fxSpecs.bitcrusher.params[0]!,5.6)).toBe(6);expect(clampParam(fxSpecs.compressor.params[0]!,-18.04)).toBe(-18);});
 it('log sliders round-trip',()=>{
  const s=fxSpecs.compressor.params[3]!;
  expect(toSlider(s,s.min)).toBeCloseTo(0,9);expect(toSlider(s,s.max)).toBeCloseTo(1,9);
  expect(fromSlider(s,toSlider(s,300))).toBe(300);
  const l=fxSpecs.limiter.params[0]!;expect(fromSlider(l,.5)).toBeCloseTo(-12,1);
 });
 it('formats units and choices',()=>{
  expect(formatParam(fxSpecs.limiter.params[0]!,-3.14)).toBe('-3.1 dB');expect(formatParam(fxSpecs.limiter.params[1]!,0)).toBe('0.0 dB');
  expect(formatParam(fxSpecs.delay.params[0]!,3)).toBe('1/4');expect(formatParam(fxSpecs.delay.params[3]!,8000)).toBe('8.00 kHz');
 });
 it('tempo-synced delay times',()=>{
  expect(delayMs(3,350,120)).toBe(500);expect(delayMs(0,350,120)).toBe(350);
  expect(delayMs(noteValues.findIndex(n=>n.label==='1/8.')+1,0,90)).toBeCloseTo(500,6);
  expect(delayMs(noteValues.findIndex(n=>n.label==='1/4T')+1,0,140)).toBeCloseTo(60000/140*2/3,6);
  expect(delayMs(1,0,30)).toBe(8000);
  expect(delayMs(0,9999,120)).toBe(2000);
 });
});
it('keeps a whole-note delay at six seconds at 40 BPM',()=>{
 expect(delayMs(1,350,40)).toBe(6000);
});
