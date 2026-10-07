<script lang="ts">
 import {updateProject} from '../appState.svelte';
 import {movePlugin,removePlugin,setPluginBypass} from '../../store/projectModel';
 import {MAX_PLUGINS,pluginTypes,type PluginInstance} from '../../audio/mixer/plugins';
 let {trackId,plugins,onedit,onadd}:{trackId:string;plugins:PluginInstance[];onedit:(p:PluginInstance)=>void;onadd:()=>void}=$props();
</script>
<div class="stack">
 <div class="stack-label">Inserts · {plugins.length}/{MAX_PLUGINS}</div>
 <div class="plugin-scroll">
 <div class="plugin-list" aria-label="Plugin chain">
 {#each plugins as plugin,i(plugin.id)}
 <div class="plugin" data-plugin-id={plugin.id}>
 <div class="plugin-header"><button class="name" onclick={()=>onedit(plugin)} aria-label="Edit {pluginTypes[plugin.type].label} insert {i+1}">{i+1} · {pluginTypes[plugin.type].label}</button><button class:bypassed={plugin.bypass} aria-label="Bypass {pluginTypes[plugin.type].label} insert {i+1}" aria-pressed={plugin.bypass} onclick={()=>updateProject(p=>setPluginBypass(p,trackId,plugin.id,!plugin.bypass))}>{plugin.bypass?'Off':'On'}</button></div>
 <div class="actions"><button aria-label="Move insert {i+1} up" disabled={i===0} onclick={()=>updateProject(p=>movePlugin(p,trackId,plugin.id,-1))}>↑</button><button aria-label="Move insert {i+1} down" disabled={i===plugins.length-1} onclick={()=>updateProject(p=>movePlugin(p,trackId,plugin.id,1))}>↓</button><button class="remove" aria-label="Remove insert {i+1}" onclick={()=>updateProject(p=>removePlugin(p,trackId,plugin.id))}>×</button></div>
 </div>
 {/each}
 {#if !plugins.length}<p class="empty">Add EQ or Reverb to shape this sound.</p>{/if}
 </div>
 <div class="stack-footer">
 <button class="add" disabled={plugins.length>=MAX_PLUGINS} onclick={onadd}>＋ Add plugin</button>
 <p class="limit">{plugins.length>=MAX_PLUGINS?'6 plugin limit reached':'Plugins run top to bottom'}</p>
 </div>
 </div>
</div>
<style>.stack{height:100%;min-height:0;min-width:0;display:flex;flex-direction:column;gap:4px}.stack-label{font-size:10px;color:var(--dim);height:16px;flex:none}.plugin-scroll{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior-y:contain;scrollbar-width:thin;display:flex;flex-direction:column}.plugin-list{flex:none}.stack-footer{position:sticky;bottom:0;flex:none;margin-top:auto;padding-top:4px;background:var(--panel)}.plugin{background:#11151b;border:1px solid var(--line);border-radius:8px;margin-bottom:6px;padding:3px;min-width:0}.plugin-header{display:flex;gap:3px;align-items:center}.plugin-header>button:last-child{width:40px;height:40px;flex:none;background:var(--panel2);border-radius:5px;font-size:11px}.plugin-header>button.bypassed{color:var(--dim);background:#15181d}.name{height:40px;flex:1;min-width:0;text-align:left;padding:0 7px;color:var(--sa3);font-weight:600;font-size:12px}.actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:2px}.actions button{height:40px;min-width:0;background:var(--panel2);border-radius:5px;font-size:16px}.actions .remove{color:#ff7878}.empty{padding:8px 4px;font-size:12px;color:var(--dim)}.add{width:100%;height:44px;flex:none;background:var(--sa3bg);color:var(--sa3);border-radius:7px;font-size:12px;font-weight:600}.limit{font-size:9px;color:var(--dim);height:22px;flex:none;margin:0}</style>
