import {describe,it,expect} from 'vitest';
import {addPlugin,addTrack,createProject} from '../store/projectModel';
import {normalizeMix} from '../audio/mixer/plugins';
import {editorSettings,editPlugin} from './pluginEditor';
function fixture(){let p=addTrack(createProject(),'Lead');const tid=p.tracks[0]!.id;p=addPlugin(p,tid,'eq',()=> 'first');p=addPlugin(p,tid,'eq',()=> 'second');p=addPlugin(p,tid,'reverb',()=> 'space');return {p,tid};}
describe('plugin instance editors',()=>{
 it('edits the selected EQ without changing the other EQ or track balance',()=>{const {p,tid}=fixture();const q=editPlugin(p,tid,'second','eq',{trimDb:9});expect(editorSettings(q.tracks[0]!,'second','eq').trimDb).toBe(9);expect(editorSettings(q.tracks[0]!,'first','eq').trimDb).toBe(0);expect(normalizeMix(q.tracks[0]!.mix).volumeDb).toBe(0);expect(editorSettings(p.tracks[0]!,'second','eq').trimDb).toBe(0);});
 it('updates bypass on the instance and keeps it out of settings',()=>{const {p,tid}=fixture();const q=editPlugin(p,tid,'space','reverb',{bypass:true,wet:.7});const list=normalizeMix(q.tracks[0]!.mix).plugins;expect(list[2]).toMatchObject({bypass:true,settings:{wet:.7}});expect(list[2]!.settings).not.toHaveProperty('bypass');expect(list[0]!.bypass).toBe(false);});
 it('ignores an editor target removed from the track or with a mismatched type',()=>{const {p,tid}=fixture();expect(editPlugin(p,tid,'missing','eq',{trimDb:5})).toBe(p);expect(editPlugin(p,tid,'space','eq',{trimDb:5})).toBe(p);});
});
