<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { log, models, transcriber } from './services';
  import { notify } from './appState.svelte';
  import { formatBytes, formatElapsed } from './format';
  import { decodeTo16kMono } from '../transcribe/resample';
  import { PACK_ID, PACK_LABEL, transcriberPack, type TranscriberPack } from '../transcribe/pack';
  import { noteRows, runRows, windowRows } from '../transcribe/view';
  import { playPreview } from '../transcribe/preview';
  import { THREAD_CHOICES, type ThreadChoice } from '../transcribe/threads';
  import { TranscribeError, type TranscribeProgress, type TranscribeRun } from '../transcribe/client';
  import type { TranscribeSummary } from '../transcribe/protocol';

  let { onmodels }: { onmodels: () => void } = $props();

  const scope = log.scope('transcribe-ui');
  let pack = $state<TranscriberPack>(transcriberPack(null, {}));
  let file = $state<File | null>(null);
  let input = $state<HTMLInputElement>();
  let threadChoice = $state<ThreadChoice>('auto');
  let running = $state(false);
  let status = $state('');
  let progress = $state<TranscribeProgress | null>(null);
  let error = $state('');
  let summary = $state.raw<TranscribeSummary | null>(null);
  let run = $state.raw<TranscribeRun | null>(null);
  let decodeMs = $state(0);
  let controller: AbortController | null = null;
  let audioCtx: AudioContext | null = null;
  let preview: { stop(): void } | null = null;
  let playing = $state(false);
  let previewTimer: ReturnType<typeof setTimeout> | undefined;

  async function refresh() {
    try {
      if (!models.getManifest()) await models.loadManifest();
      pack = transcriberPack(models.getManifest(), await models.packStates());
    } catch (e) {
      pack = transcriberPack(null, {});
      scope.warn('model list unavailable', String(e));
    }
  }
  let off: (() => void) | undefined;
  onMount(() => {
    void refresh();
    off = models.onChange(() => void refresh());
    run = transcriber.lastRun();
  });
  onDestroy(() => {
    off?.();
    stopPreview();
    clearTimeout(previewTimer);
  });

  function choose(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0] ?? null;
    file = f;
    error = '';
    if (f) scope.info(`audio file chosen: ${f.name}`, { bytes: f.size, type: f.type });
  }

  async function start() {
    if (!file || running) return;
    stopPreview();
    running = true;
    error = '';
    summary = null;
    run = null;
    progress = null;
    controller = new AbortController();
    try {
      status = 'Decoding the audio file';
      const t0 = performance.now();
      const bytes = await file.arrayBuffer();
      const audio = await decodeTo16kMono(bytes, (rate) => new OfflineAudioContext(1, 1, rate));
      decodeMs = performance.now() - t0;
      scope.info(`decoded ${file.name} to 16 kHz mono`, { seconds: audio.length / 16000, ms: Math.round(decodeMs) });
      status = 'Transcribing';
      summary = await transcriber.transcribe(audio, {
        name: file.name,
        signal: controller.signal,
        threads: threadChoice === 'auto' ? undefined : threadChoice,
        onProgress: (p) => {
          progress = p;
          status = p.message;
        },
      });
      run = transcriber.lastRun();
      status = '';
    } catch (e) {
      if (e instanceof TranscribeError && e.code === 'cancelled') {
        status = 'Cancelled';
      } else {
        error = e instanceof Error ? e.message : String(e);
        status = '';
        scope.error('transcription failed', error);
      }
    } finally {
      running = false;
      controller = null;
      progress = null;
    }
  }

  function cancel() {
    controller?.abort();
  }

  async function freeMemory() {
    await transcriber.unload();
    notify('Transcriber memory freed');
  }

  function stopPreview() {
    preview?.stop();
    preview = null;
    playing = false;
    clearTimeout(previewTimer);
  }
  async function play() {
    if (!summary || !summary.notes.length) return;
    stopPreview();
    audioCtx ??= new AudioContext();
    await audioCtx.resume();
    const p = playPreview(audioCtx as never, summary.notes);
    preview = p;
    playing = true;
    previewTimer = setTimeout(stopPreview, (p.seconds + 0.3) * 1000);
  }

  const pct = $derived(progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0);
  const rows = $derived(run ? runRows(run) : []);
  const windows = $derived(run ? windowRows(run) : []);
  const notes = $derived(run ? noteRows(run.firstNotes) : []);
</script>

<div class="sec">Piano transcriber</div>
<div class="card">
  <div class="row">
    <b>{PACK_LABEL}</b>
    <span class="tag" class:ok={pack.status === 'installed'} class:warn={pack.status === 'partial'}>{!pack.available ? 'not available' : pack.status === 'installed' ? 'installed' : pack.status === 'partial' ? 'partial' : 'not installed'}</span>
  </div>
  <div class="note">Turns a piano recording into notes on this device. Chosen audio is not uploaded.</div>

  {#if pack.available && pack.status !== 'installed'}
    <div class="note">{formatBytes(pack.bytes)} to download. Install it on the Models screen.</div>
    <div class="btnrow"><button class="btn pri" onclick={onmodels}>Download</button></div>
  {:else if !pack.available}
    <div class="note">The model list has no {PACK_ID} pack.</div>
  {:else}
    <input bind:this={input} type="file" accept="audio/*" hidden onchange={choose} />
    <div class="kv">File<span>{file ? `${file.name} (${formatBytes(file.size)})` : 'none chosen'}</span></div>
    <div class="btnrow">
      <button class="btn" disabled={running} onclick={() => input?.click()}>Choose file</button>
      <button class="btn pri" disabled={!file || running} onclick={() => void start()}>Run</button>
      <button class="btn danger" disabled={!running} onclick={cancel}>Cancel</button>
    </div>
    <div class="chips" style="margin-top:10px">
      <span class="note" style="align-self:center">Threads</span>
      {#each THREAD_CHOICES as t (t)}
        <button class="chip" class:on={threadChoice === t} aria-pressed={threadChoice === t} disabled={running} onclick={() => (threadChoice = t)}>{t}</button>
      {/each}
    </div>
    <div class="btnrow"><button class="btn" disabled={running} onclick={() => void freeMemory()}>Free transcriber memory</button></div>
  {/if}

  {#if running}
    <div class="bar" role="progressbar" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100"><i style="width:{progress?.stage === 'windows' ? pct : 0}%"></i></div>
    <div class="note" role="status">{status}{progress?.stage === 'windows' ? ` · ${progress.done} of ${progress.total} windows done` : ''}</div>
  {:else if status}
    <div class="note" role="status">{status}</div>
  {/if}
  {#if error}<div class="note bad" role="alert">{error}</div>{/if}
</div>

{#if run}
  <div class="sec">Transcriber result</div>
  <div class="card" data-testid="transcribe-result">
    {#each rows as [k, v] (k)}<div class="kv">{k}<span>{v}</span></div>{/each}
    <div class="kv">Decode and resample<span>{formatElapsed(decodeMs)}</span></div>
    {#each windows as [k, v] (k)}<div class="kv">{k}<span>{v}</span></div>{/each}
    {#if summary && summary.notes.length}
      <div class="btnrow">
        {#if playing}
          <button class="btn" onclick={stopPreview}>Stop</button>
        {:else}
          <button class="btn sa3" onclick={() => void play()}>Play notes</button>
        {/if}
      </div>
      <div class="note">Plays the notes as plain triangle-wave tones.</div>
    {/if}
  </div>
  <div class="card">
    <div class="note">First {notes.length} of {run.noteCount} notes</div>
    <table class="notes">
      <thead><tr><th>Time (s)</th><th>Note</th><th>Length (s)</th><th>Velocity</th></tr></thead>
      <tbody>
        {#each notes as n, i (i)}<tr><td>{n.time}</td><td>{n.name}</td><td>{n.length}</td><td>{n.velocity}</td></tr>{/each}
      </tbody>
    </table>
  </div>
{/if}

<style>
  .notes { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 6px; }
  .notes th { text-align: right; color: var(--dim); font-weight: 600; padding: 4px 6px; }
  .notes td { text-align: right; padding: 4px 6px; border-top: 1px solid #262a32; font-variant-numeric: tabular-nums; }
  .notes th:nth-child(2), .notes td:nth-child(2) { text-align: left; }
</style>
