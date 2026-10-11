import {describe,expect,it} from 'vitest';
import {MIN_KEPT_SEC,FADE_SEC,resolveTrim,moveStart,moveEnd,fullTrim,isFullTrim,trimFrames,applyTrim,normalizeStoredTrim,storedTrim} from './trim';

describe('resolveTrim',()=>{
 it('missing or invalid means the full clip',()=>{
  expect(resolveTrim(undefined,2)).toEqual({start:0,end:2});
  expect(resolveTrim({start:NaN,end:Infinity},2)).toEqual({start:0,end:2});
 });
 it('clamps into the clip and keeps the minimum length',()=>{
  expect(resolveTrim({start:-1,end:9},2)).toEqual({start:0,end:2});
  const t=resolveTrim({start:1.99,end:2},2);
  expect(t.end-t.start).toBeGreaterThanOrEqual(MIN_KEPT_SEC-1e-9);
  expect(t.end).toBeLessThanOrEqual(2);
  const crossed=resolveTrim({start:1.5,end:0.5},2);
  expect(crossed.end-crossed.start).toBeGreaterThanOrEqual(MIN_KEPT_SEC-1e-9);
 });
 it('a clip shorter than the minimum stays whole',()=>{
  expect(resolveTrim({start:0.01,end:0.02},0.03)).toEqual({start:0,end:0.03});
 });
});
describe('moving handles',()=>{
 it('start cannot pass end minus the minimum',()=>{
  expect(moveStart({start:0,end:1},5,2).start).toBeCloseTo(1-MIN_KEPT_SEC,9);
  expect(moveStart({start:0,end:1},-5,2).start).toBe(0);
 });
 it('end cannot pass start plus the minimum or the clip end',()=>{
  expect(moveEnd({start:1,end:2},0,2).end).toBeCloseTo(1+MIN_KEPT_SEC,9);
  expect(moveEnd({start:1,end:2},9,2).end).toBe(2);
 });
});
describe('frames and fades',()=>{
 it('converts seconds to frames within the buffer',()=>{
  expect(trimFrames({start:0.5,end:1.5},1000,2000)).toEqual({start:500,end:1500});
  expect(trimFrames({start:0,end:9},1000,2000)).toEqual({start:0,end:2000});
  const f=trimFrames({start:1.999,end:2},1000,2000);expect(f.end).toBe(2000);expect(f.end-f.start).toBeGreaterThanOrEqual(1);
 });
 it('full detection and reset',()=>{
  expect(isFullTrim(fullTrim(2),2)).toBe(true);
  expect(isFullTrim({start:0.1,end:2},2)).toBe(false);
  expect(storedTrim({start:0,end:2},2)).toBeUndefined();
  expect(storedTrim({start:0.5,end:1.5},2)).toEqual({start:0.5,end:1.5});
 });
 it('applyTrim returns the source when full and a faded slice otherwise',()=>{
  const pcm=new Float32Array(2000).fill(1);
  expect(applyTrim(pcm,1000,undefined)).toBe(pcm);
  const out=applyTrim(pcm,1000,{start:0.5,end:1.5});
  expect(out.length).toBe(1000);
  expect(out[0]).toBe(0);expect(out[999]).toBe(0);expect(out[500]).toBe(1);
  const fade=Math.round(FADE_SEC*1000);expect(out[fade]).toBe(1);
  const head=applyTrim(pcm,1000,{start:0,end:1});
  expect(head[0]).toBe(1);expect(head[999]).toBe(0);
 });
});
describe('normalizeStoredTrim',()=>{
 it('drops malformed values and keeps valid ones',()=>{
  expect(normalizeStoredTrim(undefined)).toBeUndefined();
  expect(normalizeStoredTrim({start:'a',end:1})).toBeUndefined();
  expect(normalizeStoredTrim({start:2,end:1})).toBeUndefined();
  expect(normalizeStoredTrim({start:-1,end:1})).toEqual({start:0,end:1});
  expect(normalizeStoredTrim({start:0.2,end:1})).toEqual({start:0.2,end:1});
 });
});
