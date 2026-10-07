<script lang="ts">
 import type {SampleControls} from '../audio/sampleControls';
 let {controls,onchange,disabled=false}:{controls:SampleControls;onchange:(patch:Partial<SampleControls>)=>void;disabled?:boolean}=$props();
</script>
<fieldset class="panel" {disabled}>
 <legend class="sr-only">Sample playback controls</legend>
 <label class="control">Brightness <b>{Math.round(controls.brightness*100)}%</b><input aria-label="Sample brightness" type="range" min="0" max="100" step="1" value={Math.round(controls.brightness*100)} oninput={e=>onchange({brightness:Number(e.currentTarget.value)/100})} /></label>
 <label class="control">Attack <b>{Math.round(controls.attack*1000)} ms</b><input aria-label="Sample attack" type="range" min="1" max="2000" step="1" value={Math.round(controls.attack*1000)} oninput={e=>onchange({attack:Number(e.currentTarget.value)/1000})} /></label>
 <label class="control">Release <b>{Math.round(controls.release*1000)} ms</b><input aria-label="Sample release" type="range" min="5" max="2000" step="1" value={Math.round(controls.release*1000)} oninput={e=>onchange({release:Number(e.currentTarget.value)/1000})} /></label>
</fieldset>
<style>
 .panel{border:0;padding:0;margin:0;min-width:0;}
 .sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);}
 .control{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px;font-size:14px;}
 .control b{margin-left:auto;color:var(--dim);font-variant-numeric:tabular-nums;}
 .control input{width:100%;min-height:44px;accent-color:var(--sa3);}
</style>
