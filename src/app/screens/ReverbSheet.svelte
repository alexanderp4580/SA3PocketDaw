<script lang="ts">
 import EffectsTransport from '../EffectsTransport.svelte';
 import Sheet from '../Sheet.svelte';import MixControl from '../MixControl.svelte';import {updateProject} from '../appState.svelte';import type {Track} from '../../store/projectModel';import {dragonfly,normalizeMix,type ReverbSettings,type ReverbAlgorithm} from '../../audio/mixer/model';
 let {track,onclose}:{track:Track;onclose:()=>void}=$props();let advanced=$state(false);const mix=$derived(normalizeMix(track.mix)),reverb=$derived(mix.reverb),data=$derived(dragonfly[reverb.algorithm]);
 function change(patch:Partial<ReverbSettings>){updateProject(p=>({...p,tracks:p.tracks.map(t=>t.id===track.id?{...t,mix:normalizeMix({...normalizeMix(t.mix),reverb:{...normalizeMix(t.mix).reverb,...patch}})}:t)}));}
 function parameter(i:number,v:number){const parameters=structuredClone(reverb.parameters);parameters[reverb.algorithm][i]=v;change({parameters});}
 function preset(index:number){const parameters=structuredClone(reverb.parameters);parameters[reverb.algorithm]=[...data.presets[index]!.values];change({parameters});}
 const common=['Decay','Predelay','Width','Size','Low Cut','High Cut'];
</script>
<Sheet title="Dragonfly reverb" sub={track.name} {onclose} tall>
 <EffectsTransport/>
 <p class="note">Add space to this track. Sound and notes stay separate.</p>
 <div class="seg">{#each ['hall','room','plate'] as a}<button class="sg" class:on={reverb.algorithm===a} onclick={()=>change({algorithm:a as ReverbAlgorithm})}>{a[0]!.toUpperCase()+a.slice(1)}</button>{/each}</div>
 <div class="btnrow"><button class="btn" aria-pressed={reverb.bypass} onclick={()=>change({bypass:!reverb.bypass})}>{reverb.bypass?'Enable reverb':'Bypass reverb'}</button><button class="btn" onclick={()=>change(normalizeMix().reverb)}>Reset</button></div>
 <MixControl label="Reverb amount" min={0} max={100} value={Math.round(reverb.wet*100)} unit="%" onchange={v=>change({wet:v/100})}/>
 <label class="preset">Preset<select aria-label="Reverb preset" value="" onchange={e=>{preset(Number(e.currentTarget.value));e.currentTarget.value='';}}><option value="" disabled>Choose a preset</option>{#each data.presets as p,i}<option value={i}>{p.name}</option>{/each}</select></label>
 {#each data.params.filter(p=>common.includes(p.name)) as p}<MixControl label={p.name==='Predelay'?'Pre-delay':p.name} min={p.min} max={p.max} step={p.unit==='s'||p.unit==='Hz'&&p.max<=5?.01:p.unit==='ms'?.1:1} value={reverb.parameters[reverb.algorithm][p.index]!} unit={p.unit} onchange={v=>parameter(p.index,v)}/>{/each}
 <button class="btn advanced" aria-expanded={advanced} onclick={()=>advanced=!advanced}>{advanced?'Hide':'Show'} advanced controls</button>
 {#if advanced}{#each data.params.filter(p=>!common.includes(p.name)&&p.name!=='Dry Level'&&p.name!=='Wet Level') as p}
 {#if p.name==='Algorithm'}<label class="preset">Plate structure<select aria-label="Plate structure" value={reverb.parameters.plate[p.index]} onchange={e=>parameter(p.index,Number(e.currentTarget.value))}><option value={0}>Simple</option><option value={1}>Nested</option><option value={2}>Tank</option></select></label>
 {:else}<MixControl label={p.name} min={p.min} max={p.max} step={p.max<=5?.01:1} value={reverb.parameters[reverb.algorithm][p.index]!} unit={p.unit} onchange={v=>parameter(p.index,v)}/>{/if}
 {/each}<p class="note">Early and late levels set their balance inside the wet sound. Reverb amount blends that sound with the original.</p>{/if}
 <p class="note">Dragonfly by Michael Willis and Rob van den Berg · <a href="/dragonfly/LICENSE" target="_blank" rel="noreferrer">GPL license</a> · <a href="/dragonfly/source.tar.gz" download>Source & build files</a></p>
 <div class="btnrow"><button class="btn pri" onclick={onclose}>Done</button></div>
</Sheet>
<style>.preset{display:flex;flex-direction:column;gap:6px;margin:12px 0;font-size:13px}.preset select{width:100%;min-width:0;height:44px;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:0 8px}.advanced{width:100%;font-size:13px}</style>
