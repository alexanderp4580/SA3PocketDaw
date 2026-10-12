/** A small least-recently-used set of keys; the client mirrors what each prepare worker holds. */
export function createKeyLru(capacity:number){
 const keys=new Map<number,true>();
 return {
  has:(key:number)=>keys.has(key),
  /** Marks `key` as most recently used; returns true when it was not present. */
  touch(key:number):boolean{const had=keys.delete(key);keys.set(key,true);if(keys.size>capacity)keys.delete(keys.keys().next().value!);return !had;},
  delete:(key:number)=>keys.delete(key),
 };
}
/** Profiles held by one prepare worker, with the same eviction order as the client's mirror. */
export function createProfileStore<T>(capacity:number){
 const items=new Map<number,T>();
 return {
  put(key:number,profile:T){items.delete(key);items.set(key,profile);if(items.size>capacity)items.delete(items.keys().next().value!);},
  get(key:number):T|undefined{const v=items.get(key);if(v!==undefined){items.delete(key);items.set(key,v);}return v;},
 };
}
export const PROFILE_CAPACITY=8;
