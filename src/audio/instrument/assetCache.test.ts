import { expect,it } from 'vitest';
import { assetLimit,createAssetCache } from './assetCache';
function harness(limit:number){
 const installed:number[]=[],evicted:number[]=[],loads:number[]=[];let fail=false;
 const cache=createAssetCache<string>({limit,load:async m=>{loads.push(m);if(fail)throw new Error('boom');return `a${m}`;},install:(m)=>installed.push(m),evict:m=>evicted.push(m)});
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
it('sizes the limit from the residual length within 16 to 48 pitches',()=>{
 expect(assetLimit(44100*2)).toBe(45);expect(assetLimit(44100*10)).toBe(16);expect(assetLimit(1000)).toBe(48);
});
