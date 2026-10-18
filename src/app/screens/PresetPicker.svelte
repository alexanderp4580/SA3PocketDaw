<script lang="ts">
  import Sheet from '../Sheet.svelte';
  import { ui, updateProject, notify } from '../appState.svelte';
  import { engine } from '../services';
  import { formatBytes } from '../format';
  import { applyPreset, type PresetCard } from '../presets';
  import { newId } from '../../store/projectModel';
  import { cancelPresetDownload, dismissPresetDownloadError, downloadPreset, presetDownload, presetDownloadPercent } from '../presetDownload.svelte';

  let { trackId, onclose, onuse }: { trackId: string | null; onclose: () => void; onuse?: (id: string, created: boolean) => void } = $props();

  const track = $derived(trackId ? ui.project?.tracks.find((t) => t.id === trackId) : undefined);
  const current = $derived(track?.soundType === 'preset' ? track.presetId : undefined);
  let previewing = $state<string | null>(null);

  async function preview(c: PresetCard) {
    previewing = c.id;
    const ok = await engine.previewPreset(c.id).catch(() => false);
    previewing = null;
    if (!ok) notify('This instrument is not installed');
  }

  function use(c: PresetCard) {
    const id = trackId ?? newId('t');
    engine.stopPreview();
    updateProject((p) => applyPreset(p, trackId, c, () => id).project);
    onuse?.(id, trackId === null);
    onclose();
  }

  function close() {
    engine.stopPreview();
    onclose();
  }
</script>

<Sheet title="♪ Instruments" sub={track ? `For ${track.name}` : 'New track · created when you choose Use'} tall onclose={close}>
  <div class="note">Sampled instruments play without generating. Downloaded instruments work offline.</div>
  <div class="list">
    {#each ui.presetCards as c (c.id)}
      {@const busy = presetDownload.id === c.id}
      <div class="card" class:cur={current === c.id}>
        <div class="row">
          <b>{c.name}</b>
          {#if current === c.id}<span class="tag sa3">in use</span>{/if}
          <span class="tag" class:ok={c.status === 'installed'} class:warn={c.status === 'partial'}>{c.builtin ? 'built in' : c.status === 'installed' ? 'installed' : c.status === 'partial' ? 'partial' : 'not installed'}</span>
        </div>
        {#if c.credits[0]}<div class="note">{c.credits[0]}</div>{/if}
        {#if !c.builtin && c.status !== 'installed'}<div class="note">{formatBytes(c.bytes)} download</div>{/if}
        {#if busy}
          {#if presetDownload.error}<div class="note bad" role="alert">{presetDownload.error}</div>{/if}
          {#if presetDownload.progress && !presetDownload.error}
            <div class="bar" role="progressbar" aria-valuenow={presetDownloadPercent()} aria-valuemin="0" aria-valuemax="100"><i style="width:{presetDownloadPercent()}%"></i></div>
            <div class="note">{presetDownloadPercent()}% · {formatBytes(presetDownload.progress.packBytes)} of {formatBytes(presetDownload.progress.packTotal)}</div>
          {:else if !presetDownload.error}<div class="note">Starting download</div>{/if}
          <div class="btnrow">
            {#if presetDownload.error}
              <button class="btn" onclick={dismissPresetDownloadError}>Dismiss</button>
              <button class="btn pri" onclick={() => void downloadPreset(c.id, c.name)}>Retry download</button>
            {:else}
              <button class="btn danger" onclick={cancelPresetDownload}>Cancel</button>
            {/if}
          </div>
        {:else if c.status === 'installed'}
          <div class="btnrow">
            <button class="btn" disabled={previewing !== null} onclick={() => void preview(c)}>{previewing === c.id ? 'Playing' : 'Preview'}</button>
            <button class="btn pri" disabled={current === c.id} onclick={() => use(c)}>{trackId ? 'Use on this track' : 'Use on new track'}</button>
          </div>
        {:else}
          <div class="btnrow"><button class="btn sa3" disabled={presetDownload.id !== null} onclick={() => void downloadPreset(c.id, c.name)}>{c.status === 'partial' ? 'Resume download' : 'Download'}</button></div>
        {/if}
      </div>
    {/each}
  </div>
</Sheet>

<style>
  .list { display: flex; flex-direction: column; gap: 10px; margin-top: 10px; }
  .card.cur { border-color: var(--sa3); }
  .note.bad { color: var(--red); }
</style>
