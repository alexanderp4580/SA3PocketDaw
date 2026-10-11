<script lang="ts" module>
 import type {Trim} from '../audio/trim';
 export interface ChopView {duration:number;peaks?:Float32Array;trim:Trim;busy?:boolean;error?:string}
</script>
<script lang="ts">
 import Waveform from './Waveform.svelte';
 import {moveEnd,moveStart} from '../audio/trim';
 let {view,oninput,oncommit,onreset,disabled=false,name='sound'}:{view:ChopView;oninput:(t:Trim)=>void;oncommit:(t:Trim)=>void;onreset:()=>void;disabled?:boolean;name?:string}=$props();
 const STEP=.01;
 const left=$derived(view.duration>0?view.trim.start/view.duration*100:0);
 const right=$derived(view.duration>0?100-view.trim.end/view.duration*100:0);
 const full=$derived(view.trim.start<=0&&view.trim.end>=view.duration);
 function start(e:Event&{currentTarget:HTMLInputElement}){const next=moveStart(view.trim,Number(e.currentTarget.value),view.duration);e.currentTarget.value=String(next.start);oninput(next);}
 function end(e:Event&{currentTarget:HTMLInputElement}){const next=moveEnd(view.trim,Number(e.currentTarget.value),view.duration);e.currentTarget.value=String(next.end);oninput(next);}
</script>
<fieldset class="chop" {disabled}>
 <legend class="sr-only">Chop {name}</legend>
 <div class="st">Chop</div>
 <div class="wave"><Waveform peaks={view.peaks} />{#if left>0}<i class="cut l" style="width:{left}%"></i>{/if}{#if right>0}<i class="cut r" style="width:{right}%"></i>{/if}</div>
 <div class="kept">Kept <b>{(view.trim.end-view.trim.start).toFixed(2)} s</b> of {view.duration.toFixed(2)} s{#if view.busy}<span class="busy" role="status">Updating sound…</span>{/if}</div>
 <label class="control">Start <b>{view.trim.start.toFixed(2)} s</b><input aria-label="Chop start" type="range" min="0" max={view.duration} step={STEP} value={view.trim.start} oninput={start} onchange={()=>oncommit(view.trim)} /></label>
 <label class="control">End <b>{view.trim.end.toFixed(2)} s</b><input aria-label="Chop end" type="range" min="0" max={view.duration} step={STEP} value={view.trim.end} oninput={end} onchange={()=>oncommit(view.trim)} /></label>
 {#if view.error}<div class="note bad" role="alert">{view.error} The previous sound is kept.</div>{/if}
 <div class="btnrow"><button class="btn" disabled={full||disabled} onclick={onreset}>Reset chop</button></div>
</fieldset>
<style>
 .chop{border:0;padding:0;margin:0;min-width:0;}
 .sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);}
 .wave{position:relative;height:64px;background:#0e1014;border-radius:8px;padding:4px;overflow:hidden;}
 .cut{position:absolute;top:0;bottom:0;background:#0009;pointer-events:none;}
 .cut.l{left:0;border-right:2px solid var(--sa3);}
 .cut.r{right:0;border-left:2px solid var(--sa3);}
 .kept{margin-top:8px;font-size:14px;color:var(--dim);display:flex;gap:8px;flex-wrap:wrap;align-items:baseline;}
 .kept b{color:inherit;font-variant-numeric:tabular-nums;}
 .busy{margin-left:auto;color:var(--sa3);}
 .control{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;font-size:14px;}
 .control b{margin-left:auto;color:var(--dim);font-variant-numeric:tabular-nums;}
 .control input{width:100%;min-height:44px;accent-color:var(--sa3);}
</style>
