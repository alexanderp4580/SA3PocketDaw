import { expect,it } from 'vitest';
import { partialsFor } from './voiceBudget';
it('leaves a few voices at full quality',()=>{
 expect(partialsFor(0)).toBe(Infinity);expect(partialsFor(3)).toBe(Infinity);
});
it('shares the oscillator budget between the voices that already sound',()=>{
 expect(partialsFor(4)).toBe(51);expect(partialsFor(7)).toBe(32);expect(partialsFor(15)).toBe(16);
});
it('never drops below a floor so notes are thinned rather than removed',()=>{
 expect(partialsFor(30)).toBe(12);expect(partialsFor(500)).toBe(12);
});
