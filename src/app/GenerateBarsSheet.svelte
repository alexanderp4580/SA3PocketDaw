<script lang="ts">
 import {onDestroy,onMount,untrack} from 'svelte';
 import Sheet from './Sheet.svelte';
 import {ui,stop,notify,refreshModelCards} from './appState.svelte';
 import {engine,generation,models,transcriber,log,presetHost} from './services';
 import {loadApiKey,redactKey} from '../store/apiKey';
 import {generateCloud} from '../gen/cloud';
 import {generateWithFallback,loadDevice,effectiveDevice,gpuAllowed} from '../gen/device';
 import {generateBars,type BarsTake} from '../melody/pipeline';
 import {generateContextBars} from '../melody/contextPipeline';
 import {contextPlan,defaultContextTracks,contextStamp} from '../melody/context';
 import {renderContext} from '../melody/renderContext';
 import type {CloudParams} from '../gen/cloud';
 import {previewProject} from '../melody/preview';
 import {barSeconds,canKeepTake,replaceBars,type TakeStamp} from '../melody/take';
 import {PACK_ID,transcriberPack} from '../transcribe/pack';
 import {trackBars,type Track} from '../store/projectModel';
 import type {ModelId} from '../gen/protocol';
 let {track,bars,onkeep,onclose}:{track:Track;bars:number;onkeep:(track:Track)=>void;onclose:()=>void}=$props();
 const scope=log.scope('melody');
 let startBar=$state(1),count=$state(untrack(()=>Math.min(2,bars)));
 let style=$state('A simple memorable melody with a clear rhythm');
 let source=$state<'device'|'cloud'>(loadApiKey(localStorage)?'cloud':'device');
 let model=$state<ModelId>('small-music');
 let followSong=$state(false);
 let contextIds=$state<string[]>(untrack(()=>ui.project?defaultContextTracks(ui.project,track.id,Object.fromEntries(ui.presetCards.map(c=>[c.id,c.category]))):[]));
 let pack=$state('Checking'),installed=$state(false),available=$state(false);
 let busy=$state(false),status=$state(''),error=$state(''),previewing=$state(false);
 let result=$state.raw<BarsTake|null>(null);
 let stamp:TakeStamp|null=null;
 let controller:AbortController|null=null;
 let timer:ReturnType<typeof setTimeout>|undefined;
 let closed=false;
 const seconds=$derived(barSeconds(count,ui.project?.bpm??120));
 const choices=$derived(ui.modelCards.filter(c=>c.id!=='small-sfx'&&c.available&&c.status==='installed'));
 const valid=$derived(Number.isInteger(startBar)&&startBar>=1&&Number.isInteger(count)&&count>=1&&count<=(followSong?2:4)&&startBar+count-1<=bars&&seconds<=12);
 const stampNow=():TakeStamp=>({projectId:ui.project?.id??'',trackId:track.id,bpm:ui.project?.bpm??120,bars:trackBars(track,ui.project?.bars??2),notes:JSON.stringify(track.notes),key:JSON.stringify([ui.project?.key,ui.project?.scale]),context:followSong&&ui.project?contextStamp(ui.project,contextIds):'',sound:JSON.stringify([track.sampleId,track.soundType,track.presetId,track.trim,track.instrumentControls,track.sampleControls])});
 const contextTracks=$derived(ui.project?.tracks.filter(t=>t.id!==track.id&&t.notes.length)??[]);
 const contextSetup=$derived.by(()=>{if(!followSong||!ui.project)return {plan:null,reason:''};try{return {plan:contextPlan(ui.project,track.id,startBar,count,contextIds),reason:''};}catch(e){return {plan:null,reason:e instanceof Error?e.message:String(e)};}});
 function toggleFollow(value:boolean){followSong=value;if(value){source='cloud';count=Math.min(count,2);}}
 function toggleContext(id:string,checked:boolean){contextIds=checked?[...contextIds,id]:contextIds.filter(x=>x!==id);}
 const stale=$derived(result&&stamp?!canKeepTake(stamp,stampNow()):false);
 function stopPreview(){clearTimeout(timer);if(previewing){engine.stop();if(ui.project)engine.setProject(ui.project);}engine.stopPreview();previewing=false;}
 function close(){closed=true;controller?.abort();stopPreview();onclose();}
 onDestroy(()=>{closed=true;controller?.abort();stopPreview();});
 async function refresh(){try{if(!models.getManifest())await models.loadManifest();const p=transcriberPack(models.getManifest(),await models.packStates());installed=p.status==='installed';available=p.available;pack=installed?'Piano transcriber ready':p.available?'Download Piano transcriber (58 MB)':'Piano transcriber is not in the model list';}catch{pack='Could not load the model list';}}
 onMount(()=>{void refresh();const off=models.onChange(()=>void refresh());if(choices.length&&!choices.some(c=>c.id===model))model=choices[0]!.id;return off;});
 async function install(id=PACK_ID){busy=true;error='';controller=new AbortController();try{await models.download(id,{signal:controller.signal,onProgress:p=>{status=`Installing ${id===PACK_ID?'piano transcriber':'Small Music'} · ${Math.round(p.packBytes/Math.max(1,p.packTotal)*100)}%`;}});await refreshModelCards();await refresh();}catch(e){error=e instanceof Error?e.message:String(e);}finally{busy=false;status='';controller=null;}}
 async function run(){
  if(busy||!valid||(followSong&&!contextSetup.plan))return;
  stop();stopPreview();result=null;error='';stamp=stampNow();busy=true;controller=new AbortController();const signal=controller.signal;
  const request={bpm:stamp.bpm,key:ui.project?.key??'C',scale:ui.project?.scale??'major',startBar,bars:count,style,seed:Math.floor(Math.random()*0xfffffffe)};
  try{
   await transcriber.unload();if(signal.aborted)throw new DOMException('Cancelled','AbortError');
   const generate=async(p:CloudParams)=>{
    if(source==='cloud'){const key=loadApiKey(localStorage);if(!key)throw Error('Save a Stability AI key on Models first.');return generateCloud(p,key,{signal,onProgress:e=>status=e.message});}
    const device=effectiveDevice(loadDevice(localStorage),gpuAllowed(!!navigator.gpu,ui.compat?.gpuUsable??null));
    const r=await generateWithFallback(q=>generation.generate(q,{signal,onProgress:e=>status=e.message||e.stage}),{...p,model,steps:8,mode:'sample',device},{signal,onFallback:()=>status='Retrying generation on the CPU'});
    await generation.unload();generation.dispose();return r.output;
   };
   const transcribe=async(audio:Float32Array)=>(await transcriber.transcribe(audio,{signal,name:`${count} generated bars`,onProgress:p=>status=p.message})).notes;
   const out=followSong
    ?await generateContextBars(request,contextSetup.plan!,{signal,progress:m=>status=m,render:p=>renderContext(p,presetHost,signal),generate,transcribe})
    :await generateBars(request,{signal,progress:m=>status=m,generate:p=>generate({...p,steps:8}),transcribe});
   if(closed||signal.aborted)return;
   result=out;scope.info('bars prepared',{trackId:track.id,bars:count,seconds:out.seconds,notes:out.notes.length,source});
  }catch(e){if(!closed)error=signal.aborted?'Cancelled. Your notes are unchanged.':redactKey(e instanceof Error?e.message:String(e),loadApiKey(localStorage)??'');}
  finally{busy=false;status='';controller=null;}
 }
 async function preview(){if(!result||!ui.project)return;stop();stopPreview();previewing=true;try{engine.setPlaybackMode('pattern');engine.setProject(previewProject(ui.project,track,result.notes,startBar,count,!!result.contextual));await engine.play();if(!previewing)return;timer=setTimeout(stopPreview,seconds*1000+250);}catch(e){stopPreview();error=e instanceof Error?e.message:String(e);}}
 async function original(){if(!result)return;stopPreview();await engine.previewSource(result.pcm,result.sampleRate);}
 function keep(){if(!result||!stamp||!canKeepTake(stamp,stampNow())){error='The track or tempo changed. Generate a fresh take.';return;}
  stopPreview();const sound=!track.sampleId&&track.soundType!=='preset'?{soundType:'preset' as const,presetId:'mini-piano'}:{};
  onkeep({...track,...sound,notes:replaceBars(track.notes,result.notes,startBar,count)});notify(`${result.notes.length} notes kept`);close();
 }
</script>
<Sheet title="Generate bars" sub={`${track.name} · ${ui.project?.bpm??120} BPM · ${ui.project?.key??'C'} ${ui.project?.scale??'major'}`} tall onclose={close}>
 <div class="note">Generate a piano melody, then play its notes with this track’s sound. Notes snap to 1/16. Keep replaces only the selected bars; Undo restores them.</div>
 {#if !result}
 <label class="follow"><input type="checkbox" aria-label="Follow song" checked={followSong} disabled={busy} onchange={e=>toggleFollow(e.currentTarget.checked)}/>Follow song</label>
 {#if followSong}
  <p class="note">Cloud hears a piano version of the first part, generates the gap, then hears the same first part again to guide the loop. Only the new bars are kept. Transcription stays on this device.</p>
  <div class="st">Pitched context tracks</div>
  {#each contextTracks as t (t.id)}<label class="context-track"><input type="checkbox" aria-label="Use {t.name} as context" disabled={busy||t.muted} checked={contextIds.includes(t.id)} onchange={e=>toggleContext(t.id,e.currentTarget.checked)}/>{t.name}{t.muted?' · muted':''}</label>{/each}
  <p class="note">Leave drums unchecked. This track’s existing phrase is also used as a seed when present.</p>
 {/if}
 <div class="range">
  <label>Start bar<input class="field" aria-label="Start bar" type="number" min="1" max={bars} step="1" bind:value={startBar} disabled={busy}/></label>
  <label>Bars<input class="field" aria-label="Number of bars" type="number" min="1" max={Math.min(followSong?2:4,bars)} step="1" bind:value={count} disabled={busy}/></label>
 </div>
 <div class="note">{Number.isFinite(seconds)?seconds.toFixed(2):'—'} seconds · up to {followSong?2:4} bars, within 12 seconds</div>
 <label class="st" for="melody-style">Melody style</label>
 <textarea id="melody-style" class="field" rows="2" bind:value={style} disabled={busy}></textarea>
 <label class="st" for="melody-source">Generate with</label>
 <select id="melody-source" class="field" bind:value={source} disabled={busy||followSong}><option value="device">On device</option><option value="cloud">Cloud · 8 credits per take</option></select>
 {#if followSong}<p class="note">Follow song uses Cloud · {contextSetup.plan?.seconds.toFixed(1)??'—'} seconds of context audio sent to Stability AI.</p>{/if}
 {#if source==='device'}
  {#if choices.length}<select class="field" aria-label="Melody model" bind:value={model} disabled={busy}>{#each choices as c}<option value={c.id}>{c.label}</option>{/each}</select>{:else}<p class="note">Download Small Music or Medium on Models, or choose Cloud with a saved key.</p><button class="btn" disabled={busy} onclick={()=>void install('small-music')}>Download Small Music</button>{/if}
 {:else if !ui.hasKey}<p class="note">Save your Stability AI key on Models first.</p>{/if}
 <div class="note">{pack}</div>
 {#if !installed&&available}<button class="btn" disabled={busy} onclick={()=>void install()}>Download piano transcriber</button>{/if}
 {#if followSong&&contextSetup.reason}<p class="note bad" role="status">{contextSetup.reason}</p>{/if}
 {#if !valid}<p class="note bad">Choose a range inside this track, up to {followSong?2:4} bars and 12 seconds.</p>{/if}
 <div class="btnrow"><button class="btn pri" disabled={busy||!valid||(followSong&&!contextSetup.plan)||!installed||(source==='device'&&!choices.length)||(source==='cloud'&&!ui.hasKey)} onclick={()=>void run()}>Generate take</button>{#if busy}<button class="btn danger" onclick={()=>controller?.abort()}>Cancel</button>{/if}</div>
 {:else}
 <div class="card"><b>{result.notes.length} notes · bars {startBar}–{startBar+count-1}</b><p class="note">{result.contextual?'Preview with the song before keeping.':'Preview the notes before keeping this take.'} The original piano audio is available for comparison.</p></div>
 {#if result.contextual}<p class="note">Follow song · Only the generated bars are transcribed.</p>{/if}
 <div class="btnrow"><button class="btn" onclick={()=>void preview()}>{result.contextual?'Preview with song':'Preview notes'}</button><button class="btn" onclick={()=>void original()}>Original audio</button><button class="btn" onclick={stopPreview}>Stop preview</button></div>
 {#if stale}<p class="note bad">The track or tempo changed. Discard this take and generate again.</p>{/if}
 <div class="btnrow"><button class="btn pri" disabled={!!stale} onclick={keep}>Keep take</button><button class="btn" onclick={()=>{stopPreview();result=null;error='';}}>Discard take</button></div>
 {/if}
 {#if status}<p class="note" role="status">{status}</p>{/if}
 {#if error}<p class="note bad" role="alert">{error}</p>{/if}
</Sheet>
<style>.range{display:flex;gap:12px;margin-top:12px}.range label{flex:1;min-width:0}.field{margin-top:6px;width:100%;box-sizing:border-box}textarea{resize:vertical;min-height:76px;height:auto;padding:10px 14px;color:var(--text);font:inherit}.follow,.context-track{display:flex;align-items:center;gap:10px;margin-top:12px;overflow-wrap:anywhere}.follow input,.context-track input{width:20px;height:20px;flex-shrink:0}.bad{color:var(--red)}</style>
