<script lang="ts">
  let {
    peaks,
    min,
    max,
    color = '#d7c2ff',
  }: { peaks: Float32Array | undefined; min?: Float32Array; max?: Float32Array; color?: string } = $props();
  const points = $derived.by(() => {
    if (min && max && min.length > 0 && min.length === max.length) {
      const n = min.length;
      let top = '';
      let bot = '';
      for (let i = 0; i < n; i++) {
        const hi = Math.min(1, Math.max(0.01, max[i]!));
        const lo = Math.max(-1, Math.min(-0.01, min[i]!));
        top += `${i},${50 - hi * 48} `;
        bot = `${i},${50 - lo * 48} ` + bot;
      }
      return top + bot;
    }
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
  const width = $derived(Math.max(1, min?.length ?? peaks?.length ?? 1));
</script>

<svg class="wave" viewBox="0 0 {width} 100" preserveAspectRatio="none" style="width:100%;height:100%" aria-hidden="true">
  {#if points}
    <polygon {points} fill={color} opacity=".85" />
  {:else}
    <line x1="0" y1="50" x2={width} y2="50" stroke="#555" stroke-width="1" vector-effect="non-scaling-stroke" />
  {/if}
</svg>
