<script lang="ts">
  import { onMount } from 'svelte';
  import Nav, { type Route } from './components/Nav.svelte';
  import CompatGate from './app/screens/CompatGate.svelte';
  import MixScreen from './app/screens/MixScreen.svelte';
  import TracksScreen from './app/screens/TracksScreen.svelte';
  import PianoRoll from './app/screens/PianoRoll.svelte';
  import InstrumentSheet from './app/screens/InstrumentSheet.svelte';
  import GenerateSheet from './app/screens/GenerateSheet.svelte';
  import ModelsScreen from './app/screens/ModelsScreen.svelte';
  import DebugScreen from './app/screens/DebugScreen.svelte';
  import LoopSheet from './app/LoopSheet.svelte';
  import Header from './app/Header.svelte';
  import TransportBar from './app/TransportBar.svelte';
  import { ui, initApp, runCompatCheck, updateProject } from './app/appState.svelte';
  import { engine } from './app/services';
  import { audioUnlockOnce } from './app/unlock';
  import { NOTE_ROOTS } from './app/format';
  import {trackBars,setTrackBars,toggleSolo,type Track} from './store/projectModel';

  let entered = $state(false);
  let route: Route = $state('tracks');
  let mixId=$state<string|null>(null);
  let rollId = $state<string | null>(null);
  let tweakId=$state<string|null>(null);
  let newTrackOpen=$state(false);
  let generateId = $state<string | null>(null);

  const rollTrack = $derived(ui.project?.tracks.find((t) => t.id === rollId) ?? null);
  const showHeader = $derived(route === 'tracks' && !rollTrack);
  const showTransport = $derived((route === 'tracks'||route === 'mix')&&!rollTrack);

  onMount(() => {
    const params = new URLSearchParams(location.search);
    ui.skipCompat = params.get('skipcompat') === '1';
    audioUnlockOnce(() => engine.unlock());
    void initApp();
    if (ui.skipCompat) {
      ui.compatRunning = false;
      entered = true;
    } else void runCompatCheck();
  });

  /** Optional PianoRoll props (sample name, generate shortcut, key root as pitch class, scale). */
  function rollExtras(t: Track): Record<string, unknown> {
    const p = ui.project;
    return {
      ...(t.sampleId ? { sampleName: 'Generated' } : {}),
      onOpenGenerate: () => (generateId = t.id),
      ...(t.soundType==='instrument'?{onOpenInstrument:()=>tweakId=t.id}:{}),
      keyRoot: Math.max(0, NOTE_ROOTS.indexOf((p?.key ?? 'C') as (typeof NOTE_ROOTS)[number])),
      scale: p?.scale ?? 'major',
    };
  }
  function onTrackChange(t: Track) {
    const next=$state.snapshot(t);
    updateProject((p) => ({ ...p, tracks: p.tracks.map((x) => (x.id === next.id ? next : x)) }));
  }
  function navigate(r: Route) {
    route = r;
    if (r !== 'tracks') rollId = null;
  }
  function openDebugFromGate() {
    entered = true;
    route = 'debug';
  }
</script>

{#if !entered}
  <div class="app-shell">
    <CompatGate oncontinue={() => (entered = true)} ondebug={openDebugFromGate} />
  </div>
{:else}
  <div class="app-shell">
    {#if ui.skipCompat}
      <div class="skip" role="alert">Compatibility check skipped (skipcompat=1). Generation may fail on this browser.</div>
    {/if}
    {#if showHeader}<Header />{/if}
    <main class="main-content">
      {#if !ui.ready || !ui.project}
        {#if route === 'tracks'}<p class="note" style="padding:12px">Loading project</p>{/if}
      {/if}
      {#if route === 'tracks' && ui.project}
        {#if rollTrack}
          <PianoRoll
            track={rollTrack}
            bars={trackBars(rollTrack,ui.project.bars)}
            onTrackBars={n=>updateProject(p=>setTrackBars(p,rollTrack.id,n))}
            onSolo={()=>updateProject(p=>toggleSolo(p,rollTrack.id))}
            playhead={() => engine.playhead()}
            onChange={onTrackChange}
            onAudition={(midi) => void engine.audition(rollTrack.id, midi)}
            onBack={() => (rollId = null)}
            {...rollExtras(rollTrack)}
          />
        {:else}
          <TracksScreen onmix={id=>{mixId=id;route='mix';}} onadd={()=>newTrackOpen=true} onroll={(id) => (rollId = id)} ongenerate={(id) => (generateId = id)} ontweak={id=>tweakId=id} />
        {/if}
      {:else if route === 'mix'}
        <MixScreen focusId={mixId}/>
      {:else if route === 'models'}
        <ModelsScreen />
      {:else if route === 'debug'}
        <DebugScreen />
      {/if}
    </main>
    {#if showTransport}<TransportBar />{/if}
    <Nav {route} onnavigate={navigate} />
  </div>
  {#if ui.loopOpen}<LoopSheet />{/if}
  {#if tweakId}<InstrumentSheet trackId={tweakId} onclose={()=>tweakId=null} ongenerate={()=>{generateId=tweakId;tweakId=null;}} />{/if}
  {#if newTrackOpen}<GenerateSheet trackId={null} onclose={()=>newTrackOpen=false} onuse={id=>rollId=id} />{/if}
  {#if generateId}
    <GenerateSheet trackId={generateId} onclose={() => (generateId = null)} />
  {/if}
{/if}
{#if ui.toast}<div class="toast" role="status">{ui.toast}</div>{/if}

<style>
  .app-shell {
    display: flex;
    flex-direction: column;
    height: 100dvh;
    max-width: 480px;
    margin: 0 auto;
    background: var(--bg);
  }
  .main-content {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .main-content > :global(*) { flex: 1; min-height: 0; }
  .skip {
    background: rgba(240, 168, 0, 0.18);
    color: var(--warn);
    font-size: 0.75rem;
    padding: 0.25rem 0.75rem;
  }
</style>
