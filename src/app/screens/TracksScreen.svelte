<script lang="ts">
  import { ui, updateProject, stop } from '../appState.svelte';
  import { removeTrack, renameTrack, toggleMute, toggleSolo, trackBars, timelineBars, loopRange } from '../../store/projectModel';
  import { midiToName } from '../../audio/pitch';
  import { resolveSelected } from '../trackSelection';
  import PatternPreview from '../PatternPreview.svelte';
  import Sheet from '../Sheet.svelte';

  let { onroll, ongenerate, ontweak, onadd, onmix, onmodels }: { onroll: (id: string) => void; ongenerate: (id: string) => void; ontweak:(id:string)=>void;onadd:()=>void;onmix:(id:string)=>void;onmodels:()=>void } = $props();

  const canGenerate=$derived(ui.modelCards.some(c=>c.available&&c.status==='installed'));
  const COLORS = ['#ff8a3d', '#4fb3ff', '#b685ff', '#3ddc84', '#ff6fa8', '#ffd23d', '#9aa3b5'];
  let selected = $state<string | null>(null);
  let menuId = $state<string | null>(null);
  let renameText = $state('');
  let confirmDelete = $state(false);

  const project = $derived(ui.project);
  const sel = $derived(project?.tracks.find((t) => t.id === resolveSelected(project.tracks, selected)) ?? null);
  const menuTrack = $derived(project?.tracks.find((t) => t.id === menuId) ?? null);
  const bars = $derived(project?timelineBars(project):1);
  const range=$derived(project?loopRange(project):{startBar:1,endBar:1});
  const playLeft = $derived(`calc(116px + (100% - 116px) * ${Math.min(1, ui.step / (bars * 16))})`);

  function openMenu(id: string, name: string) {
    menuId = id;
    renameText = name;
    confirmDelete = false;
  }
  function saveRename() {
    if (menuId) updateProject((p) => renameTrack(p, menuId!, renameText.trim() || 'Track'));
    menuId = null;
  }
  function del() {
    if (menuId) updateProject((p) => removeTrack(p, menuId!));
    menuId = null;
    if (!ui.project?.tracks.length) stop();
  }
</script>

<div class="content tracksc" style="--n:{bars}">
  <div class="ruler">
    <div class="corner">
<span class="note">Tracks · {bars} bars</span>
    </div>
    <div class="nums">
      {#each Array.from({ length: bars }, (_, i) => i + 1) as n (n)}<span>{n}</span>{/each}
      <button class="loopreg" aria-label="Edit shared repeat range" style:left="{(range.startBar-1)/bars*100}%" style:width="{(range.endBar-range.startBar+1)/bars*100}%" onclick={()=>ui.loopOpen=true}></button>
    </div>
  </div>
  <div class="scroll tracks">
    {#each project?.tracks ?? [] as t, i (t.id)}
      <div class="track" class:sel={sel?.id === t.id} style="--c:{COLORS[i % COLORS.length]}">
        <div class="thead">
          <button class="tname" onclick={() => (selected = t.id)}>{t.name} <em>{t.sampleId ? t.soundType==='instrument'?'Instrument':`Sample · ${midiToName(t.rootMidi)}` : 'no sound'}</em></button>
          <div class="tbtns">
            <button class="tb" class:on-m={t.muted} aria-pressed={t.muted} aria-label={t.muted ? `Unmute ${t.name}` : `Mute ${t.name}`} onclick={() => updateProject((p) => toggleMute(p, t.id))}>M</button>
            <button class="tb" class:on-s={t.solo} aria-pressed={!!t.solo} aria-label="Solo {t.name}" onclick={()=>updateProject(p=>toggleSolo(p,t.id))}>S</button>
            <button class="tb" aria-label="Track menu for {t.name}" onclick={() => openMenu(t.id, t.name)}>⋮</button>
          </div>
        </div>
        <div class="track-body"><div class="level"><button class="mix-link" aria-label="Mix {t.name}" onclick={()=>onmix(t.id)}>Mix</button></div>
        <button class="lane" aria-label="Open piano roll for {t.name}" onclick={() => {selected=t.id;onroll(t.id);}}>
          <span class="clip" class:muted={t.muted}>
            <span class="lbl">{trackBars(t,project?.bars)} bars · {t.notes.length} {t.notes.length === 1 ? 'note' : 'notes'}</span>
            <span class="wv"><PatternPreview track={t} timeline={bars} legacyBars={project?.bars??2} color={COLORS[i % COLORS.length]!} /></span>
          </span>
        </button></div>
      </div>
    {/each}
    {#if !project?.tracks.length&&canGenerate}<div class="empty"><b>Create your first sound</b><p class="note">Choose a sample or instrument, then add notes in its piano roll.</p></div>{/if}
    {#if !ui.modelsReady}<p class="note" style="padding:12px">Checking downloaded models…</p>{:else if canGenerate}<button class="addtrack" aria-label="Generate new sound" onclick={onadd}>✦ Generate</button>{:else}<button class="addtrack" aria-label="Open models" onclick={onmodels}>Download models</button>{/if}
    {#if ui.playing}<div class="playhead" style="left:{playLeft}"></div>{/if}
  </div>
  {#if sel}
    <div class="selbar">
      <button class="sb" onclick={() => onroll(sel.id)}><b>♪</b>Open roll</button>
      {#if sel.sampleId}<button class="sb hi" aria-label="Edit {sel.name} sound" onclick={()=>ontweak(sel.id)}><b>⚙</b>Edit</button>{:else if canGenerate}<button class="sb hi" onclick={() => ongenerate(sel.id)}><b>✦</b>Generate</button>{/if}
      <button class="sb" onclick={() => openMenu(sel.id, sel.name)}><b>✎</b>Rename</button>
      <button class="sb" onclick={() => { openMenu(sel.id, sel.name); confirmDelete = true; }}><b>⌫</b>Delete</button>
    </div>
  {/if}
</div>

{#if menuTrack}
  <Sheet title={menuTrack.name} sub={menuTrack.sampleId ? `${menuTrack.soundType==='instrument'?'Instrument':`Sample · Root ${midiToName(menuTrack.rootMidi)}`} · ${menuTrack.notes.length} notes` : 'No sound yet'} onclose={() => (menuId = null)}>
    {#if confirmDelete}
      <div class="note">Delete "{menuTrack.name}" with its notes and sound?</div>
      <div class="btnrow">
        <button class="btn" onclick={() => (confirmDelete = false)}>Cancel</button>
        <button class="btn danger" onclick={del}>Delete</button>
      </div>
    {:else}
      <div class="st">Name</div>
      <input class="field" aria-label="Track name" bind:value={renameText} onkeydown={(e) => e.key === 'Enter' && saveRename()} />
      <div class="btnrow">
        <button class="btn danger" onclick={() => (confirmDelete = true)}>Delete</button>
        <button class="btn pri" onclick={saveRename}>Save</button>
      </div>
    {/if}
  </Sheet>
{/if}

<style>
  .empty{padding:28px 18px 12px;text-align:center;}.empty b{font-size:18px;}.empty p{margin-top:10px;}
  .tracksc { --bar: calc(100% / var(--n)); }
  .ruler { display: flex; flex: none; height: 48px; border-bottom: 1px solid var(--line); background: #15171c; }
  .corner { width: 116px; flex: none; display: flex; gap: 4px; align-items: center; padding-left: 8px; }
  .nums { flex: 1; position: relative; display: flex; font-size: 12px; color: var(--dim); overflow: hidden; }
  .nums span { flex: 1; padding: 6px 0 0 4px; border-left: 1px solid #2a2f39; height: 36px; }
  .loopreg { position: absolute; top: 26px; left: 0; right: 0; height: 16px; background: color-mix(in srgb, #ffb13d 35%, transparent); border: 2px solid #ffb13d; border-radius: 4px; }
  .tb { width: 30px; height: 40px; border-radius: 6px; background: var(--panel2); display: grid; place-items: center; font-size: 12px; font-weight: 700; color: var(--dim); position: relative; }
  .tb.on-s {background:var(--sa3bg);color:var(--sa3);}
  .tb.on-m { background: #5a4a1a; color: var(--yellow); }
  .tracks { position: relative; }
  .track { display: flex; height: 88px; border-bottom: 1px solid var(--line); }
  .track.sel .thead { background: #20242c; }
  .thead { width: 116px; flex: none; background: var(--panel); padding: 6px 6px 6px 10px; position: relative; display: flex; flex-direction: column; justify-content: space-between; z-index: 2; }
  .thead::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--c); }
  .tname { font-size: 13px; font-weight: 600; text-align: left; line-height: 1.2; min-height: 26px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tname em { display:block; margin-top:3px; overflow:hidden; text-overflow:ellipsis; font-style: normal; color: var(--dim); font-size: 12px; font-weight: 500; }
  .tbtns { display: flex; gap: 4px; align-items: center; }
  .track-body{flex:1;min-width:0;display:flex;flex-direction:column}.level{height:20px;display:flex;align-items:center;justify-content:flex-end;padding:0 5px}.mix-link{font-size:10px;color:var(--sa3);min-width:36px;height:20px}.lane { flex: 1; position: relative; overflow: hidden; background: repeating-linear-gradient(90deg, transparent 0 calc(var(--bar) - 1px), #1c1f26 calc(var(--bar) - 1px) var(--bar)); }
  .clip, .lbl, .wv { display: block; }
  .clip { position: absolute; top: 5px; bottom: 5px; left: 1px; right: 1px; border-radius: 6px; background: color-mix(in srgb, var(--c) 22%, #0d0e11); border: 1px solid var(--c); overflow: hidden; }
  .clip.muted { opacity: 0.45; }
  .lbl { position: absolute; top: 2px; left: 5px; font-size: 10px; color: #fff; z-index: 1; text-shadow: 0 0 3px #000; }
  .wv { position: absolute; left: 0; right: 0; top: 14px; bottom: 2px; }
  .track.sel .clip { outline: 2px solid #fff; outline-offset: 1px; }
  .addtrack { margin: 10px 12px; width: calc(100% - 24px); height: 48px; border: 1px dashed #3a404c; border-radius: 12px; display: grid; place-items: center; color: var(--dim); font-weight: 600; }
  .playhead { position: absolute; top: 0; bottom: 0; width: 2px; background: #fff; z-index: 3; pointer-events: none; }
  .selbar { flex: none; display: flex; gap: 6px; padding: 8px 12px; background: #1d2027; border-top: 1px solid var(--line); }
  .sb { flex: 1; height: 48px; border-radius: 10px; background: var(--panel2); display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 11px; gap: 1px; }
  .sb b { font-size: 15px; font-weight: 400; }
  .sb.hi { background: var(--sa3bg); color: var(--sa3); }
</style>
