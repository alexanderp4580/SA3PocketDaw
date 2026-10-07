<script lang="ts">
 import Sheet from '../Sheet.svelte';import {pluginTypeIds,pluginTypes,type PluginType} from '../../audio/mixer/plugins';
 let {name,onadd,onclose}:{name:string;onadd:(type:PluginType)=>void;onclose:()=>void}=$props();
</script>
<Sheet title="Add plugin" sub={name} {onclose}>
 {#each pluginTypeIds as type}<button class="choice" onclick={()=>onadd(type)}><strong>{pluginTypes[type].label}</strong><span>{type==='eq'?'Shape frequencies with a parametric EQ':'Add space with Dragonfly Hall, Room or Plate'}</span><b>＋</b></button>{/each}
 <button class="btn" onclick={onclose}>Cancel</button>
</Sheet>
<style>.choice{display:grid;grid-template-columns:1fr 28px;gap:5px;width:100%;text-align:left;background:var(--panel2);border-radius:10px;padding:14px;margin:8px 0;min-height:76px}.choice strong{color:var(--sa3)}.choice span{grid-column:1;font-size:12px;color:var(--dim)}.choice b{grid-column:2;grid-row:1/3;align-self:center;font-size:22px}</style>
