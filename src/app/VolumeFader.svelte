<script lang="ts">
 import {formatControlValue} from './format';
 let {label,value,max=12,onchange}:{label:string;value:number;max?:number;onchange:(v:number)=>void}=$props();
 let editing=$state(false),text=$state('');
 $effect(()=>{if(!editing)text=formatControlValue(value);});
 function commit(){const number=Number(text);if(text.trim()&&Number.isFinite(number))onchange(clamp(number));editing=false;text=formatControlValue(value);}
 const clamp=(v:number)=>Math.min(max,Math.max(-60,v));
</script>
<div class="fader">
 <label class="readout"><input type="number" aria-label="{label} value" min={-60} {max} step={.1} value={text} onfocus={()=>{editing=true;text=formatControlValue(value);}} oninput={e=>text=e.currentTarget.value} onblur={commit} onkeydown={e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape'){text=formatControlValue(value);e.currentTarget.blur();}}}/><span>dB</span></label>
 <div class="rail"><input type="range" aria-label={label} min={-60} {max} step={.1} {value} oninput={e=>onchange(e.currentTarget.valueAsNumber)}/></div>
 <div class="adjust"><button aria-label="Lower {label}" onclick={()=>onchange(clamp(value-1))}>−</button><button aria-label="Raise {label}" onclick={()=>onchange(clamp(value+1))}>+</button></div>
 <button class="reset" onclick={()=>onchange(0)}>0 dB</button>
</div>
<style>.fader{height:100%;min-height:0;display:flex;flex-direction:column;align-items:center;gap:4px;width:76px;flex:none}.readout{position:relative;display:block;width:100%;font-size:10px;color:var(--dim)}.readout span{position:absolute;right:5px;top:50%;transform:translateY(-50%);pointer-events:none}.readout input{appearance:textfield;width:100%;min-width:0;height:36px;padding:2px 16px;background:var(--panel2);border:1px solid var(--line);border-radius:6px;text-align:center;font-size:12px}.readout input::-webkit-inner-spin-button,.readout input::-webkit-outer-spin-button{appearance:none;margin:0}.rail{flex:1;min-height:65px;display:flex;align-items:stretch;justify-content:center;width:44px}.rail input{writing-mode:vertical-lr;direction:rtl;appearance:auto;width:44px;min-height:0;margin:0;accent-color:var(--channel,var(--accent));touch-action:none}.adjust{display:flex;width:100%;gap:4px}.adjust button{width:36px;height:40px;background:var(--panel2);border-radius:6px;font-size:18px}.reset{height:40px;flex:none;width:100%;background:var(--panel2);border-radius:6px;font-size:11px}</style>
