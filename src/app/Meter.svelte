<script lang="ts">
 import {onMount} from 'svelte';import {engine} from './services';import {gainDb} from '../audio/mixer/model';import {emptyMeter} from '../audio/mixer/meter';
 let {trackId}:{trackId?:string}=$props();let reading=$state(emptyMeter());
 onMount(()=>{const timer=setInterval(()=>{if(!document.hidden)reading=engine.meter(trackId);},40);return ()=>clearInterval(timer);});
 const width=(x:number)=>Math.max(0,Math.min(100,(gainDb(x)+60)/60*100));
</script>
<div class="meter" aria-label="Stereo audio level" title="Average level and held peaks in dBFS">
 <div class="bars">{#each [0,1] as ch}<div class="bar"><span style:width="{width(reading.rms[ch]!)}%"></span><i style:left="{width(reading.peak[ch]!)}%"></i></div>{/each}</div>
 <span class="value" class:clip={reading.clip}>{reading.clip?'CLIP':Math.max(...reading.peak)>1e-5?`${gainDb(Math.max(...reading.peak)).toFixed(1)} dBFS`:'−∞ dBFS'}</span>
</div>
<style>.meter{display:flex;gap:8px;align-items:center;width:100%;min-width:0}.bars{display:grid;gap:3px;flex:1;min-width:0}.bar{height:7px;background:#0a0d12;border-radius:2px;position:relative;overflow:hidden}.bar span{display:block;height:100%;background:linear-gradient(90deg,#3ddc84,#ffd23d 85%,#ff665b)}.bar i{position:absolute;top:0;bottom:0;width:2px;background:#fff}.value{width:82px;font-size:10px;color:var(--dim);text-align:right;font-variant-numeric:tabular-nums}.clip{color:#ff665b}</style>
