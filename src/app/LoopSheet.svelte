<script lang="ts">
 import Sheet from './Sheet.svelte';
 import {ui,updateProject} from './appState.svelte';
 import {loopRange,timelineBars,setLoopRange} from '../store/projectModel';
 const count=$derived(ui.project?timelineBars(ui.project):1);
 const range=$derived(ui.project?loopRange(ui.project):{startBar:1,endBar:1});
 function set(start:number,end:number){updateProject(p=>setLoopRange(p,start,end));}
</script>
<Sheet title="Repeat bars" sub="Shared by all tracks" onclose={()=>ui.loopOpen=false}>
 <p class="note">Choose the bars to repeat while you edit. All tracks play together; shorter track patterns repeat underneath.</p>
 <div class="range"><label>From bar<select class="field" aria-label="Repeat from bar" value={range.startBar} onchange={e=>set(Number(e.currentTarget.value),Math.max(range.endBar,Number(e.currentTarget.value)))}>{#each Array.from({length:count},(_,i)=>i+1) as n}<option value={n}>{n}</option>{/each}</select></label><label>Through bar<select class="field" aria-label="Repeat through bar" value={range.endBar} onchange={e=>set(Math.min(range.startBar,Number(e.currentTarget.value)),Number(e.currentTarget.value))}>{#each Array.from({length:count},(_,i)=>i+1) as n}<option value={n}>{n}</option>{/each}</select></label></div>
 <div class="btnrow"><button class="btn" onclick={()=>set(1,count)}>All bars</button><button class="btn pri" onclick={()=>ui.loopOpen=false}>Done</button></div>
</Sheet>
<style>.range{display:flex;gap:12px;margin:18px 0;}.range label{flex:1;min-width:0;font-size:13px;}.range select{margin-top:8px;}</style>
