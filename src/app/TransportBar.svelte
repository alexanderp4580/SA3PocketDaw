<script lang="ts">
  import { ui, play, pause, stop } from './appState.svelte';
  import {loopRange} from '../store/projectModel';
  const range=$derived(ui.project?loopRange(ui.project):{startBar:1,endBar:1});
</script>

<div class="transport">
  <button class="tp" aria-label="Stop" onclick={stop}>■</button>
  <button class="tp play" class:active={ui.playing} aria-label={ui.playing ? 'Pause' : 'Play'} aria-pressed={ui.playing} onclick={() => ui.playing?pause():void play()}>{ui.playing?'Ⅱ':'▶'}</button>
  <button class="tp loop on" aria-label="Repeat bars, all tracks" onclick={()=>ui.loopOpen=true}><span>⟲</span>Bars {range.startBar}–{range.endBar}</button>
</div>
