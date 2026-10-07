<script lang="ts">
 import EffectsTransport from '../EffectsTransport.svelte';
 import {onMount} from 'svelte';import Sheet from '../Sheet.svelte';import MixControl from '../MixControl.svelte';import EqGraph from '../EqGraph.svelte';import {ui,updateProject} from '../appState.svelte';import {engine} from '../services';import {newId,type Track} from '../../store/projectModel';import {normalizeMix,makeBand,filterTypes,filterNames,gainFilter,slopes,type EqSettings,type EqBand} from '../../audio/mixer/model';
 let {track,onclose}:{track:Track;onclose:()=>void}=$props();let selected=$state<string|null>(null),listening=$state(false),post=$state(true),heat=$state(false),reference=$state('');const eq=$derived(normalizeMix(track.mix).eq),band=$derived(eq.bands.find(b=>b.id===selected)??eq.bands[0]);
 function change(patch:Partial<EqSettings>){updateProject(p=>({...p,tracks:p.tracks.map(t=>t.id===track.id?{...t,mix:normalizeMix({...normalizeMix(t.mix),eq:{...normalizeMix(t.mix).eq,...patch}})}:t)}));}
 function edit(id:string,patch:Partial<EqBand>){change({bands:eq.bands.map(b=>b.id===id?{...b,...patch}:b)});if(listening){const b=eq.bands.find(b=>b.id===id);if(b)engine.listenRange(track.id,{...b,...patch});}}
 function add(){const b=makeBand(newId('eq'));selected=b.id;change({bands:[...eq.bands,b]});}
 function select(id:string){selected=id;if(listening){const b=eq.bands.find(b=>b.id===id);if(b)engine.listenRange(track.id,b);}}
 function endListen(){listening=false;engine.listenRange(null);}
 async function listen(){if(listening){endListen();return;}await engine.unlock();if(band){listening=true;engine.listenRange(track.id,band);}}
 onMount(()=>()=>engine.listenRange(null));
 $effect(()=>{if(!ui.playing&&listening)endListen();});
</script>
<Sheet title="Parametric EQ" sub={track.name} {onclose} tall>
 <EffectsTransport/>
 <p class="note">Shape this track’s frequency range. Drag a band or use the controls below.</p>
 <EqGraph bands={eq.bands} bypass={eq.bypass} trimDb={eq.trimDb} selected={band?.id??null} trackId={track.id} {post} {heat} {reference} onselect={select} onedit={edit}/>
 <div class="view"><button class:on={post} onclick={()=>post=!post}>{post?'After EQ':'Before EQ'}</button><button class:on={heat} aria-pressed={heat} onclick={()=>heat=!heat}>Heatmap</button><select aria-label="Compare track spectrum" bind:value={reference}><option value="">No comparison</option>{#each ui.project?.tracks.filter(t=>t.id!==track.id)??[] as t}<option value={t.id}>{t.name}</option>{/each}</select></div>
 <div class="bands">{#each eq.bands as b,i(b.id)}<button style="--band:hsl({i*67%360} 85% 65%)" class:active={band?.id===b.id} onclick={()=>select(b.id)} aria-label="Select band {i+1}">{i+1}{!b.enabled?' · off':''}</button>{/each}<button class="add" onclick={add}>＋ Add band</button></div>
 {#if band}
 <label class="type">Filter type<select aria-label="Filter type" value={band.type} onchange={e=>edit(band.id,{type:e.currentTarget.value as EqBand['type']})}>{#each filterTypes as t}<option value={t}>{filterNames[t]}</option>{/each}</select></label>
 <div class="btnrow"><button class="btn" aria-pressed={band.enabled} onclick={()=>edit(band.id,{enabled:!band.enabled})}>{band.enabled?'Disable band':'Enable band'}</button><button class="btn danger" onclick={()=>{endListen();change({bands:eq.bands.filter(b=>b.id!==band.id)});selected=null;}}>Remove band</button></div>
 <MixControl label="Frequency" value={Math.round(band.freq)} min={20} max={Math.min(20000,engine.sampleRate()*.49)} unit="Hz" onchange={v=>edit(band.id,{freq:v})}/>
 {#if gainFilter(band.type)}<MixControl label="Gain" value={band.gain} min={-24} max={24} step={.1} unit="dB" onchange={v=>edit(band.id,{gain:v})}/>{/if}
 {#if !((band.type==='lowPass'||band.type==='highPass')&&band.slope===6)}<MixControl label="Width · Q (higher is narrower)" value={band.q} min={.1} max={30} step={.01} onchange={v=>edit(band.id,{q:v})}/>{/if}
 {#if band.type==='lowPass'||band.type==='highPass'}<label class="type">Cut slope<select aria-label="Cut slope" value={band.slope} onchange={e=>edit(band.id,{slope:Number(e.currentTarget.value)})}>{#each slopes as slope}<option value={slope}>{slope} dB / octave</option>{/each}</select></label>{/if}
 <button class="btn listen" class:active={listening} disabled={!ui.playing} aria-pressed={listening} onclick={()=>void listen()}>{listening?'End range listening':'Listen range'}</button><p class="note">Temporarily hear only this frequency range. Track Solo stays separate. Play to listen in context.</p>
 {:else}<p class="note">Flat EQ. Add a band to start shaping this sound.</p>{/if}
 <MixControl label="EQ output trim" value={eq.trimDb} min={-24} max={24} step={.1} unit="dB" onchange={v=>change({trimDb:v})}/>
 <div class="btnrow"><button class="btn" aria-pressed={eq.bypass} onclick={()=>{endListen();change({bypass:!eq.bypass});}}>{eq.bypass?'Enable EQ':'Bypass EQ'}</button><button class="btn" onclick={()=>{endListen();selected=null;change({bands:[],trimDb:0,bypass:false});}}>Reset EQ</button></div>
 <div class="btnrow"><button class="btn pri" onclick={onclose}>Done</button></div>
</Sheet>
<style>.view{display:flex;gap:5px;flex-wrap:wrap;margin:8px 0}.view button,.view select{height:40px;background:var(--panel2);border-radius:6px;padding:0 8px;font-size:11px;color:var(--text);border:1px solid var(--line)}.view select{min-width:0;flex:1}.view .on{color:var(--sa3)}.bands{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0}.bands button{min-width:44px;height:44px;border:1px solid var(--band,var(--line));border-radius:8px;padding:0 10px;color:var(--band,var(--text));background:var(--panel2)}.bands .active{background:color-mix(in srgb,var(--band) 20%,#121419);outline:1px solid var(--band)}.bands .add{color:var(--sa3)}.type{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:13px;margin:10px 0}.type select{min-width:0;max-width:70%;height:44px;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:6px;padding:0 10px}.listen{width:100%;font-size:13px}.listen.active{background:var(--sa3bg);color:var(--sa3)}</style>
