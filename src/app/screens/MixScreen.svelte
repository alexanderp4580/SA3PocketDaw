<script lang="ts">
 import {onMount,tick} from 'svelte';import {ui,updateProject} from '../appState.svelte';import {engine} from '../services';import {addPlugin} from '../../store/projectModel';import {finite} from '../../audio/mixer/model';import {normalizeMix,type PluginInstance,type PluginType} from '../../audio/mixer/plugins';
 import Meter from '../Meter.svelte';import VolumeFader from '../VolumeFader.svelte';import ChannelStrip from './ChannelStrip.svelte';import PluginPicker from './PluginPicker.svelte';import EqSheet from './EqSheet.svelte';import ReverbSheet from './ReverbSheet.svelte';
 let {focusId=null}:{focusId?:string|null}=$props();let editor=$state<{trackId:string;pluginId:string;type:PluginType}|null>(null),pickerId=$state<string|null>(null),errors=$state<Record<string,string|null>>({});let stripScroller:HTMLDivElement;
 const p=$derived(ui.project),editorTrack=$derived(p?.tracks.find(t=>t.id===editor?.trackId)),editorPlugin=$derived(editorTrack&&normalizeMix(editorTrack.mix).plugins.find(p=>p.id===editor?.pluginId&&p.type===editor.type)),pickerTrack=$derived(p?.tracks.find(t=>t.id===pickerId));
 const colors=['#ff8a3d','#4fb3ff','#b685ff','#3ddc84','#ff6fa8','#ffd23d'];
 function open(trackId:string,plugin:PluginInstance){editor={trackId,pluginId:plugin.id,type:plugin.type};}
 function close(){engine.listenRange(null);editor=null;}
 function add(type:PluginType){if(pickerId)updateProject(p=>addPlugin(p,pickerId!,type));pickerId=null;}
 $effect(()=>{const id=focusId;void tick().then(()=>{const el=id?document.getElementById(`mix-${id}`):null;if(el&&stripScroller)stripScroller.scrollTo({left:el.offsetLeft,behavior:'instant'});});});
 onMount(()=>{const timer=setInterval(()=>{errors=Object.fromEntries((ui.project?.tracks??[]).map(t=>[t.id,engine.mixerError(t.id)]));},500);return()=>{clearInterval(timer);engine.listenRange(null);};});
</script>
<div class="mix-screen">
 <div class="heading"><h2>Mixer</h2><span>Tracks → Master · scroll sideways</span></div>
 <div class="strips" bind:this={stripScroller} aria-label="Mixer channels">
 {#each p?.tracks??[] as track,i(track.id)}<ChannelStrip {track} color={colors[i%colors.length]!} onedit={plugin=>open(track.id,plugin)} onadd={()=>pickerId=track.id} error={errors[track.id]} onretry={()=>engine.retryMixer(track.id)}/>{/each}
 <section class="master" aria-label="Master channel"><header><strong>Master</strong></header><div class="master-levels"><VolumeFader label="Master volume" value={finite(p?.masterDb,20*Math.log10(.8),-60,6)} max={6} onchange={v=>updateProject(p=>({...p,masterDb:v}))}/><Meter vertical/></div></section>
 </div>
 {#if !p?.tracks.length}<p class="note">Create a sound on Tracks to start mixing.</p>{/if}
</div>
{#if editor&&editorTrack&&editorPlugin}{#if editor.type==='eq'}<EqSheet track={editorTrack} pluginId={editor.pluginId} onclose={close}/>{:else}<ReverbSheet track={editorTrack} pluginId={editor.pluginId} onclose={close}/>{/if}{/if}
{#if pickerTrack}<PluginPicker name={pickerTrack.name} onadd={add} onclose={()=>pickerId=null}/>{/if}
<style>.mix-screen{padding:8px 10px 10px;display:flex;flex-direction:column;flex:1;min-height:0;overflow-y:auto}.heading{height:34px;flex:none;display:flex;align-items:center;justify-content:space-between;gap:8px}.heading h2{font-size:17px;margin:0}.heading span{font-size:10px;color:var(--dim);text-align:right}.strips{display:flex;gap:10px;flex:1;min-height:340px;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;scroll-padding:0;padding-bottom:8px;position:relative;overscroll-behavior-x:contain;scrollbar-width:thin}.master{width:180px;flex:none;height:100%;scroll-snap-align:start;border:1px solid var(--line);border-top:3px solid #9aa3b5;border-radius:12px;background:var(--panel);padding:10px;display:flex;flex-direction:column}.master header{height:113px;flex:none;font-size:15px}.master-levels{flex:1;min-height:0;display:flex;justify-content:center;gap:8px}.note{margin:8px 0 0}</style>
