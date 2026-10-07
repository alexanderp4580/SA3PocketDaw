<script lang="ts">
 import type {InstrumentControls} from '../audio/instrument/controls';
 import {BEHAVIORS} from '../gen/instrumentSelections';
 let {controls,onchange,behaviorName='playback-behavior',disabled=false}:{controls:InstrumentControls;onchange:(patch:Partial<InstrumentControls>)=>void;behaviorName?:string;disabled?:boolean}=$props();
</script>
<fieldset class="panel" {disabled}>
 <legend class="sr-only">Instrument playback controls</legend>
 <label class="control">Brightness <b>{Math.round(controls.brightness*100)}%</b><input aria-label="Instrument brightness" type="range" min="0" max="100" step="1" value={Math.round(controls.brightness*100)} oninput={e=>onchange({brightness:Number(e.currentTarget.value)/100})} /></label>
 <label class="control">Attack <b>{Math.round(controls.attack*1000)} ms</b><input aria-label="Instrument attack" type="range" min="3" max="2000" step="1" value={Math.round(controls.attack*1000)} oninput={e=>onchange({attack:Number(e.currentTarget.value)/1000})} /></label>
 <label class="control">Release <b>{Math.round(controls.release*1000)} ms</b><input aria-label="Instrument release" type="range" min="20" max="2000" step="1" value={Math.round(controls.release*1000)} oninput={e=>onchange({release:Number(e.currentTarget.value)/1000})} /></label>
 <fieldset class="behavior"><legend>Playback note behavior</legend><div class="choices">{#each BEHAVIORS as q (q.id)}<label class:on={controls.behavior===q.id}><input type="radio" name={behaviorName} value={q.id} checked={controls.behavior===q.id} onchange={()=>onchange({behavior:q.id})} />{q.label}</label>{/each}</div></fieldset>
</fieldset>
<style>
 .panel{border:0;padding:0;margin:0;min-width:0;}
 .sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);}
 .control{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px;font-size:14px;}
 .control b{margin-left:auto;color:var(--dim);font-variant-numeric:tabular-nums;}
 .control input{width:100%;min-height:44px;accent-color:var(--sa3);}
 .behavior{border:0;margin:14px 0;padding:0;min-width:0;}
 .behavior legend{font-size:14px;margin-bottom:6px;}
 .choices{display:flex;gap:6px;}
 .choices label{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;min-height:44px;border:1px solid transparent;border-radius:10px;background:var(--panel2);font-size:13px;}
 .choices label.on{background:var(--sa3bg);color:var(--sa3);border-color:var(--sa3);}
 .choices input{accent-color:var(--sa3);}
 .choices label:focus-within{outline:2px solid var(--sa3);outline-offset:2px;}
</style>
