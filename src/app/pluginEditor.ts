import {masterChain,setPluginBypass,updatePluginSettings,type Project,type Track} from '../store/projectModel';
import {defaultFx,fxSpecs,normalizeFx,type FxKind,type FxSettings,type ParamSpec} from '../audio/mixer/fx/spec';
import {normalizeEqSettings,normalizeReverbSettings,type EqSettings,type ReverbSettings} from '../audio/mixer/model';
import {isFxType,MASTER_ID,normalizeMix} from '../audio/mixer/plugins';
type EditorSettings={eq:EqSettings;reverb:ReverbSettings};
export function editorSettings<T extends 'eq'|'reverb'>(track:Track,pluginId:string,type:T):EditorSettings[T]{
 const plugin=normalizeMix(track.mix).plugins.find(p=>p.id===pluginId&&p.type===type);
 const raw={...plugin?.settings,bypass:plugin?.bypass};
 return (type==='eq'?normalizeEqSettings(raw):normalizeReverbSettings(raw)) as EditorSettings[T];
}
export function editPlugin<T extends 'eq'|'reverb'>(project:Project,trackId:string,pluginId:string,type:T,patch:Partial<EditorSettings[T]>):Project{
 const track=trackId===MASTER_ID?masterTrack(project):project.tracks.find(t=>t.id===trackId);
 if(!track||!normalizeMix(track.mix).plugins.some(p=>p.id===pluginId&&p.type===type))return project;
 const {bypass,...settings}=patch;
 const next=Object.keys(settings).length?updatePluginSettings(project,trackId,pluginId,settings):project;
 return typeof bypass==='boolean'?setPluginBypass(next,trackId,pluginId,bypass):next;
}
/** Master channel as a track-shaped view, so editors that take a track work on the master chain. */
export function masterTrack(project:Project):Track{
 return {id:MASTER_ID,name:'Master',muted:false,sampleId:null,rootMidi:60,notes:[],mix:{volumeDb:0,pan:0,plugins:masterChain(project)}};
}
export interface FxEditorState {kind:FxKind;settings:FxSettings;bypass:boolean;}
/** Normalised state of an effect insert, or null when the insert is missing or an EQ/reverb. */
export function fxEditorState(track:Track,pluginId:string):FxEditorState|null{
 const plugin=normalizeMix(track.mix).plugins.find(p=>p.id===pluginId);
 return plugin&&isFxType(plugin.type)?{kind:plugin.type,settings:normalizeFx(plugin.type,plugin.settings),bypass:plugin.bypass}:null;
}
const fxPlugin=(project:Project,trackId:string,pluginId:string)=>{
 const mix=trackId===MASTER_ID?{plugins:masterChain(project)}:normalizeMix(project.tracks.find(t=>t.id===trackId)?.mix);
 const plugin=mix.plugins.find(p=>p.id===pluginId);return plugin&&isFxType(plugin.type)?plugin:null;
};
/** Sets one effect parameter (clamped and snapped); unknown track, insert or parameter returns the same project. */
export function setFxParam(project:Project,trackId:string,pluginId:string,param:string,value:number):Project{
 const plugin=fxPlugin(project,trackId,pluginId);
 if(!plugin||!fxSpecs[plugin.type as FxKind].params.some(s=>s.id===param))return project;
 return updatePluginSettings(project,trackId,pluginId,{[param]:value});
}
/** Restores default parameters and enables the insert. */
export function resetFx(project:Project,trackId:string,pluginId:string):Project{
 const plugin=fxPlugin(project,trackId,pluginId);if(!plugin)return project;
 return setPluginBypass(updatePluginSettings(project,trackId,pluginId,defaultFx(plugin.type as FxKind)),trackId,pluginId,false);
}
/** Parameters worth showing for the current choices (for example free time only when the delay is not tempo-synced). */
export function visibleParams(kind:FxKind,settings:FxSettings):ParamSpec[]{
 return fxSpecs[kind].params.filter(s=>{
  if(kind==='delay'&&s.id==='time')return settings.sync===0;
  if(kind==='filter'){if(s.id==='rate')return settings.sweep===1;if(s.id==='note')return settings.sweep===2;if(s.id==='depth')return settings.sweep!==0;}
  return true;
 });
}
