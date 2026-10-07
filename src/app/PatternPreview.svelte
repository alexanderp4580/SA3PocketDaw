<script lang="ts">
 import type {Track} from '../store/projectModel';
 import {noteVelocity} from '../store/projectModel';
 import {previewNotes} from './patternPreview';
 let {track,timeline,legacyBars,color}:{track:Track;timeline:number;legacyBars:number;color:string}=$props();
 const preview=$derived(previewNotes(track,timeline,legacyBars));
</script>
<svg viewBox="0 0 {preview.total*8} {preview.rows*4}" preserveAspectRatio="none" aria-hidden="true">
 {#each Array.from({length:preview.rows+1},(_,i)=>i) as row}<line x1="0" x2={preview.total*8} y1={row*4} y2={row*4} stroke="#ffffff12" stroke-width=".3" />{/each}
 {#each Array.from({length:timeline*4+1},(_,i)=>i) as beat}<line x1={beat*32} x2={beat*32} y1="0" y2={preview.rows*4} stroke={beat%4===0?'#ffffff38':'#ffffff12'} stroke-width={beat%4===0?1:.4} />{/each}
 {#each preview.notes as note}<rect x={note.start*8+.5} y={note.y*4+.4} width={Math.max(1,note.length*8-1)} height="3.2" rx=".6" fill={color} opacity={.45+.55*noteVelocity(note)/127} />{/each}
</svg>
{#if !preview.notes.length}<span class="hint">Tap to add notes</span>{/if}
<style>svg{display:block;width:100%;height:100%;}.hint{position:absolute;inset:0;display:grid;place-items:center;font-size:11px;color:var(--dim);}</style>
