import {describe,it,expect} from 'vitest';
import {barSeconds,melodyPrompt,notesForBars,replaceBars,canKeepTake} from './take';
const raw=(onset:number,offset:number,pitch=60,velocity=90)=>({onset,offset,pitch,velocity});
describe('generated bars',()=>{
 it('uses four beats per bar and includes tempo/key/piano in the prompt',()=>{expect(barSeconds(2,120)).toBe(4);expect(melodyPrompt('gentle',120,'D','minor',2)).toMatch(/Piano.*120 BPM.*D minor.*2 bars.*gentle/);});
 it('snaps to sixteenths, offsets into selected bars and clips the end',()=>{const n=notesForBars([raw(.13,8)],120,2,1,()=> 'n');expect(n).toEqual([{id:'n',midi:60,start:17,length:15,velocity:90}]);});
 it('drops invalid/out-of-range/late notes and deduplicates same snapped pitch/start',()=>{const n=notesForBars([raw(0,.3),raw(.01,.6),raw(0,1,12),raw(NaN,1),raw(2,3),raw(0,1,128)],120,1,1);expect(n).toHaveLength(1);expect(n[0]!.length).toBe(5);});
 it('trims overlapping notes of the same pitch',()=>{const n=notesForBars([raw(0,1),raw(.5,1.5)],120,1,1);expect(n.map(x=>[x.start,x.length])).toEqual([[0,4],[4,8]]);});
 it('preserves notes outside the range and splits notes that cross both edges',()=>{const n={id:'old',midi:60,start:0,length:48,velocity:80};const out=replaceBars([n],[],2,1,()=> 'right');expect(out).toEqual([{...n,length:16},{...n,id:'right',start:32,length:16}]);expect(n.length).toBe(48);});
 it('rejects a stale track or changed tempo',()=>{const a={projectId:'p',trackId:'t',bpm:120,bars:2,notes:'[]',sound:'s'};expect(canKeepTake(a,{...a})).toBe(true);expect(canKeepTake(a,{...a,bpm:130})).toBe(false);expect(canKeepTake(a,{...a,notes:'changed'})).toBe(false);});
});
