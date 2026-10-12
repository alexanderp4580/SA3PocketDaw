import { expect,it } from 'vitest';
import { assetLimit,createAssetCache,hardAssetLimit } from './assetCache';
function harness(limit:number,hardLimit?:number){
 const installed:number[]=[],evicted:number[]=[],loads:number[]=[];let fail=false;
 const cache=createAssetCache<string>({limit,hardLimit,load:async m=>{loads.push(m);if(fail)throw new Error('boom');return `a${m}`;},install:(m)=>installed.push(m),evict:m=>evicted.push(m)});
 return {cache,installed,evicted,loads,failNext:()=>{fail=true;}, recover:()=>{fail=false;}};
}
it('loads each pitch once, even for concurrent requests',async()=>{
 const h=harness(4);await Promise.all([h.cache.ensure(60),h.cache.ensure(60),h.cache.ensure(62)]);await h.cache.ensure(60);
 expect(h.loads).toEqual([60,62]);expect(h.installed).toEqual([60,62]);
});
it('evicts the least recently used pitch beyond the limit',async()=>{
 const h=harness(2);await h.cache.ensure(60);await h.cache.ensure(62);await h.cache.ensure(60);await h.cache.ensure(64);
 expect(h.evicted).toEqual([62]);expect(h.cache.has(60)).toBe(true);expect(h.cache.has(62)).toBe(false);
});
it('retries after a failed load',async()=>{
 const h=harness(2);h.failNext();await expect(h.cache.ensure(60)).rejects.toThrow('boom');h.recover();await h.cache.ensure(60);
 expect(h.loads).toEqual([60,60]);expect(h.installed).toEqual([60]);
});
it('sizes the limits from the residual length',()=>{
 expect(assetLimit(44100*2)).toBe(90);expect(assetLimit(44100*8)).toBe(24);expect(assetLimit(1000)).toBe(96);
 expect(hardAssetLimit(44100*2)).toBe(128);expect(hardAssetLimit(44100*8)).toBe(68);expect(hardAssetLimit(44100*60)).toBe(24);
});
it('keeps retained pitches installed beyond the soft limit and evicts the others first',async()=>{
 const h=harness(2,6);h.cache.retain(new Set([60,62,64,65]));
 for(const m of [60,62,64,65,70,72])await h.cache.ensure(m);
 expect(h.evicted).toEqual([70]);for(const m of [60,62,64,65,72])expect(h.cache.has(m)).toBe(true);
});
it('evicts the oldest retained pitch only beyond the hard limit',async()=>{
 const h=harness(1,3);h.cache.retain(new Set([60,62,64,65]));
 for(const m of [60,62,64,65])await h.cache.ensure(m);
 expect(h.evicted).toEqual([60]);expect(h.cache.has(65)).toBe(true);
});
it('keeps a pitch that was used again when evicting retained pitches',async()=>{
 const h=harness(1,3);h.cache.retain(new Set([60,62,64,65]));
 await h.cache.ensure(60);await h.cache.ensure(62);await h.cache.ensure(64);await h.cache.ensure(60);await h.cache.ensure(65);
 expect(h.evicted).toEqual([62]);
});
it('finds the nearest installed pitch within a distance',async()=>{
 const h=harness(8);for(const m of [60,64,70])await h.cache.ensure(m);
 expect(h.cache.nearest(62,2)).toBe(60);expect(h.cache.nearest(63,2)).toBe(64);expect(h.cache.nearest(67,2)).toBeNull();expect(h.cache.nearest(64,2)).toBe(64);
});
it('lets the first of two equally near pitches win by choosing the lower one',async()=>{
 const h=harness(8);for(const m of [60,64])await h.cache.ensure(m);expect(h.cache.nearest(62,2)).toBe(60);
});
