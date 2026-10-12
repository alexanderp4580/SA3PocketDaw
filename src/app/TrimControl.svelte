<script lang="ts" module>
 import type {Trim} from '../audio/trim';
 /** `pcm`+`sampleRate` (the whole source) let the waveform redraw per-column at any zoom; without them the fixed `peaks` are shown. */
 export interface ChopView {duration:number;peaks?:Float32Array;pcm?:Float32Array;sampleRate?:number;trim:Trim;busy?:boolean;error?:string}
</script>
<script lang="ts">
 import Waveform from './Waveform.svelte';
 import {MIN_KEPT_SEC} from '../audio/trim';
 import {clampWindow,dragHandle,memoColumnPeaks,sameTrim,fixedPeaksWindow,fullWindow,minSpan,panBy,pinchScale,pinchWindow,pxToSec,secToPx,zoomAbout,type Win} from './chopView';
 let {view,oninput,oncommit,onreset,disabled=false,name='sound'}:{view:ChopView;oninput:(t:Trim)=>void;oncommit:(t:Trim)=>void;onreset:()=>void;disabled?:boolean;name?:string}=$props();
 const FALLBACK_W=300,KEY_PX=1;
 let plotW=$state(0),win=$state<Win|null>(null);
 const w=$derived(plotW>0?plotW:FALLBACK_W);
 const cur=$derived(clampWindow(win??fullWindow(view.duration),view.duration,w));
 const span=$derived(cur.end-cur.start);
 const zoomed=$derived(span<view.duration-1e-9);
 const atMax=$derived(span<=minSpan(view.duration,w)+1e-9);
 const cols=$derived(Math.max(1,Math.min(600,Math.round(w))));
 const peaksOf=memoColumnPeaks();
 const cp=$derived(view.pcm&&view.sampleRate&&view.duration>0?peaksOf(view.pcm,view.sampleRate,cur,cols):null);
 const fixed=$derived(!cp&&view.peaks?fixedPeaksWindow(view.peaks,view.duration,cur):undefined);
 const full=$derived(view.trim.start<=0&&view.trim.end>=view.duration);
 const px=(t:number)=>Math.max(0,Math.min(w,secToPx(t,cur,w)));
 const sx=$derived(px(view.trim.start)),ex=$derived(px(view.trim.end));
 const sOff=$derived(view.trim.start<cur.start||view.trim.start>cur.end),eOff=$derived(view.trim.end<cur.start||view.trim.end>cur.end);
 let box:HTMLDivElement|undefined=$state();
 $effect(()=>{view.duration;win=null;});
 const sec=(v:number)=>v.toFixed(3);
 const setWin=(next:Win)=>{win=clampWindow(next,view.duration,w);};
 const zoom=(f:number)=>setWin(zoomAbout(cur,f,(cur.start+cur.end)/2,view.duration,w));
 const pan=(dir:number)=>setWin(panBy(cur,dir*span*.25,view.duration));
 const localX=(e:PointerEvent)=>e.clientX-(box?.getBoundingClientRect().left??0);

 // Handle drag: continuous, commits on release.
 let drag:{id:number;handle:'start'|'end';grab:number;trim:Trim;start:Trim;moved:boolean}|null=null;
 function hdown(e:PointerEvent,handle:'start'|'end'){
  if(disabled)return;e.preventDefault();e.stopPropagation();
  if(drag||(handle==='start'?sOff:eOff))return;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  const line=handle==='start'?sx:ex;
  drag={id:e.pointerId,handle,grab:localX(e)-line,trim:view.trim,start:view.trim,moved:false};
 }
 function hmove(e:PointerEvent){
  if(!drag||drag.id!==e.pointerId)return;
  const next=dragHandle(drag.handle,drag.trim,localX(e),cur,w,view.duration,drag.grab);
  if(sameTrim(next,drag.trim))return;
  drag.trim=next;drag.moved=true;oninput(next);
 }
 function hup(e:PointerEvent){
  if(!drag||drag.id!==e.pointerId)return;
  e.stopPropagation();
  const d=drag;drag=null;if(d.moved&&!sameTrim(d.trim,d.start))oncommit(d.trim);
 }
 function hkey(e:KeyboardEvent,handle:'start'|'end'){
  if(disabled||(e.key!=='ArrowLeft'&&e.key!=='ArrowRight'))return;
  e.preventDefault();
  const dt=(e.key==='ArrowLeft'?-1:1)*KEY_PX*span/w*(e.shiftKey?10:1),from=handle==='start'?view.trim.start:view.trim.end;
  const next=dragHandle(handle,view.trim,secToPx(from+dt,cur,w),cur,w,view.duration);
  if(sameTrim(next,view.trim))return;
  oninput(next);oncommit(next);
 }

 // Empty-waveform gestures: one finger pans when zoomed, two fingers pinch.
 const pts=new Map<number,number>();
 let pan0:{x:number;win:Win}|null=null,pinch0:{dist:number;centre:number;win:Win}|null=null;
 function wdown(e:PointerEvent){
  if(disabled)return;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  pts.set(e.pointerId,localX(e));
  if(pts.size===1)pan0={x:localX(e),win:cur};
  else if(pts.size===2)seedPinch();
 }
 function seedPinch(){
  const [a,b]=[...pts.values()] as [number,number];
  pan0=null;pinch0={dist:Math.abs(a-b),centre:pxToSec((a+b)/2,cur,w),win:cur};
 }
 function wmove(e:PointerEvent){
  if(!pts.has(e.pointerId))return;
  pts.set(e.pointerId,localX(e));
  if(pinch0&&pts.size>=2){
   const [a,b]=[...pts.values()] as [number,number];
   setWin(pinchWindow(pinch0.win,pinchScale(pinch0.dist,Math.abs(a-b)),pinch0.centre,(a+b)/2/w,view.duration,w));
  }else if(pan0&&zoomed){
   const dt=-(localX(e)-pan0.x)/w*(pan0.win.end-pan0.win.start);
   setWin(panBy(pan0.win,dt,view.duration));
  }
 }
 function wup(e:PointerEvent){
  if(!pts.delete(e.pointerId))return;
  pinch0=null;
  if(pts.size>=2)seedPinch();
  else if(pts.size===1){const [x]=[...pts.values()] as [number];pan0={x,win:cur};}else pan0=null;
 }
</script>
<fieldset class="chop" {disabled}>
 <legend class="sr-only">Chop {name}</legend>
 <div class="st">Chop</div>
 <div class="plot">
  <div class="wave" bind:this={box} bind:clientWidth={plotW} style="touch-action:none" role="presentation" onpointerdown={wdown} onpointermove={wmove} onpointerup={wup} onpointercancel={wup}>
   <div class="inner">
    {#if cp}<Waveform peaks={undefined} min={cp.min} max={cp.max} />{:else}<Waveform peaks={fixed} />{/if}
    <i class="cut l" style="width:{sx}px"></i><i class="cut r" style="width:{w-ex}px"></i>
   </div>
   <div class="handle s" class:off={sOff} style="left:{sx}px;touch-action:none" role="slider" tabindex={disabled?-1:0} aria-label="Chop start" aria-valuemin={0} aria-valuemax={view.duration} aria-valuenow={view.trim.start} aria-valuetext="{sec(view.trim.start)} s" onpointerdown={e=>hdown(e,'start')} onpointermove={hmove} onpointerup={hup} onpointercancel={hup} onkeydown={e=>hkey(e,'start')}><b></b></div>
   <div class="handle e" class:off={eOff} style="left:{ex}px;touch-action:none" role="slider" tabindex={disabled?-1:0} aria-label="Chop end" aria-valuemin={0} aria-valuemax={view.duration} aria-valuenow={view.trim.end} aria-valuetext="{sec(view.trim.end)} s" onpointerdown={e=>hdown(e,'end')} onpointermove={hmove} onpointerup={hup} onpointercancel={hup} onkeydown={e=>hkey(e,'end')}><b></b></div>
  </div>
 </div>
 <div class="zoombar">
  <span class="view">{sec(cur.start)}–{sec(cur.end)} s</span>
  <button class="btn" aria-label="Pan left" disabled={!zoomed||disabled||cur.start<=0} onclick={()=>pan(-1)}>◀</button>
  <button class="btn" aria-label="Pan right" disabled={!zoomed||disabled||cur.end>=view.duration} onclick={()=>pan(1)}>▶</button>
  <button class="btn" aria-label="Zoom out" disabled={!zoomed||disabled} onclick={()=>zoom(.5)}>−</button>
  <button class="btn" aria-label="Zoom in" disabled={atMax||disabled} onclick={()=>zoom(2)}>+</button>
  <button class="btn" disabled={!zoomed||disabled} onclick={()=>{win=null;}}>Fit</button>
 </div>
 <div class="read">
  <span>Start <b>{sec(view.trim.start)} s</b></span>
  <span>End <b>{sec(view.trim.end)} s</b></span>
  <span>Kept <b>{sec(view.trim.end-view.trim.start)} s</b> of {sec(view.duration)} s</span>
  {#if view.busy}<span class="busy" role="status">Updating sound…</span>{/if}
 </div>
 <div class="hint">Drag the handles; pinch or use +/− to zoom; drag the waveform to pan when zoomed. Minimum {Math.round(MIN_KEPT_SEC*1000)} ms.</div>
 {#if view.error}<div class="note bad" role="alert">{view.error} The previous sound is kept.</div>{/if}
 <div class="btnrow"><button class="btn" disabled={full||disabled} onclick={onreset}>Reset chop</button></div>
</fieldset>
<style>
 .chop{border:0;padding:0;margin:0;min-width:0;}
 .sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);}
 .plot{padding:0 22px;}
 .wave{position:relative;height:88px;background:#0e1014;border-radius:2px;user-select:none;-webkit-user-select:none;}
 .inner{position:absolute;inset:0;overflow:hidden;pointer-events:none;}
 .cut{position:absolute;top:0;bottom:0;background:#0009;pointer-events:none;}
 .cut.l{left:0;}
 .cut.r{right:0;}
 .handle{position:absolute;top:0;bottom:0;width:44px;cursor:ew-resize;outline:none;}
 .handle.s{margin-left:-28px;}
 .handle.e{margin-left:-16px;}
 .handle b{position:absolute;top:0;bottom:0;width:3px;background:var(--sa3);border-radius:2px;}
 .handle.s b{left:26px;}
 .handle.e b{left:14px;}
 .handle::after{content:'';position:absolute;top:50%;width:14px;height:28px;margin-top:-14px;background:var(--sa3);border-radius:4px;opacity:.9;}
 .handle.s::after{left:13px;}
 .handle.e::after{left:17px;}
 .handle.off{opacity:.45;}
 .handle:focus-visible::after{outline:2px solid #fff;}
 .zoombar{display:flex;gap:6px;align-items:center;margin-top:8px;flex-wrap:wrap;}
 .zoombar .view{margin-right:auto;flex:1 1 100%;min-width:0;font-size:13px;color:var(--dim);font-variant-numeric:tabular-nums;}
 .zoombar .btn{min-width:44px;min-height:44px;}
 .read{margin-top:8px;font-size:14px;color:var(--dim);display:flex;gap:4px 14px;flex-wrap:wrap;align-items:baseline;}
 .read b{color:inherit;font-variant-numeric:tabular-nums;}
 .busy{margin-left:auto;color:var(--sa3);}
 .hint{margin-top:6px;font-size:12px;color:var(--dim);}
</style>
