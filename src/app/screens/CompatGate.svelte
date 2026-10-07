<script lang="ts">
  import { ui, runCompatCheck } from '../appState.svelte';
  import { COMPAT_TEXT, canContinue, failedReasons } from '../format';
  import { copyReport } from '../report';
  import { notify } from '../appState.svelte';

  let { oncontinue, ondebug }: { oncontinue: () => void; ondebug: () => void } = $props();

  async function copy() {
    notify((await copyReport()) ? 'Report copied' : 'Copy failed');
  }
</script>

<div class="content">
  <div class="top"><h1>SA3 Browser DAW</h1></div>
  <div class="body">
    {#if ui.compatRunning}
      <div class="card" aria-live="polite">
        <b>Checking this browser</b>
        <div class="note">The GPU test can take several seconds.</div>
        <div class="bar"><i class="indeterminate"></i></div>
      </div>
    {:else if ui.compat}
      {@const result = ui.compat}
      <div class="card verdict {result.verdict}" aria-live="polite">
        <div class="row"><b class="grow">{COMPAT_TEXT[result.verdict]}</b><span class="tag" class:ok={result.verdict === 'ok'} class:warn={result.verdict === 'maybe'} class:bad={result.verdict === 'no'}>{result.verdict}</span></div>
        {#if result.verdict === 'no'}
          <ul class="reasons">
            {#each failedReasons(result) as reason (reason)}<li>{reason}</li>{/each}
          </ul>
        {/if}
      </div>
      <div class="sec">Checks</div>
      {#each result.checks as check (check.id)}
        <div class="card">
          <div class="row"><b>{check.label}</b><span class="tag" class:ok={check.status === 'pass'} class:warn={check.status === 'warn'} class:bad={check.status === 'fail'}>{check.status}</span></div>
          <div class="note">{check.detail}</div>
        </div>
      {/each}
    {/if}
  </div>
  <div class="actions">
    <button class="btn pri" disabled={ui.compatRunning || !canContinue(ui.compat)} onclick={oncontinue}>Continue</button>
    <button class="btn" disabled={ui.compatRunning} onclick={() => void runCompatCheck()}>Re-check</button>
    <button class="btn" onclick={copy}>Copy report</button>
    <button class="btn" onclick={ondebug}>Open Debug</button>
  </div>
</div>

<style>
  .verdict.ok { border-color: var(--green); }
  .verdict.maybe { border-color: var(--yellow); }
  .verdict.no { border-color: var(--red); }
  .reasons { margin: 8px 0 0 18px; font-size: 13px; color: var(--dim); }
  .actions { flex: none; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 8px 12px 14px; background: var(--panel); border-top: 1px solid var(--line); }
  .indeterminate { width: 40% !important; animation: slide 1.2s infinite ease-in-out; }
  @keyframes slide { 0% { margin-left: -40%; } 100% { margin-left: 100%; } }
</style>
