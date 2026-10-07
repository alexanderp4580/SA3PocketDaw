import {it,expect} from 'vitest';
import {resolveSampleControls,samplePreviewDuration} from './sampleControls';
it('preserves established sample playback defaults and clamps invalid saved settings',()=>{
 expect(resolveSampleControls()).toEqual({brightness:1,attack:.004,release:.05});
 expect(resolveSampleControls({brightness:NaN,attack:-1,release:9})).toEqual({brightness:1,attack:.001,release:2});
});
it('keeps a preview audible when release exceeds the recording length',()=>{
 expect(samplePreviewDuration(1,{attack:.5,release:2})).toBeCloseTo(.5);
 expect(samplePreviewDuration(3,{attack:.2,release:.4})).toBeCloseTo(2.6);
 expect(samplePreviewDuration(.1,{attack:1,release:2})).toBeCloseTo(.1);
});
