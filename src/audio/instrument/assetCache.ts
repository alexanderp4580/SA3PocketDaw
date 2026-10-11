const BUDGET_BYTES=16e6,MIN_PITCHES=16,MAX_PITCHES=48;
/** Pitches kept installed in one player: the notched residual dominates, so long sources keep fewer. */
export const assetLimit=(residualLength:number)=>Math.max(MIN_PITCHES,Math.min(MAX_PITCHES,Math.floor(BUDGET_BYTES/(Math.max(1,residualLength)*4))));
export interface AssetCacheOptions<T> {limit:number;load:(midi:number)=>Promise<T>;install:(midi:number,assets:T)=>void;evict:(midi:number)=>void;}
/** Tracks which pitches are installed in the worklet; prepared data is handed to `install` and not retained here. */
export function createAssetCache<T>(o:AssetCacheOptions<T>){
 const installed=new Set<number>(),pending=new Map<number,Promise<void>>();
 return {
  has:(midi:number)=>installed.has(midi),
  ensure(midi:number):Promise<void>{
   if(installed.has(midi)){installed.delete(midi);installed.add(midi);return Promise.resolve();}
   let p=pending.get(midi);
   if(!p){
    p=o.load(midi).then(assets=>{
     o.install(midi,assets);installed.add(midi);
     while(installed.size>o.limit){const old=installed.values().next().value!;installed.delete(old);o.evict(old);}
    }).finally(()=>pending.delete(midi));
    pending.set(midi,p);
   }
   return p;
  },
 };
}
