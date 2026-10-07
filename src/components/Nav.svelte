<script lang="ts" module>
  export type Route = 'tracks' | 'layout' | 'mix' | 'models' | 'debug';
  export const navItems: { route: Route; label: string; icon: string; disabled?: boolean }[] = [
    { route: 'tracks', label: 'Tracks', icon: '☰' },
    { route: 'layout', label: 'Layout', icon: '▥' },
    { route: 'mix', label: 'Mix', icon: '⫼' },
    { route: 'models', label: 'Models', icon: '⬇' },
    { route: 'debug', label: 'Debug', icon: '⌗' },
  ];
</script>

<script lang="ts">
  let { route, onnavigate }: { route: Route; onnavigate: (route: Route) => void } = $props();
</script>

<nav class="nav" aria-label="Main">
  {#each navItems as item (item.route)}
    <button
      class:on={route === item.route}
      disabled={item.disabled}
      aria-current={route === item.route ? 'page' : undefined}
      aria-label={item.label}
      onclick={() => onnavigate(item.route)}
    >
      <b aria-hidden="true">{item.icon}</b>
      <span>{item.label}</span>
      {#if item.disabled}<span class="soon">Soon</span>{/if}
    </button>
  {/each}
</nav>
