<script lang="ts">
  import type { Snippet } from 'svelte';
  let {
    title,
    sub = '',
    onclose,
    tall = false,
    closable = true,
    children,
  }: { title: string; sub?: string; onclose: () => void; tall?: boolean; closable?: boolean; children: Snippet } = $props();
</script>

<div class="scrim" role="presentation"></div>
<div class="sheet" class:tall role="dialog" aria-modal="true" aria-label={title}>
  <div class="grab" aria-hidden="true"></div>
  <div class="hd"><span>{title}</span><button class="iconbtn" aria-label="Close" disabled={!closable} onclick={onclose}>✕</button></div>
  {#if sub}<div class="sub">{sub}</div>{/if}
  {@render children()}
</div>
