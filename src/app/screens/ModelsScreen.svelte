<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { ui, clearEverything, notify } from '../appState.svelte';
  import { generation, models } from '../services';
  import { MODEL_NOTES, formatBytes, modelCards, type ModelCard } from '../format';
  import type { DownloadProgress } from '../../store/modelManager';
  import Sheet from '../Sheet.svelte';

  let cards = $state<ModelCard[]>(modelCards(null, {}));
  let loadError = $state('');
  let storage = $state<{ quota?: number; usage?: number; persisted: boolean } | null>(null);
  let persistNote = $state('');
  let busy = $state<{ id: string; progress: DownloadProgress | null; error: string } | null>(null);
  let controller = $state<AbortController | null>(null);
  let confirm = $state<null | { kind: 'model'; card: ModelCard } | { kind: 'all' } | { kind: 'clear' }>(null);
  let freeing = $state(false);

  async function refresh() {
    try {
      if (!models.getManifest()) await models.loadManifest();
      cards = modelCards(models.getManifest(), await models.packStates());
      ui.modelCards = cards;
      ui.modelsReady = true;
      loadError = '';
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e);
    }
    storage = await models.storageInfo().catch(() => null);
  }
  let off: (() => void) | undefined;
  onMount(() => {
    void refresh();
    off = models.onChange(() => void refresh());
  });
  onDestroy(() => off?.());

  async function download(c: ModelCard) {
    controller = new AbortController();
    busy = { id: c.id, progress: null, error: '' };
    try {
      await models.download(c.id, { signal: controller.signal, onProgress: (p) => busy && (busy.progress = p) });
      notify(`${c.label} installed`);
      busy = null;
    } catch (e) {
      const aborted = e instanceof Error && e.name === 'AbortError';
      busy = aborted ? null : { id: c.id, progress: busy?.progress ?? null, error: e instanceof Error ? e.message : String(e) };
      if (aborted) notify('Download cancelled. Tap Download to resume.');
    } finally {
      controller = null;
      void refresh();
    }
  }

  async function runConfirm() {
    const c = confirm;
    confirm = null;
    if (!c) return;
    if (c.kind === 'model') await models.deletePack(c.card.id);
    else if (c.kind === 'all') await models.deleteAll();
    else await clearEverything();
    await refresh();
    notify('Done');
  }

  async function persist() {
    const r = await models.requestPersistence();
    persistNote = !r.supported ? 'This browser does not offer persistent storage.' : r.persisted ? 'Persistent storage granted.' : 'The browser did not grant persistent storage.';
    await refresh();
  }

  async function free() {
    freeing = true;
    await generation.unload();
    freeing = false;
    notify('Model memory freed');
  }

  const pct = (p: DownloadProgress | null) => (p && p.packTotal > 0 ? Math.round((p.packBytes / p.packTotal) * 100) : 0);
  const usagePct = $derived(storage?.quota ? Math.min(100, ((storage.usage ?? 0) / storage.quota) * 100) : 0);
  const anyInstalled = $derived(cards.some((c) => c.status !== 'missing'));
</script>

<div class="content">
  <div class="top"><h1>Models</h1></div>
  <div class="body">
    <div class="note">Nothing downloads until you tap Download. All models share one text encoder, which is removed with the last model that needs it.</div>
    {#if loadError}
      <div class="card bad" role="alert">
        <div class="note bad">Model list unavailable: {loadError}</div>
        <div class="btnrow"><button class="btn" onclick={() => void refresh()}>Retry</button></div>
      </div>
    {/if}

    <div class="sec">SA3 models</div>
    {#each cards as c (c.id)}
      <div class="card">
        <div class="row">
          <b>{c.label}</b>
          <span class="tag" class:ok={c.available && c.status === 'installed'} class:warn={c.available && c.status === 'partial'}>{!c.available ? 'not available' : c.status === 'installed' ? 'installed' : c.status === 'partial' ? 'partial' : 'not installed'}</span>
        </div>
        <div class="note">{MODEL_NOTES[c.id]}</div>
        {#if c.available}
          <div class="note">{formatBytes(c.bytes)} including the shared encoder · {c.presentFiles}/{c.totalFiles} files stored</div>
        {:else}
          <div class="note">No converted pack exists for this model yet.</div>
        {/if}

        {#if busy?.id === c.id}
          {#if busy.error}<div class="note bad" role="alert">{busy.error}</div>{/if}
          {#if controller && busy.progress}
            <div class="bar" role="progressbar" aria-valuenow={pct(busy.progress)} aria-valuemin="0" aria-valuemax="100"><i style="width:{pct(busy.progress)}%"></i></div>
            <div class="note">{pct(busy.progress)}% · {formatBytes(busy.progress.packBytes)} of {formatBytes(busy.progress.packTotal)}</div>
            <div class="bar thin"><i style="width:{busy.progress.fileTotal ? Math.round((busy.progress.fileBytes / busy.progress.fileTotal) * 100) : 0}%"></i></div>
            <div class="note">{busy.progress.file}: {formatBytes(busy.progress.fileBytes)} of {formatBytes(busy.progress.fileTotal)}</div>
          {:else if controller}
            <div class="note">Starting download</div>
          {/if}
          <div class="btnrow">
            {#if controller}
              <button class="btn danger" onclick={() => controller?.abort()}>Cancel</button>
            {:else}
              <button class="btn pri" onclick={() => void download(c)}>Retry download</button>
            {/if}
          </div>
        {:else if c.available}
          <div class="btnrow">
            {#if c.status !== 'installed'}
              <button class="btn pri" disabled={busy !== null} onclick={() => void download(c)}>{c.status === 'partial' ? 'Resume download' : 'Download'}</button>
            {/if}
            {#if c.status !== 'missing'}
              <button class="btn danger" disabled={busy !== null} onclick={() => (confirm = { kind: 'model', card: c })}>Delete</button>
            {/if}
          </div>
        {/if}
      </div>
    {/each}

    <div class="sec">Storage</div>
    <div class="card">
      {#if storage?.quota}
        <div class="bar"><i style="width:{usagePct}%"></i></div>
        <div class="note">{formatBytes(storage.usage)} used of {formatBytes(storage.quota)}</div>
      {:else}
        <div class="note">This browser does not report storage usage.</div>
      {/if}
      <div class="kv" style="margin-top:6px">Persistent storage<span class={storage?.persisted ? 'ok' : 'warn'}>{storage?.persisted ? 'granted' : 'not granted'}</span></div>
      {#if persistNote}<div class="note">{persistNote}</div>{/if}
      <div class="btnrow"><button class="btn" disabled={storage?.persisted} onclick={persist}>Request persistence</button></div>
    </div>

    <div class="sec">Memory and data</div>
    <div class="card">
      <div class="btnrow" style="margin-top:0"><button class="btn" disabled={freeing} onclick={free}>{freeing ? 'Freeing' : 'Free model memory'}</button></div>
      <div class="btnrow"><button class="btn danger" disabled={!anyInstalled || busy !== null} onclick={() => (confirm = { kind: 'all' })}>Delete all models</button></div>
      <div class="btnrow"><button class="btn danger" disabled={busy !== null} onclick={() => (confirm = { kind: 'clear' })}>Clear all app data</button></div>
    </div>
  </div>
</div>

{#if confirm}
  <Sheet title="Are you sure?" onclose={() => (confirm = null)}>
    <div class="note">
      {#if confirm.kind === 'model'}
        Delete {confirm.card.label} from this device? It can be downloaded again. The shared encoder stays while another model needs it.
      {:else if confirm.kind === 'all'}
        Delete every downloaded model from this device? They can be downloaded again.
      {:else}
        Delete all models, the project and every generated sound? This cannot be undone.
      {/if}
    </div>
    <div class="btnrow">
      <button class="btn" onclick={() => (confirm = null)}>Cancel</button>
      <button class="btn danger" onclick={() => void runConfirm()}>Delete</button>
    </div>
  </Sheet>
{/if}
