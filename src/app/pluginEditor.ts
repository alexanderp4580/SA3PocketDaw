import {setPluginBypass,updatePluginSettings,type Project,type Track} from '../store/projectModel';
import {normalizeEqSettings,normalizeReverbSettings,type EqSettings,type ReverbSettings} from '../audio/mixer/model';
import {normalizeMix,type PluginType} from '../audio/mixer/plugins';
type EditorSettings={eq:EqSettings;reverb:ReverbSettings};
export function editorSettings<T extends PluginType>(track:Track,pluginId:string,type:T):EditorSettings[T]{
 const plugin=normalizeMix(track.mix).plugins.find(p=>p.id===pluginId&&p.type===type);
 const raw={...plugin?.settings,bypass:plugin?.bypass};
 return (type==='eq'?normalizeEqSettings(raw):normalizeReverbSettings(raw)) as EditorSettings[T];
}
export function editPlugin<T extends PluginType>(project:Project,trackId:string,pluginId:string,type:T,patch:Partial<EditorSettings[T]>):Project{
 const track=project.tracks.find(t=>t.id===trackId);
 if(!track||!normalizeMix(track.mix).plugins.some(p=>p.id===pluginId&&p.type===type))return project;
 const {bypass,...settings}=patch;
 const next=Object.keys(settings).length?updatePluginSettings(project,trackId,pluginId,settings):project;
 return typeof bypass==='boolean'?setPluginBypass(next,trackId,pluginId,bypass):next;
}
