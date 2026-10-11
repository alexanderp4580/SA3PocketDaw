<script lang="ts">
 import {onMount} from 'svelte';
 import EffectsTransport from '../EffectsTransport.svelte';import Sheet from '../Sheet.svelte';
 import {updateProject} from '../appState.svelte';import {engine} from '../services';import type {Track} from '../../store/projectModel';
 import {fxSpecs,formatParam,fromSlider,toSlider,type ParamSpec} from '../../audio/mixer/fx/spec';
 import {fxEditorState,resetFx,setFxParam,visibleParams} from '../pluginEditor';import {setPluginBypass} from '../../store/projectModel';
 let {track,pluginId,onclose}:{track:Track;pluginId:string;onclose:()=>void}=$props();
 const fx=$derived(fxEditorState(track,pluginId)),spec=$derived(fx?fxSpecs[fx.kind]:null),params=$derived(fx?visibleParams(fx.kind,fx.settings):[]);
 let reduction=$state(0);
 onMount(()=>{const timer=setInterval(()=>{const v=engine.pluginReduction(track.id,pluginId);reduction=v??0;},50);return()=>clearInterval(timer);});
 const set=(id:string,v:number)=>updateProject(p=>setFxParam(p,track.id,pluginId,id,v));
 const segmented=(s:ParamSpec)=>!!s.choices&&s.choices.length<=4;
 const barWidth=(db:number)=>`${Math.min(100,db/24*100)}%`;
</script>
{#if fx&&spec}
<Sheet title={spec.label} sub={track.name} {onclose} tall>
 <EffectsTransport/>
 <p class="note">{spec.description}.</p>
 {#if spec.reduction}<div class="gr" aria-label="Gain reduction"><span>Gain reduction</span><div class="bar"><i style:width={barWidth(reduction)}></i></div><b>{reduction.toFixed(1)} dB</b></div>{/if}
 {#each params as s(s.id)}
  {#if segmented(s)}
   <div class="field" role="group" aria-label={s.label}><span>{s.label}</span><div class="seg">{#each s.choices! as choice,i}<button class="sg" class:on={fx.settings[s.id]===i} aria-pressed={fx.settings[s.id]===i} onclick={()=>set(s.id,i)}>{choice}</button>{/each}</div></div>
  {:else if s.choices}
   <label class="field"><span>{s.label}</span><select aria-label={s.label} value={fx.settings[s.id]} onchange={e=>set(s.id,Number(e.currentTarget.value))}>{#each s.choices as choice,i}<option value={i}>{choice}</option>{/each}</select></label>
  {:else}
   <label class="field slider"><span>{s.label}</span><output>{formatParam(s,fx.settings[s.id]!)}</output><input type="range" aria-label={s.label} min={0} max={1} step={.001} value={toSlider(s,fx.settings[s.id]!)} oninput={e=>set(s.id,fromSlider(s,e.currentTarget.valueAsNumber))}/></label>
  {/if}
 {/each}
 <div class="btnrow"><button class="btn" aria-pressed={fx.bypass} onclick={()=>updateProject(p=>setPluginBypass(p,track.id,pluginId,!fx.bypass))}>{fx.bypass?'Enable':'Bypass'}</button><button class="btn" onclick={()=>updateProject(p=>resetFx(p,track.id,pluginId))}>Reset</button></div>
 <div class="btnrow"><button class="btn pri" onclick={onclose}>Done</button></div>
</Sheet>
{/if}
<style>
 .field{display:flex;flex-direction:column;gap:6px;margin:12px 0;font-size:13px}
 .field.slider{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:2px 8px}
 .field output{font-size:12px;color:var(--sa3);font-variant-numeric:tabular-nums}
 .field input[type=range]{grid-column:1/-1;width:100%;min-width:0;height:44px;accent-color:var(--sa3);margin:0}
 .field select{width:100%;min-width:0;height:44px;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:0 8px}
 .seg{display:flex;gap:6px;flex-wrap:wrap}.sg{flex:1;min-width:0;min-height:44px;border-radius:8px;background:var(--panel2);color:var(--text);border:1px solid var(--line);padding:0 6px;font-size:12px}.sg.on{background:var(--sa3bg);color:var(--sa3);border-color:var(--sa3)}
 .gr{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:8px;align-items:center;margin:10px 0;font-size:12px;color:var(--dim)}
 .gr .bar{height:10px;background:#0a0d12;border-radius:3px;overflow:hidden}.gr i{display:block;height:100%;background:var(--sa3)}.gr b{font-variant-numeric:tabular-nums;color:var(--text);min-width:58px;text-align:right}
</style>
