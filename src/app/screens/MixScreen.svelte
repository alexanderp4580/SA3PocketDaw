<script lang="ts">
 import {onMount} from 'svelte';import {ui,updateProject} from '../appState.svelte';import {engine} from '../services';import {toggleMute,toggleSolo,type Track} from '../../store/projectModel';import {finite} from '../../audio/mixer/model';import {normalizeMix,fxView,type TrackMix} from '../../audio/mixer/plugins';
 import Meter from '../Meter.svelte';import MixControl from '../MixControl.svelte';import EqSheet from './EqSheet.svelte';import ReverbSheet from './ReverbSheet.svelte';
 let {focusId=null}:{focusId?:string|null}=$props();let eqId=$state<string|null>(null),reverbId=$state<string|null>(null),errors=$state<Record<string,string|null>>({});const p=$derived(ui.project);
 const eqTrack=$derived(p?.tracks.find(t=>t.id===eqId)),reverbTrack=$derived(p?.tracks.find(t=>t.id===reverbId));
 const colors=['#ff8a3d','#4fb3ff','#b685ff','#3ddc84','#ff6fa8','#ffd23d'];
 function change(t:Track,patch:Partial<TrackMix>){updateProject(p=>({...p,tracks:p.tracks.map(x=>x.id===t.id?{...x,mix:normalizeMix({...normalizeMix(x.mix),...patch})}:x)}));}
 onMount(()=>{if(focusId)document.getElementById(`mix-${focusId}`)?.scrollIntoView({block:'start'});const timer=setInterval(()=>{errors=Object.fromEntries((ui.project?.tracks??[]).map(t=>[t.id,engine.mixerError(t.id)]));},500);return()=>{clearInterval(timer);engine.listenRange(null);};});
</script>
<div class="mix-screen scroll">
 <div class="heading"><h2>Mixer</h2><p class="note">Balance tracks, shape frequencies and add space.</p></div>
 <section class="channel master"><strong>Master</strong><Meter/><MixControl label="Master volume" value={finite(p?.masterDb,20*Math.log10(.8),-60,6)} min={-60} max={6} step={.1} unit="dB" onchange={v=>updateProject(p=>({...p,masterDb:v}))}/></section>
 {#each p?.tracks??[] as t,i(t.id)}
 {@const mix=fxView(normalizeMix(t.mix))}
 <section class="channel" id="mix-{t.id}" style="--channel:{colors[i%colors.length]}">
 <div class="row"><strong>{t.name}</strong><button class="small" class:active={t.muted} aria-label="Mute {t.name}" aria-pressed={t.muted} onclick={()=>updateProject(p=>toggleMute(p,t.id))}>Mute</button><button class="small" class:active={t.solo} aria-label="Solo {t.name}" aria-pressed={!!t.solo} onclick={()=>updateProject(p=>toggleSolo(p,t.id))}>Solo</button></div>
 <Meter trackId={t.id}/><MixControl label="Volume" value={mix.volumeDb} min={-60} max={12} step={.1} unit="dB" onchange={v=>change(t,{volumeDb:v})}/>
 <MixControl label={mix.pan===0?'Pan · Center':mix.pan<0?'Pan · Left':'Pan · Right'} value={Math.round(mix.pan*100)} min={-100} max={100} unit="%" onchange={v=>change(t,{pan:v/100})}/>
 <div class="buttons"><button class="btn" onclick={()=>change(t,{volumeDb:0,pan:0})}>Reset balance</button><button class="btn" onclick={()=>eqId=t.id}>EQ · {mix.eq.bypass?'Off':mix.eq.bands.filter(b=>b.enabled).length+' bands'}</button><button class="btn" onclick={()=>reverbId=t.id}>Reverb · {mix.reverb.bypass?'Off':Math.round(mix.reverb.wet*100)+'%'}</button></div>
 {#if errors[t.id]}<p class="error" role="alert">{errors[t.id]}</p><button class="btn" onclick={()=>engine.retryMixer(t.id)}>Retry effects</button>{/if}
 </section>
 {/each}
 {#if !p?.tracks.length}<p class="note">Create a sound on Tracks to start mixing.</p>{/if}
</div>
{#if eqTrack}<EqSheet track={eqTrack} onclose={()=>{engine.listenRange(null);eqId=null;}}/>{/if}
{#if reverbTrack}<ReverbSheet track={reverbTrack} onclose={()=>reverbId=null}/>{/if}
<style>.mix-screen{padding:12px;overflow:auto}.heading h2{margin:0 0 4px}.heading{margin-bottom:14px}.channel{background:var(--panel);border:1px solid var(--line);border-left:4px solid var(--channel,#9aa3b5);border-radius:12px;padding:12px;margin-bottom:12px}.row{display:flex;gap:6px;align-items:center;margin-bottom:12px}.row strong{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.small{height:40px;padding:0 10px;border-radius:6px;background:var(--panel2);font-size:12px}.active{color:var(--sa3);background:var(--sa3bg)}.buttons{display:grid;grid-template-columns:1fr 1fr;gap:6px}.buttons .btn:first-child{grid-column:1/-1;height:40px;font-size:12px}.buttons .btn{font-size:12px;min-width:0}.master strong{display:block;margin-bottom:12px}.error{color:#ff665b;font-size:12px;overflow-wrap:anywhere}</style>
