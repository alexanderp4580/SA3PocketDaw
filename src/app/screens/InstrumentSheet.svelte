<script lang="ts">
  import { onMount } from 'svelte';
  import Sheet from '../Sheet.svelte';
  import { ui,notify } from '../appState.svelte';
  import { engine,projectStore } from '../services';
  import { resolveControls,type InstrumentControls } from '../../audio/instrument/controls';
  import InstrumentControlsPanel from '../InstrumentControlsPanel.svelte';
  import { log } from '../../log';
  const scope=log.scope('instrument.controls');
  let {trackId,onclose,ongenerate}:{trackId:string;onclose:()=>void;ongenerate:()=>void}=$props();
  let sourceBehavior=$state<'sustain'|'decay'>('sustain');
  let ready=$state(false);
  const track=$derived(ui.project?.tracks.find(t=>t.id===trackId));
  const controls=$derived(resolveControls(track?.instrumentControls,sourceBehavior));
  onMount(()=>{let active=true;const id=track?.sampleId;if(id)void projectStore.getSample(id).then(sample=>{if(!active)return;if(sample?.instrument){sourceBehavior=sample.instrument.dynamics;ready=true;}else notify('This sound is a sample.');}).catch(e=>notify(String(e)));return ()=>{active=false;};});
  function update(patch:Partial<InstrumentControls>){
    projectStore.update(p=>({...p,tracks:p.tracks.map(t=>t.id===trackId?{...t,instrumentControls:resolveControls({...controls,...patch},sourceBehavior)}:t)}));
  }
  function reset(){update(resolveControls(undefined,sourceBehavior));scope.info('reset',{trackId});}
  async function preview(){try{await engine.audition(trackId,57,96,Math.max(1.2,controls.attack+1));}catch(e){notify(e instanceof Error?e.message:String(e));}}
</script>
<Sheet title="Tweak instrument" sub={track?.name??''} {onclose}>
  <div class="note">Adjust the playable instrument. Changes are saved automatically. Generate sound has separate selections for creating a new SA3 source.</div>
  {#if ready&&track}
    <InstrumentControlsPanel {controls} onchange={update} />
    <div class="btnrow"><button class="btn pri" onclick={preview}>▶ Play A3</button><button class="btn" onclick={reset}>Reset controls</button></div>
    <div class="btnrow"><button class="btn" onclick={onclose}>Done</button></div>
    <hr style="border:0;border-top:1px solid var(--line);margin:20px 0" /><div class="st">Replace source sound</div><div class="note">Create a new SA3 sound. Your current sound stays until you choose Use.</div><div class="btnrow"><button class="btn sa3" onclick={ongenerate}>✦ Generate new sound</button></div>
  {:else}<div class="note" style="margin-top:14px">Loading instrument…</div>{/if}
</Sheet>
