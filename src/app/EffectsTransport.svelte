<script lang="ts">import {ui,play,pause,stop} from './appState.svelte';</script>
<div class="effects-transport"><button class="btn pri" aria-label={ui.playing?'Pause effects playback':'Play effects playback'} onclick={()=>ui.playing?pause():void play()}>{ui.playing?'Ⅱ Pause':'▶ Play'}</button><button class="btn" aria-label="Stop effects playback" onclick={stop}>■ Stop</button></div>
<style>.effects-transport{display:flex;gap:6px;margin:10px 0}.effects-transport .btn{flex:1;height:42px;font-size:13px}</style>
