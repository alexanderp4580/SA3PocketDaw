const BUDGET_BYTES=32e6,HARD_BUDGET_BYTES=96e6,MIN_PITCHES=24,MAX_PITCHES=96,MAX_HARD_PITCHES=128;
const pitchesWithin=(budget:number,residualLength:number)=>Math.floor(budget/(Math.max(1,residualLength)*4));
/** Pitches kept installed in one player before least-recently-used pitches outside the retained set are evicted. The notched residual dominates, so long sources keep fewer. */
export const assetLimit=(residualLength:number)=>Math.max(MIN_PITCHES,Math.min(MAX_PITCHES,pitchesWithin(BUDGET_BYTES,residualLength)));
/** Absolute pitch count; retained pitches may fill the space between the soft and this limit. */
export const hardAssetLimit=(residualLength:number)=>Math.max(MIN_PITCHES,Math.min(MAX_HARD_PITCHES,pitchesWithin(HARD_BUDGET_BYTES,residualLength)));
export interface AssetCacheOptions<T> {limit:number;hardLimit?:number;load:(midi:number)=>Promise<T>;install:(midi:number,assets:T)=>void;evict:(midi:number)=>void;}
/**
 * Tracks which pitches are installed in the worklet; prepared data is handed to `install` and not retained here.
 * Pitches in the retained set (the pitches a pattern plays) are only evicted when the hard limit is exceeded.
 */
export function createAssetCache<T>(o:AssetCacheOptions<T>){
 const installed=new Set<number>(),pending=new Map<number,Promise<void>>(),hardLimit=Math.max(o.limit,o.hardLimit??o.limit);
 let retained=new Set<number>();
 const evictOldest=(keep:number,allowRetained:boolean)=>{for(const m of installed)if(m!==keep&&(allowRetained||!retained.has(m))){installed.delete(m);o.evict(m);return true;}return false;};
 function trim(keep:number){
  while(installed.size>o.limit&&evictOldest(keep,false));
  while(installed.size>hardLimit&&evictOldest(keep,true));
 }
 return {
  has:(midi:number)=>installed.has(midi),
  /** Pitches that eviction avoids until the hard limit. */
  retain(midis:Iterable<number>){retained=new Set(midis);},
  /** The installed pitch closest to `midi` within `distance` semitones (the lower one on a tie), or null. */
  nearest(midi:number,distance:number):number|null{
   let best:number|null=null;
   for(const m of installed){const d=Math.abs(m-midi);if(d>distance)continue;if(best===null||d<Math.abs(best-midi)||(d===Math.abs(best-midi)&&m<best))best=m;}
   return best;
  },
  ensure(midi:number):Promise<void>{
   if(installed.has(midi)){installed.delete(midi);installed.add(midi);return Promise.resolve();}
   let p=pending.get(midi);
   if(!p){
    p=o.load(midi).then(assets=>{
     o.install(midi,assets);installed.add(midi);trim(midi);
    }).finally(()=>pending.delete(midi));
    pending.set(midi,p);
   }
   return p;
  },
 };
}
