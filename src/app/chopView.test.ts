import {describe,expect,it} from 'vitest';
import {MAX_SEC_PER_PX,clampWindow,columnPeaks,dragHandle,fixedPeaksWindow,memoColumnPeaks,minSpan,panBy,pinchScale,pinchWindow,pxToSec,sameTrim,secToPx,zoomAbout} from './chopView';
import {MIN_KEPT_SEC} from '../audio/trim';

const D=4,W=400;
describe('chopView window',()=>{
 it('zoom keeps the pinch centre time fixed',()=>{
  const win={start:1,end:3},c=1.5,frac=(c-win.start)/(win.end-win.start);
  const z=zoomAbout(win,2,c,D,W);
  expect(z.end-z.start).toBeCloseTo(1,9);
  expect(z.start+frac*(z.end-z.start)).toBeCloseTo(c,9);
  expect(secToPx(c,z,W)).toBeCloseTo(secToPx(c,win,W),6);
 });
 it('zoom clamps between the full clip and 1 ms per pixel',()=>{
  const out=zoomAbout({start:0,end:D},1e9,2,D,W);
  expect(out.end-out.start).toBeCloseTo(W*MAX_SEC_PER_PX,9);
  expect(minSpan(D,W)).toBeCloseTo(.4,9);
  const back=zoomAbout({start:1,end:2},1e-9,1.5,D,W);
  expect(back).toEqual({start:0,end:D});
 });
 it('a clip shorter than 1 ms per pixel never zooms in',()=>{
  expect(zoomAbout({start:0,end:.2},4,.1,.2,W)).toEqual({start:0,end:.2});
 });
 it('pan clamps inside the clip and keeps the span',()=>{
  expect(panBy({start:1,end:2},-5,D)).toEqual({start:0,end:1});
  expect(panBy({start:1,end:2},9,D)).toEqual({start:3,end:4});
  const p=panBy({start:1,end:2},.25,D);expect(p.start).toBeCloseTo(1.25,9);expect(p.end).toBeCloseTo(2.25,9);
 });
 it('clampWindow repairs invalid windows',()=>{
  expect(clampWindow({start:-1,end:9},D,W)).toEqual({start:0,end:D});
  expect(clampWindow({start:NaN,end:NaN},D,W)).toEqual({start:0,end:D});
  expect(clampWindow({start:3.9,end:5},D,W).end).toBe(D);
 });
 it('pixel and seconds round-trip',()=>{
  const win={start:.5,end:2.5};
  for(const x of [0,1,137.5,400])expect(secToPx(pxToSec(x,win,W),win,W)).toBeCloseTo(x,9);
  expect(pxToSec(0,win,W)).toBe(.5);expect(pxToSec(W,win,W)).toBe(2.5);
 });
 it('pinch window zooms about the start centre and follows the fingers',()=>{
  const win={start:0,end:4},c=2;
  const same=pinchWindow(win,2,c,.5,D,W);
  expect(same.start).toBeCloseTo(1,9);expect(same.end).toBeCloseTo(3,9);
  const moved=pinchWindow(win,2,c,.25,D,W);
  expect(moved.start).toBeCloseTo(1.5,9);
  expect(pxToSec(.25*W,moved,W)).toBeCloseTo(c,9);
 });
});
describe('chopView peaks',()=>{
 const sr=1000,pcm=new Float32Array(1000);
 pcm[100]=.5;pcm[600]=-.8;pcm[900]=.25;
 it('full window columns hold the expected min and max',()=>{
  const {min,max}=columnPeaks(pcm,sr,{start:0,end:1},10);
  expect(min.length).toBe(10);
  expect(max[1]).toBeCloseTo(.5);expect(min[6]).toBeCloseTo(-.8);expect(max[9]).toBeCloseTo(.25);
  expect(max[0]).toBe(0);expect(min[1]).toBe(0);
 });
 it('zoomed window shows finer detail',()=>{
  const {min,max}=columnPeaks(pcm,sr,{start:.59,end:.61},20);
  expect(Math.min(...min)).toBeCloseTo(-.8);
  expect(Math.max(...max)).toBe(0);
  expect(min[10]).toBeCloseTo(-.8);expect(min[9]).toBe(0);expect(min[11]).toBe(0);
 });
 it('window outside the pcm gives zeros',()=>{
  const {min,max}=columnPeaks(pcm,sr,{start:2,end:3},4);
  expect([...min,...max].every(v=>v===0)).toBe(true);
 });
 it('fixed peaks are sliced to the window',()=>{
  const peaks=Float32Array.from([1,2,3,4,5,6,7,8]);
  expect([...fixedPeaksWindow(peaks,8,{start:2,end:6})]).toEqual([3,4,5,6]);
  expect(fixedPeaksWindow(peaks,8,{start:7.9,end:8}).length).toBeGreaterThan(0);
 });
});
describe('chopView handle drag',()=>{
 const win={start:1,end:2},trim={start:0,end:3};
 it('start lands exactly at the pointer time',()=>{
  const t=dragHandle('start',trim,234.5,win,1000,D);
  expect(t.start).toBeCloseTo(1.2345,9);expect(t.end).toBe(3);
 });
 it('end lands exactly at the pointer time',()=>{
  const t=dragHandle('end',trim,765.5,win,1000,D);
  expect(t.end).toBeCloseTo(1.7655,9);
 });
 it('start cannot come within 50 ms of end',()=>{
  const t=dragHandle('start',{start:0,end:1.5},900,win,1000,D);
  expect(t.start).toBeCloseTo(1.5-MIN_KEPT_SEC,9);expect(t.end).toBe(1.5);
 });
 it('end cannot come within 50 ms of start',()=>{
  const t=dragHandle('end',{start:1.5,end:3},0,win,1000,D);
  expect(t.end).toBeCloseTo(1.5+MIN_KEPT_SEC,9);
 });
 it('pointer past the edges clamps to the clip',()=>{
  expect(dragHandle('start',trim,-5000,win,1000,D).start).toBe(0);
  expect(dragHandle('end',trim,9000,win,1000,D).end).toBe(D);
 });
});
describe('chopView guards',()=>{
 it('pinch scale raises a tiny starting distance to the minimum',()=>{
  expect(pinchScale(2,48)).toBe(2);
  expect(pinchScale(100,200)).toBe(2);
  expect(pinchScale(0,50)).toBeCloseTo(50/24,9);
  expect(pinchScale(50,0)).toBe(1);
 });
 it('secToPx and pxToSec stay finite for a zero-width window',()=>{
  expect(secToPx(0,{start:0,end:0},300)).toBe(0);
  expect(pxToSec(10,{start:0,end:0},0)).toBe(0);
 });
 it('sameTrim compares both ends',()=>{
  expect(sameTrim({start:1,end:2},{start:1,end:2})).toBe(true);
  expect(sameTrim({start:1,end:2},{start:1,end:2.1})).toBe(false);
 });
 it('memoised column peaks reuse the result for equal inputs only',()=>{
  const f=memoColumnPeaks(),pcm=new Float32Array(100);
  const a=f(pcm,100,{start:0,end:1},10);
  expect(f(pcm,100,{start:0,end:1},10)).toBe(a);
  expect(f(pcm,100,{start:0,end:.5},10)).not.toBe(a);
 });
});
