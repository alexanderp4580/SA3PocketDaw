<script lang="ts">
  let {
    peaks,
    color = '#d7c2ff',
  }: { peaks: Float32Array | undefined; color?: string } = $props();
  const points = $derived.by(() => {
    if (!peaks || peaks.length === 0) return '';
    const n = peaks.length;
    let top = '';
    let bot = '';
    for (let i = 0; i < n; i++) {
      const a = Math.min(1, Math.max(0.02, peaks[i]!));
      top += `${i},${50 - a * 48} `;
      bot = `${i},${50 + a * 48} ` + bot;
    }
    return top + bot;
  });
  const width = $derived(Math.max(1, peaks?.length ?? 1));
</script>

<svg class="wave" viewBox="0 0 {width} 100" preserveAspectRatio="none" style="width:100%;height:100%" aria-hidden="true">
  {#if points}
    <polygon {points} fill={color} opacity=".85" />
  {:else}
    <line x1="0" y1="50" x2={width} y2="50" stroke="#555" stroke-width="1" vector-effect="non-scaling-stroke" />
  {/if}
</svg>
