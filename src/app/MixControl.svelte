<script lang="ts">
 let {label,value,min,max,step=1,unit='',onchange}:{label:string;value:number;min:number;max:number;step?:number;unit?:string;onchange:(v:number)=>void}=$props();
 let editing=$state(false),text=$state('');
 $effect(()=>{const current=value;if(!editing)text=String(current);});
 function commit(){const number=Number(text);if(text.trim()&&Number.isFinite(number))onchange(Math.max(min,Math.min(max,number)));editing=false;text=String(value);}
</script>
<label class="control"><span>{label}</span><input type="number" aria-label="{label} value" {min} {max} {step} value={text} onfocus={()=>{editing=true;text=String(value);}} oninput={e=>text=e.currentTarget.value} onblur={commit} onkeydown={e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape'){text=String(value);e.currentTarget.blur();}}}/><small>{unit}</small><input class="range" type="range" aria-label={label} {min} {max} {step} {value} oninput={e=>onchange(e.currentTarget.valueAsNumber)}/></label>
<style>.control{display:grid;grid-template-columns:minmax(0,1fr) 90px 30px;gap:6px;align-items:center;margin:8px 0;font-size:13px}.control input[type=number]{min-width:0;width:100%;height:40px;color:var(--text);background:var(--panel2);border:1px solid var(--line);border-radius:6px;padding:4px 8px}.range{grid-column:1/-1;min-width:0;width:100%;height:32px;accent-color:var(--sa3)}small{font-size:11px;color:var(--dim)}</style>
