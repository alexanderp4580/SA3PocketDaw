import {it,expect} from 'vitest';
import {encodePcmWav,maskAndNormalize} from './renderContext';
import {decodeWav} from '../gen/wav';
it('writes a stereo PCM16 WAV readable by the existing decoder',()=>{const data=encodePcmWav([new Float32Array([0,.5,-1]),new Float32Array([1,-.5,0])],44100);const d=decodeWav(data);expect(d.sampleRate).toBe(44100);expect(d.channels).toHaveLength(2);expect(d.channels[0]![1]).toBeCloseTo(.5,4);expect(d.channels[1]![0]).toBeCloseTo(1,4);});
it('clears the gap including release tails and normalizes finite context outside it',()=>{const x=new Float32Array(12).fill(.2);x[0]=.4;const out=maskAndNormalize([x],2,{maskStart:2,maskEnd:4});expect([...out[0]!.slice(4,8)]).toEqual([0,0,0,0]);expect(out[0]![0]).toBeCloseTo(.85);expect(x[4]).toBeCloseTo(.2);});
it('refuses nonfinite audio and mismatched channel lengths',()=>{expect(()=>encodePcmWav([new Float32Array([NaN])],44100)).toThrow();expect(()=>encodePcmWav([new Float32Array(1),new Float32Array(2)],44100)).toThrow();});

it('copies the first part sample-for-sample after the mask to guide a seamless loop',()=>{
 const out=maskAndNormalize([new Float32Array([.1,.2,.3,.4,.9,.9,.9,.9,.8,.7,.6,.5])],2,{maskStart:2,maskEnd:4})[0]!;
 expect([...out.slice(8,12)]).toEqual([...out.slice(0,4)]);
});
