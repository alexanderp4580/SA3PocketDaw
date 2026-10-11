<script lang="ts">
  import { onMount } from 'svelte';
  import Sheet from '../Sheet.svelte';
  import { ui,notify } from '../appState.svelte';
  import { engine,projectStore } from '../services';
  import { resolveControls,type InstrumentControls } from '../../audio/instrument/controls';
  import {resolveSampleControls,samplePreviewDuration,type SampleControls} from '../../audio/sampleControls';
  import SampleControlsPanel from '../SampleControlsPanel.svelte';
  import InstrumentControlsPanel from '../InstrumentControlsPanel.svelte';
  import {fullTrim,resolveTrim,type Trim} from '../../audio/trim';
  import {applyTrackTrim} from '../trimSound';
  import {createLatestRunner} from '../latestRunner';
  import type {ChopView} from '../TrimControl.svelte';
  import { log } from '../../log';
  const scope=log.scope('instrument.controls');
  let {trackId,onclose,ongenerate,onmodels}:{trackId:string;onclose:()=>void;ongenerate:()=>void;onmodels:()=>void}=$props();
  let sourceBehavior=$state<'sustain'|'decay'>('sustain');
  let sampleDuration=$state(1);
  let ready=$state(false),hasInstrument=$state(false),loadError=$state('');
  const canGenerate=$derived(ui.modelCards.some(c=>c.available&&c.status==='installed'));
  const track=$derived(ui.project?.tracks.find(t=>t.id===trackId));
  const controls=$derived(resolveControls(track?.instrumentControls,sourceBehavior));
  const sampleControls=$derived(resolveSampleControls(track?.sampleControls));
  let live=$state<Trim|null>(null),chopBusy=$state(false),chopError=$state('');
  const trim=$derived(live??resolveTrim(track?.trim,sampleDuration));
  const chop=$derived<ChopView>({duration:sampleDuration,peaks:track?.sampleId?ui.peaks[track.sampleId]:undefined,trim,busy:chopBusy,error:chopError});
  const commitChop=createLatestRunner<Trim>(t=>applyTrackTrim({store:projectStore,engine},trackId,t),{onBusy:b=>chopBusy=b,onError:e=>{chopError=e.message;live=null;scope.error('chop failed',{trackId,error:e.message});}});
  function chopInput(t:Trim){live=t;chopError='';}
  function chopCommit(t:Trim){chopError='';commitChop(t);}
  function chopReset(){const t=fullTrim(sampleDuration);live=t;chopCommit(t);}
  onMount(()=>{let active=true;const id=track?.sampleId;
    if(id)void projectStore.getSample(id).then(sample=>{if(!active)return;if(!sample){loadError='Saved sound is unavailable.';return;}sampleDuration=sample.pcm.length/sample.sampleRate;hasInstrument=!!sample.instrument;if(sample.instrument)sourceBehavior=sample.instrument.dynamics;ready=true;}).catch(e=>{if(active)loadError=String(e);});
    else loadError='This track has no sound.';
    return ()=>{active=false;};
  });
  function update(patch:Partial<InstrumentControls>){
    projectStore.update(p=>({...p,tracks:p.tracks.map(t=>t.id===trackId?{...t,instrumentControls:resolveControls({...controls,...patch},sourceBehavior)}:t)}));
  }
  function updateSample(patch:Partial<SampleControls>){projectStore.update(p=>({...p,tracks:p.tracks.map(t=>t.id===trackId?{...t,sampleControls:resolveSampleControls({...sampleControls,...patch})}:t)}));}
  function resetSample(){updateSample(resolveSampleControls());scope.info('reset sample controls',{trackId});}
  function reset(){update(resolveControls(undefined,sourceBehavior));scope.info('reset',{trackId});}
  async function preview(){try{await engine.audition(trackId,hasInstrument?57:track?.rootMidi??60,96,hasInstrument?Math.max(1.2,controls.attack+1):samplePreviewDuration(trim.end-trim.start,sampleControls));}catch(e){notify(e instanceof Error?e.message:String(e));}}
</script>
<Sheet title="Edit sound" sub={track?.name??''} {onclose}>
  {#if ready&&track}
    {#if hasInstrument}
      <div class="note">Tweak your instrument. Changes are saved automatically.</div>
      <InstrumentControlsPanel {controls} onchange={update} {chop} onchop={chopInput} onchopcommit={chopCommit} onchopreset={chopReset} />
      <div class="btnrow"><button class="btn pri" onclick={preview}>▶ Play A3</button><button class="btn" onclick={reset}>Reset controls</button></div>
    {:else}
      <div class="note">Tweak your sample. Changes are saved automatically. Press Preview to hear your settings.</div>
      <SampleControlsPanel controls={sampleControls} onchange={updateSample} {chop} onchop={chopInput} onchopcommit={chopCommit} onchopreset={chopReset} />
      <div class="btnrow"><button class="btn pri" onclick={preview}>▶ Preview sound</button><button class="btn" onclick={resetSample}>Reset controls</button></div>
    {/if}
    <div class="btnrow"><button class="btn" onclick={onclose}>Done</button></div>
    <hr style="border:0;border-top:1px solid var(--line);margin:20px 0" />
    {#if canGenerate}
      <div class="note">Regenerate the source sound. Your current sound stays until you choose Use.</div>
      <div class="btnrow"><button class="btn sa3" aria-label="Regenerate sound" onclick={ongenerate}>✦ Regenerate</button></div>
    {:else}
      <div class="btnrow"><button class="btn sa3" aria-label="Open models" onclick={onmodels}>Download models</button></div>
    {/if}
  {:else if loadError}<div class="note bad" role="alert">{loadError}</div>
  {:else}<div class="note" style="margin-top:14px">Loading sound…</div>{/if}
</Sheet>
