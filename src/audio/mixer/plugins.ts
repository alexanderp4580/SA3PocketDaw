import {finite,normalizeEqSettings,normalizeReverbSettings,type EqSettings,type FxView,type ReverbSettings} from './model';
export type PluginType='eq'|'reverb';
export type EqPluginSettings=Omit<EqSettings,'bypass'>;
export type ReverbPluginSettings=Omit<ReverbSettings,'bypass'>;
export type PluginSettings=EqPluginSettings|ReverbPluginSettings;
export interface PluginInstance {id:string;type:PluginType;bypass:boolean;settings:PluginSettings;}
export interface TrackMix {volumeDb:number;pan:number;plugins:PluginInstance[];}
export const MAX_PLUGINS=6;
interface PluginTypeEntry {label:string;defaults:()=>PluginSettings;normalize:(raw:unknown)=>PluginSettings;}
const strip=<T extends {bypass:boolean}>({bypass:_,...rest}:T):Omit<T,'bypass'>=>rest;
export const pluginTypes:Record<PluginType,PluginTypeEntry>={
 eq:{label:'EQ',defaults:()=>strip(normalizeEqSettings()),normalize:raw=>strip(normalizeEqSettings(raw as Partial<EqSettings>))},
 reverb:{label:'Reverb',defaults:()=>strip(normalizeReverbSettings()),normalize:raw=>strip(normalizeReverbSettings(raw as Partial<ReverbSettings>))}
};
export const pluginTypeIds=Object.keys(pluginTypes) as PluginType[];
const obj=(v:unknown):Record<string,unknown>|null=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:null;
export function normalizePlugin(type:PluginType,id:string,bypass:boolean,settings:unknown):PluginInstance{return {id,type,bypass,settings:pluginTypes[type].normalize(obj(settings)??{})};}
/** Legacy fused `eq`/`reverb` fields become an EQ (if it has an enabled band or a trim) followed by a Reverb (if wet > 0). */
function legacyPlugins(m:Record<string,unknown>):PluginInstance[]{
 const out:PluginInstance[]=[],eq=normalizeEqSettings(obj(m.eq) as Partial<EqSettings>|null),reverb=normalizeReverbSettings(obj(m.reverb) as Partial<ReverbSettings>|null);
 if(eq.bands.some(b=>b.enabled)||eq.trimDb!==0)out.push({id:'eq',type:'eq',bypass:eq.bypass,settings:strip(eq)});
 if(reverb.wet>0)out.push({id:'reverb',type:'reverb',bypass:reverb.bypass,settings:strip(reverb)});
 return out;
}
export function normalizeMix(m?:unknown):TrackMix{
 const raw=obj(m)??{},list:PluginInstance[]=[],used=new Set<string>();
 const source=Array.isArray(raw.plugins)?raw.plugins:legacyPlugins(raw);
 for(const item of source){
  const p=obj(item);if(!p||!(typeof p.type==='string'&&Object.hasOwn(pluginTypes,p.type)))continue;
  const type=p.type as PluginType;let id=typeof p.id==='string'&&p.id?p.id:type,base=id,n=2;
  while(used.has(id))id=`${base}-${n++}`;used.add(id);
  list.push(normalizePlugin(type,id,p.bypass===true,p.settings));
  if(list.length>=MAX_PLUGINS)break;
 }
 return {volumeDb:finite(raw.volumeDb,0,-60,12),pan:finite(raw.pan,0,-1,1),plugins:list};
}
const first=(m:TrackMix,type:PluginType)=>m.plugins.find(p=>p.type===type);
export function fxView(m:TrackMix):FxView{
 const e=first(m,'eq'),r=first(m,'reverb');
 return {volumeDb:m.volumeDb,pan:m.pan,eq:normalizeEqSettings({...e?.settings as Partial<EqSettings>,bypass:e?.bypass}),reverb:normalizeReverbSettings({...r?.settings as Partial<ReverbSettings>,bypass:r?.bypass})};
}
/** Writes a changed `eq` and/or `reverb` back into the first plugin of that type, appending one when the track has none. */
export function withFxView(m:TrackMix,patch:Partial<Pick<FxView,'eq'|'reverb'>>):TrackMix{
 let next=m;
 for(const type of pluginTypeIds){
  const v=patch[type];if(!v)continue;
  const {bypass,...settings}=v,at=next.plugins.findIndex(p=>p.type===type),plugin=normalizePlugin(type,at<0?uniqueId(next,type):next.plugins[at]!.id,bypass,settings);
  if(at>=0)next={...next,plugins:next.plugins.map((p,i)=>i===at?plugin:p)};
  else if(next.plugins.length<MAX_PLUGINS)next={...next,plugins:[...next.plugins,plugin]};
 }
 return next;
}
export function uniqueId(m:TrackMix,base:string):string{const used=new Set(m.plugins.map(p=>p.id));let id=base,n=2;while(used.has(id))id=`${base}-${n++}`;return id;}
