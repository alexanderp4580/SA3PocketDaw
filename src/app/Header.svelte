<script lang="ts">
  import { ui, updateProject } from './appState.svelte';
  import { BPM_MAX, BPM_MIN, renameProject, timelineBars, loopRange, setBpm, setKey } from '../store/projectModel';
  import { NOTE_ROOTS, formatPosition, parseBpm } from './format';
  import Meter from './Meter.svelte';
  import Sheet from './Sheet.svelte';
  import {hapticsEnabled,setHapticsEnabled} from './haptics';
  let haptic=$state(hapticsEnabled());

  const project = $derived(ui.project);
  let open = $state(false);
  let editingBpm = $state(false);
  let bpmText = $state('');

  function startBpm() {
    bpmText = String(project?.bpm ?? 120);
    editingBpm = true;
  }
  function commitBpm() {
    editingBpm = false;
    const v = parseBpm(bpmText);
    if (v !== null) updateProject((p) => setBpm(p, v));
  }
  const range=$derived(project?loopRange(project):{startBar:1,endBar:1});
</script>

{#if project}
  <div class="info">
    <div class="row">
      <input
        class="title nameinput"
        aria-label="Project name"
        value={project.name}
        onchange={(e) => updateProject((p) => renameProject(p, e.currentTarget.value.trim() || 'Untitled'))}
      />
    </div>
    <div class="readouts">
      <div class="ro"><span class="k">Position</span><span class="v">{formatPosition(ui.step)}</span></div>
      <button class="ro" aria-label="Tempo, open project settings" onclick={() => (open = true)}><span class="k">Tempo</span><span class="v">{project.bpm} <small>BPM</small></span></button>
      <button class="ro" aria-label="Key, open project settings" onclick={() => (open = true)}><span class="k">Key</span><span class="v">{project.key} <small>{project.scale === 'minor' ? 'min' : 'maj'}</small></span></button>
      <button class="ro" aria-label="Repeat range" onclick={()=>ui.loopOpen=true}><span class="k">Repeat</span><span class="v">{range.startBar}–{range.endBar}</span></button>
    </div>
    <div style="padding:4px 0"><Meter/></div>
    <div class="meta"><span>{timelineBars(project)} bar timeline</span><span>{ui.playing ? 'Playing' : 'Stopped'}</span></div>
  </div>

  {#if open}
    <Sheet title="Project" onclose={() => (open = false)}>
      <div class="st">Tempo</div>
      <div class="bigbpm">
        <button class="btn fit" aria-label="Tempo down" disabled={project.bpm <= BPM_MIN} onclick={() => updateProject((p) => setBpm(p, p.bpm - 1))}>−</button>
        {#if editingBpm}
          <!-- svelte-ignore a11y_autofocus -->
          <input
            class="field bpminput"
            type="number"
            inputmode="numeric"
            aria-label="Tempo in BPM"
            autofocus
            bind:value={bpmText}
            onblur={commitBpm}
            onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
        {:else}
          <button class="bigval" aria-label="Type tempo" onclick={startBpm}>{project.bpm}</button>
        {/if}
        <button class="btn fit" aria-label="Tempo up" disabled={project.bpm >= BPM_MAX} onclick={() => updateProject((p) => setBpm(p, p.bpm + 1))}>+</button>
      </div>
      <div class="note">Tap the number to type a tempo ({BPM_MIN}–{BPM_MAX}).</div>
      <div class="st">Key (label only)</div>
      <div class="keys12">
        {#each NOTE_ROOTS as n (n)}
          <button class="sg" class:on={project.key === n} onclick={() => updateProject((p) => setKey(p, n))}>{n}</button>
        {/each}
      </div>
      <div class="seg" style="margin-top:6px">
        <button class="sg" class:on={project.scale !== 'minor'} onclick={() => updateProject((p) => setKey(p, p.key, 'major'))}>Major</button>
        <button class="sg" class:on={project.scale === 'minor'} onclick={() => updateProject((p) => setKey(p, p.key, 'minor'))}>Minor</button>
      </div>
      <div class="st">Press feedback</div><div class="seg"><button class="sg" class:on={!haptic} onclick={()=>{haptic=false;setHapticsEnabled(false);}}>Off</button><button class="sg" class:on={haptic} onclick={()=>{haptic=true;setHapticsEnabled(true);}}>Light</button></div>
      <div class="btnrow"><button class="btn pri" onclick={() => (open = false)}>Done</button></div>
    </Sheet>
  {/if}
{/if}

<style>
  .nameinput { background: transparent; border: 1px solid transparent; border-radius: 8px; height: 44px; padding: 0 6px; width: 100%; }
  .nameinput:focus { border-color: var(--line); background: var(--bg); }
  .bigbpm { display: flex; align-items: center; gap: 10px; justify-content: center; margin: 6px 0; }
  .bigval { font-size: 44px; font-weight: 700; min-width: 120px; text-align: center; font-variant-numeric: tabular-nums; }
  .bigbpm .btn { width: 56px; font-size: 22px; }
  .bpminput { width: 120px; text-align: center; font-size: 28px; }
  .keys12 { display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; }
  .keys12 .sg { height: 44px; }
</style>
