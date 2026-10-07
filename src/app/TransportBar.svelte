<script lang="ts">
  import { ui, play, pause, stop } from './appState.svelte';
  import {loopRange} from '../store/projectModel';
  import {engine} from './services';
  let {pianoRoll=false,song=false}:{pianoRoll?:boolean;song?:boolean}=$props();
  let repeatSong=$state(engine.songRepeat);
  const range=$derived(ui.project?loopRange(ui.project):{startBar:1,endBar:1});
</script>

<div class="transport" class:roll={pianoRoll} aria-label="Playback">
 {#if pianoRoll}
  <button class="tp restart" aria-label="Play from start" title="Play from start" onclick={()=>{stop();void play();}}><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4v16" stroke="currentColor" stroke-width="2"/><path d="M9 4l12 8-12 8z" fill="currentColor"/></svg></button>
  <button class="tp play" class:active={ui.playing} aria-label={ui.playing?'Pause':'Play'} title={ui.playing?'Pause':'Play'} aria-pressed={ui.playing} onclick={()=>ui.playing?pause():void play()}>{ui.playing?'Ⅱ':'▶'}</button>
  <button class="tp" aria-label="Reset playback" title="Reset playback" onclick={stop}>↺</button>
  {#if song}<button class="tp rep" class:on={repeatSong} aria-pressed={repeatSong} aria-label="Repeat song" title="Repeat song" onclick={()=>{repeatSong=!repeatSong;engine.setSongRepeat(repeatSong);}}>⟲</button>{/if}
 {:else}
  <button class="tp" aria-label="Stop" onclick={stop}>■</button>
  <button class="tp play" class:active={ui.playing} aria-label={ui.playing ? 'Pause' : 'Play'} aria-pressed={ui.playing} onclick={() => ui.playing?pause():void play()}>{ui.playing?'Ⅱ':'▶'}</button>
  <button class="tp loop on" aria-label="Repeat bars, all tracks" onclick={()=>ui.loopOpen=true}><span>⟲</span>Bars {range.startBar}–{range.endBar}</button>
 {/if}
</div>
<style>.transport.roll{justify-content:flex-start}.roll .tp{flex:none;width:52px}.roll .restart{background:var(--accent);color:#111}.roll .rep.on{color:var(--sa3);background:var(--sa3bg)}.roll .play{background:var(--panel2);color:var(--text)}</style>
