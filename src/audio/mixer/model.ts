import meta from './dragonfly-meta.json';
export type FilterType='bell'|'lowShelf'|'highShelf'|'lowPass'|'highPass'|'bandPass'|'notch'|'allPass';
export interface EqBand {id:string;type:FilterType;enabled:boolean;freq:number;gain:number;q:number;slope:number;}
export interface EqSettings {bypass:boolean;trimDb:number;bands:EqBand[];}
export type ReverbAlgorithm='hall'|'room'|'plate';
export interface ReverbSettings {algorithm:ReverbAlgorithm;bypass:boolean;wet:number;parameters:Record<ReverbAlgorithm,number[]>;}
export interface TrackMix {volumeDb:number;pan:number;eq:EqSettings;reverb:ReverbSettings;}
export const dragonfly=meta;
export const filterTypes:FilterType[]=['bell','lowShelf','highShelf','lowPass','highPass','bandPass','notch','allPass'];
export const filterNames:Record<FilterType,string>={bell:'Bell',lowShelf:'Low shelf',highShelf:'High shelf',lowPass:'Low pass',highPass:'High pass',bandPass:'Band pass',notch:'Notch',allPass:'All pass'};
export const slopes=[6,12,18,24,36,48];
export function finite(v:unknown,fallback:number,min:number,max:number){return typeof v==='number'&&Number.isFinite(v)?Math.min(max,Math.max(min,v)):fallback;}
export const dbGain=(db:number)=>db<=-60?0:10**(db/20);
export const gainDb=(gain:number)=>20*Math.log10(Math.max(1e-6,gain));
export const makeBand=(id:string):EqBand=>({id,type:'bell',enabled:true,freq:1000,gain:0,q:.70710678,slope:12});
export function normalizeBand(b:Partial<EqBand>,index=0):EqBand{return {id:typeof b.id==='string'?b.id:`band-${index}`,type:filterTypes.includes(b.type!)?b.type!:'bell',enabled:b.enabled!==false,freq:finite(b.freq,1000,20,20000),gain:finite(b.gain,0,-24,24),q:finite(b.q,.70710678,.1,30),slope:slopes.includes(b.slope!)?b.slope!:12};}
export function normalizeMix(m?:Partial<TrackMix>|null):TrackMix {
 const parameters={} as Record<ReverbAlgorithm,number[]>;
 for(const a of ['hall','room','plate'] as const)parameters[a]=dragonfly[a].params.map((p,i)=>finite(m?.reverb?.parameters?.[a]?.[i],dragonfly[a].defaults[i]!,p.min,p.max));
 return {volumeDb:finite(m?.volumeDb,0,-60,12),pan:finite(m?.pan,0,-1,1),eq:{bypass:m?.eq?.bypass===true,trimDb:finite(m?.eq?.trimDb,0,-24,24),bands:Array.isArray(m?.eq?.bands)?m!.eq!.bands.filter(b=>b&&typeof b==='object').map(normalizeBand):[]},reverb:{algorithm:['hall','room','plate'].includes(m?.reverb?.algorithm??'')?m!.reverb!.algorithm:'hall',bypass:m?.reverb?.bypass===true,wet:finite(m?.reverb?.wet,0,0,1),parameters}};
}
export function gainFilter(type:FilterType){return type==='bell'||type==='lowShelf'||type==='highShelf';}
export function bandwidth(freq:number,q:number){const d=Math.sqrt(4*q*q+1);return [freq*(d-1)/(2*q),freq*(d+1)/(2*q)];}
