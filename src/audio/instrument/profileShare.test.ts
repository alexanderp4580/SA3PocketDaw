import { expect,it } from 'vitest';
import { createKeyLru,createProfileStore } from './profileShare';
it('asks for a profile only the first time a key is used',()=>{
 const m=createKeyLru(2);expect(m.touch(1)).toBe(true);expect(m.touch(1)).toBe(false);expect(m.touch(2)).toBe(true);
});
it('mirrors the worker store eviction order',()=>{
 const mirror=createKeyLru(2),store=createProfileStore<string>(2);
 const use=(k:number)=>{if(mirror.touch(k))store.put(k,`p${k}`);return store.get(k);};
 for(const k of [1,2,1,3,2,1,4,1,3])expect(use(k)).toBe(`p${k}`);
});
it('forgets a deleted key so it is sent again',()=>{
 const m=createKeyLru(2);m.touch(1);m.delete(1);expect(m.touch(1)).toBe(true);
});
