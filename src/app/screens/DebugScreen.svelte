<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { lastCompat } from '../../compat';
  import { reporter, type LogEntry, type LogLevel } from '../../log';
  import { notify } from '../appState.svelte';
  import { log, models } from '../services';
  import { copyReport, downloadReport } from '../report';
  import { filterLog, formatBytes, formatLogTime, formatElapsed, logScopes, timingRows } from '../format';

  const LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];
  let levels = $state<Set<LogLevel>>(new Set(['info', 'warn', 'error']));
  let scope = $state('');
  let autoScroll = $state(true);
  let entries = $state.raw<LogEntry[]>(log.entries());
  let storage = $state<{ quota?: number; usage?: number; persisted: boolean } | null>(null);
  let packs = $state<string[]>([]);
  let listEl: HTMLDivElement | undefined;
  let pending = 0;

  const shown = $derived(filterLog(entries, levels, scope).slice(-400));
  const scopes = $derived(logScopes(entries));
  const compat = $derived(lastCompat());
  const generations = $derived(reporter.generations());
  let off: (() => void) | undefined;

  function schedule() {
    if (pending) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      entries = log.entries();
    });
  }

  onMount(() => {
    off = log.subscribe(schedule, () => (entries = []));
    void models.storageInfo().then((s) => (storage = s)).catch(() => {});
    packs = models.installedPackIds();
  });
  onDestroy(() => {
    off?.();
    if (pending) cancelAnimationFrame(pending);
  });

  $effect(() => {
    shown.length;
    if (autoScroll) void tick().then(() => listEl && (listEl.scrollTop = listEl.scrollHeight));
  });

  function toggle(l: LogLevel) {
    const next = new Set(levels);
    if (next.has(l)) next.delete(l);
    else next.add(l);
    levels = next;
  }
  async function copy() {
    notify((await copyReport()) ? 'Report copied' : 'Copy failed');
  }
  const detail = (d: unknown) => (d === undefined ? '' : ' ' + (typeof d === 'string' ? d : JSON.stringify(d)));
</script>

<div class="content">
  <div class="top"><h1>Debug</h1></div>
  <div class="body">
    <div class="btnrow" style="margin-top:0">
      <button class="btn" onclick={copy}>Copy report</button>
      <button class="btn" onclick={() => void downloadReport()}>Download report</button>
    </div>

    <div class="sec">Log</div>
    <div class="card">
      <div class="chips">
        {#each LEVELS as l (l)}
          <button class="chip" class:on={levels.has(l)} aria-pressed={levels.has(l)} onclick={() => toggle(l)}>{l}</button>
        {/each}
      </div>
      <div class="row" style="margin-top:8px">
        <select class="field grow" aria-label="Scope filter" bind:value={scope}>
          <option value="">All scopes</option>
          {#each scopes as s (s)}<option value={s}>{s}</option>{/each}
        </select>
      </div>
      <div class="btnrow" style="margin-top:8px">
        <button class="btn" class:pri={autoScroll} aria-pressed={autoScroll} onclick={() => (autoScroll = !autoScroll)}>Auto-scroll {autoScroll ? 'on' : 'off'}</button>
        <button class="btn" onclick={() => log.clear()}>Clear</button>
      </div>
      <div class="log" bind:this={listEl} role="log">
        {#each shown as e, i (e.t + ':' + i)}
          <div class="line {e.level}"><span class="t">{formatLogTime(e.t)}</span> <span class="sc">{e.scope}</span> {e.message}<span class="t">{detail(e.data)}</span></div>
        {:else}
          <span class="note">No entries for this filter.</span>
        {/each}
      </div>
    </div>

    <div class="sec">MP3 encoder</div>
    <div class="card note">LAME via @breezystack/lamejs · LGPL-3.0. <a href="/mp3/README.txt">Notices</a> · <a href="/mp3/LGPL-3.0.txt">License</a> · <a href="/mp3/source.tar.gz" download>Source</a> · <a href="https://lame.sourceforge.net/">LAME</a></div>

    <div class="sec">Environment</div>
    <div class="card">
      <div class="kv">crossOriginIsolated<span>{String(globalThis.crossOriginIsolated)}</span></div>
      <div class="kv">Secure context<span>{String(globalThis.isSecureContext)}</span></div>
      <div class="kv">userAgent<span class="ua">{navigator.userAgent}</span></div>
    </div>

    <div class="sec">GPU</div>
    <div class="card">
      {#if compat?.env.adapter}
        {@const a = compat.env.adapter}
        <div class="kv">Adapter<span>{[a.vendor, a.architecture, a.device, a.description].filter(Boolean).join(' / ') || 'no details exposed'}</span></div>
        <div class="kv">shader-f16<span>{compat.env.features.includes('shader-f16') ? 'yes' : 'no'}</span></div>
        <div class="kv">maxBufferSize<span>{formatBytes(compat.env.limits.maxBufferSize)}</span></div>
        <div class="kv">maxStorageBufferBindingSize<span>{formatBytes(compat.env.limits.maxStorageBufferBindingSize)}</span></div>
        <div class="kv">GPU probe<span>{compat.env.probe.status}{compat.env.probe.ms ? ` (${Math.round(compat.env.probe.ms)} ms)` : ''}{compat.env.probe.error ? ': ' + compat.env.probe.error : ''}</span></div>
      {:else if compat}
        <div class="note">No GPU adapter was obtained. WebGPU API: {compat.env.webgpuApi ? 'present' : 'absent'}.</div>
      {:else}
        <div class="note">The compatibility check has not run in this session.</div>
      {/if}
    </div>

    <div class="sec">Storage</div>
    <div class="card">
      {#if storage?.quota}
        <div class="kv">Used<span>{formatBytes(storage.usage)} of {formatBytes(storage.quota)}</span></div>
        <div class="kv">Persistent<span>{storage.persisted ? 'yes' : 'no'}</span></div>
      {:else}
        <div class="note">No storage estimate available.</div>
      {/if}
      <div class="kv">Installed packs<span>{packs.length ? packs.join(', ') : 'none'}</span></div>
    </div>

    <div class="sec">Generations</div>
    {#each generations as g, gi (gi)}
      {@const rec = g as { model?: string; at?: string; seconds?: number; steps?: number }}
      <div class="card">
        <div class="note">{rec.model} · {rec.seconds} s · {rec.steps} steps · {rec.at ?? ''}</div>
        {#each timingRows(g) as r (r.stage)}
          <div class="kv">{r.stage}<span>{formatElapsed(r.ms)}</span></div>
        {/each}
      </div>
    {:else}
      <div class="card"><div class="note">No generations in this session.</div></div>
    {/each}
  </div>
</div>

<style>
  .log {
    height: 260px;
    overflow: auto;
    background: #0e1014;
    border-radius: 8px;
    padding: 6px;
    margin-top: 8px;
    font-family: ui-monospace, Menlo, Consolas, monospace;
    font-size: 11px;
    line-height: 1.35;
  }
  .line { white-space: pre-wrap; word-break: break-word; }
  .line.warn { color: var(--yellow); }
  .line.error { color: var(--red); }
  .line.debug { color: #6b717d; }
  .t { color: var(--dim); }
  .sc { color: #7b8fff; }
  .ua { font-size: 11px; }
  select.field { appearance: auto; }
</style>
