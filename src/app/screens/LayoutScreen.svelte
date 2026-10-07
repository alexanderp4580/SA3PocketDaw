<script lang="ts">
 import {ui,updateProject,notify,stop} from '../appState.svelte';
 import {engine} from '../services';
 import {trackBars,type Project} from '../../store/projectModel';
 import {arrangement,blockBars,placeBlock,repeatBlock,moveBlock,removeBlock,resizeSong,addAllPatterns,duplicateRange,normalizeArrangement,type SongBlock} from '../../song/arrangement';
 import {compileSong} from '../../song/events';
 import {newSongHistory,rememberSong,undoSong,redoSong} from '../songHistory';
 import Sheet from '../Sheet.svelte';
 let {onroll,onexport}:{onroll:(id:string)=>void;onexport:()=>void}=$props();
 let selectedId=$state<string|null>(null),selectedBar=$state(1),history=$state(newSongHistory()),repeat=$state(engine.songRepeat),trimTo=$state<number|null>(null),lengthOpen=$state(false),lengthValue=$state(16),rangeOpen=$state(false),rangeStart=$state(1),rangeEnd=$state(4);
 const project=$derived(ui.project!);
 const song=$derived(arrangement(project));
 const selected=$derived(song.blocks.find(b=>b.id===selectedId)??null);
 const duration=$derived(song.bars*240/project.bpm);
 const totalSeconds=$derived(Math.round(duration));
 const canExport=$derived(compileSong(project).events.length>0);
 const bars=$derived(Array.from({length:song.bars},(_,i)=>i+1));
 function change(fn:(p:Project)=>Project,message='No room here. Choose an empty range or add bars.'){
  const before=$state.snapshot(project),next=fn(before);if(next===before){notify(message);return false;}
  stop();history=rememberSong(history,arrangement(before));updateProject(()=>next);return true;
 }
 function place(trackId:string,bar:number){selectedBar=bar;const before=song.blocks.length;if(change(p=>placeBlock(p,trackId,bar)))selectedId=ui.project!.arrangement!.blocks[before]!.id;}
 function select(b:SongBlock){selectedId=b.id;selectedBar=b.startBar;}
 function repeatSelected(){if(!selected)return;const before=song.blocks.length;if(change(p=>repeatBlock(p,selected!.id)))selectedId=ui.project!.arrangement!.blocks[before]!.id;}
 function undo(){const result=undoSong(history,song);if(!result.arrangement)return;stop();history=result.history;updateProject(p=>normalizeArrangement({...p,arrangement:result.arrangement!}));selectedId=null;}
 function redo(){const result=redoSong(history,song);if(!result.arrangement)return;stop();history=result.history;updateProject(p=>normalizeArrangement({...p,arrangement:result.arrangement!}));selectedId=null;}
 function resize(n:number){if(n===song.bars){lengthOpen=false;return;}const next=resizeSong($state.snapshot(project),n);if(next.arrangement?.bars!==Math.max(1,Math.min(256,n))){lengthOpen=false;trimTo=n;return;}change(p=>resizeSong(p,n));selectedBar=Math.min(selectedBar,song.bars);lengthOpen=false;}
 function toggleRepeat(){repeat=!repeat;engine.setSongRepeat(repeat);}
 function shownLength(b:SongBlock){const next=song.blocks.filter(x=>x.trackId===b.trackId&&x.startBar>b.startBar).reduce((n,x)=>Math.min(n,x.startBar),song.bars+1);return Math.min(blockBars(project,b),next-b.startBar,song.bars-b.startBar+1);}
</script>
<section class="layout" aria-label="Song layout">
 <div class="layout-head"><h1>Layout</h1><button class="ib" aria-label="Song length" onclick={()=>{lengthValue=song.bars;lengthOpen=true;}}>{song.bars} bars</button><button class="ib export" aria-label="Export song as MP3" title="Export MP3" disabled={!canExport} onclick={onexport}>⇩</button></div>
 <div class="quick"><button class="btn" aria-label="Add 4 song bars" disabled={song.bars>=256} onclick={()=>resize(song.bars+4)}>+4</button><button class="btn" aria-label="Add 8 song bars" disabled={song.bars>=256} onclick={()=>resize(song.bars+8)}>+8</button><button class="btn" aria-label="Add 16 song bars" disabled={song.bars>=256} onclick={()=>resize(song.bars+16)}>+16</button><button class="ib" class:on={repeat} aria-pressed={repeat} aria-label="Repeat song" onclick={toggleRepeat}>⟲</button><span class="time">{Math.floor(totalSeconds/60)}:{String(totalSeconds%60).padStart(2,'0')}</span></div>
 {#if project.tracks.length}
 <div class="song-grid" style="--bars:{song.bars}">
  <div class="grid-inner">
   <div class="ruler"><div class="corner">Tracks</div>{#each bars as bar}<button class="bar-number" class:chosen={selectedBar===bar} aria-label="Select song bar {bar}" onclick={()=>{selectedBar=bar;selectedId=null;}}>{bar}</button>{/each}</div>
   {#each project.tracks as track (track.id)}
    <div class="track-row">
     <button class="track-name" aria-label="Edit {track.name} pattern" onclick={()=>onroll(track.id)}><b>{track.name}</b><span>{trackBars(track,project.bars)} bars</span></button>
     <div class="lane">
      {#each bars as bar}<button class="empty-cell" aria-label="Place {track.name} at bar {bar}" style="grid-column:{bar}" onclick={()=>place(track.id,bar)}></button>{/each}
      {#each song.blocks.filter(b=>b.trackId===track.id) as block (block.id)}
       <button class="song-block" class:selected={block.id===selectedId} style="grid-column:{block.startBar} / span {shownLength(block)}" aria-label="{track.name} block at bar {block.startBar}" aria-pressed={block.id===selectedId} onclick={()=>select(block)}><span>{track.name}</span><small>{shownLength(block)} {shownLength(block)===1?'bar':'bars'}</small></button>
      {/each}
     </div>
    </div>
   {/each}
   {#if ui.playing||ui.step>0}<div class="playhead" style="left:calc(96px + {ui.step/16} * 56px)"></div>{/if}
  </div>
 </div>
 {:else}<div class="empty note">Create a sound and add piano-roll notes on Tracks, then place its pattern here.</div>{/if}
 <div class="actions">
  <div class="action-info">{selected?project.tracks.find(t=>t.id===selected.trackId)?.name+' · bar '+selected.startBar:'Tap an empty bar to add a pattern'}</div>
  <div class="edit-row">
   <button class="ib" aria-label="Undo layout edit" disabled={!history.past.length} onclick={undo}>↶</button><button class="ib" aria-label="Redo layout edit" disabled={!history.future.length} onclick={redo}>↷</button>
   <button class="ib" aria-label="Move selected block left" disabled={!selected} onclick={()=>selected&&change(p=>moveBlock(p,selected!.id,selected!.startBar-1))}>←</button>
   <button class="ib" aria-label="Move selected block right" disabled={!selected} onclick={()=>selected&&change(p=>moveBlock(p,selected!.id,selected!.startBar+1))}>→</button>
   <button class="ib" aria-label="Repeat selected block" disabled={!selected} onclick={repeatSelected}>⧉</button>
   <button class="ib" aria-label="Remove selected block" disabled={!selected} onclick={()=>{if(selected&&change(p=>removeBlock(p,selected!.id)))selectedId=null;}}>⌫</button>
  </div>
  <div class="quick bottom"><button class="btn" disabled={!project.tracks.length} onclick={()=>change(p=>addAllPatterns(p,selectedBar))}>Add all · bar {selectedBar}</button><button class="btn" disabled={!song.blocks.length} onclick={()=>{rangeStart=selectedBar;rangeEnd=Math.min(song.bars,selectedBar+3);rangeOpen=true;}}>Duplicate range</button></div>
 </div>
</section>
{#if lengthOpen}<Sheet title="Song length" onclose={()=>lengthOpen=false}><label class="note">Bars<input class="field" aria-label="Song bars" type="number" min="1" max="256" bind:value={lengthValue}/></label><div class="btnrow"><button class="btn" disabled={lengthValue<=1} onclick={()=>lengthValue=Math.max(1,lengthValue-1)}>−1</button><button class="btn" disabled={lengthValue>=256} onclick={()=>lengthValue=Math.min(256,lengthValue+1)}>+1</button><button class="btn pri" disabled={!Number.isInteger(lengthValue)||lengthValue<1||lengthValue>256} onclick={()=>resize(lengthValue)}>Apply</button></div><p class="note">Up to 256 bars. Changing song length keeps your piano-roll patterns.</p></Sheet>{/if}
{#if trimTo!==null}<Sheet title="Shorten song?" onclose={()=>trimTo=null}><p class="note">Blocks beyond bar {trimTo} will be removed from the layout. Your track patterns stay saved.</p><div class="btnrow"><button class="btn" onclick={()=>trimTo=null}>Cancel</button><button class="btn danger" onclick={()=>{change(p=>resizeSong(p,trimTo!,true));trimTo=null;lengthOpen=false;selectedId=null;}}>Shorten song</button></div></Sheet>{/if}
{#if rangeOpen}<Sheet title="Duplicate range" onclose={()=>rangeOpen=false}><div class="row"><label>From bar<input class="field" aria-label="Duplicate from bar" type="number" min="1" max={song.bars} bind:value={rangeStart}/></label><label>To bar<input class="field" aria-label="Duplicate to bar" type="number" min={rangeStart} max={song.bars} bind:value={rangeEnd}/></label></div><p class="note">Copy whole patterns into the bars immediately after this range. The destination needs empty space.</p><button class="btn pri" onclick={()=>{if(change(p=>duplicateRange(p,rangeStart,rangeEnd),'Choose a range containing whole patterns and an empty destination.'))rangeOpen=false;}}>Duplicate</button></Sheet>{/if}
<style>
 .ib{height:44px;min-width:44px;border:0;border-radius:10px;background:var(--panel2);color:var(--text);font-size:16px;display:grid;place-items:center;padding:0 10px;}.ib.on{color:var(--sa3);background:var(--sa3bg);}
 .layout{display:flex;flex-direction:column;overflow:hidden;min-height:0;}
 .layout-head{display:flex;align-items:center;gap:8px;padding:10px 12px 6px;}.layout-head h1{font-size:18px;margin:0;flex:1;}.export{color:var(--sa3);font-size:24px;}
 .quick{display:flex;align-items:center;gap:6px;padding:6px 12px 10px;}.quick .btn{min-width:0;flex:1;padding:0 8px;}.time{font-size:12px;color:var(--dim);font-variant-numeric:tabular-nums;}
 .song-grid{flex:1;min-height:0;overflow:auto;touch-action:pan-x pan-y;overscroll-behavior:contain;border-block:1px solid var(--line);}
 .grid-inner{width:calc(96px + var(--bars)*56px);min-height:100%;position:relative;}
 .ruler{height:40px;display:flex;position:sticky;top:0;z-index:4;background:var(--panel);}
 .corner{position:sticky;left:0;width:96px;flex:none;background:var(--panel);padding:12px;font-size:11px;z-index:5;color:var(--dim);}
 .bar-number{width:56px;flex:none;border:0;border-right:1px solid var(--line);background:var(--panel);color:var(--dim);font-size:12px;}.bar-number.chosen{color:var(--sa3);background:var(--sa3bg);}
 .track-row{display:flex;height:68px;border-bottom:1px solid var(--line);}
 .track-name{position:sticky;left:0;z-index:3;width:96px;flex:none;display:flex;flex-direction:column;justify-content:center;gap:5px;text-align:left;padding:8px 10px;background:var(--panel);border:0;border-right:1px solid var(--line);color:var(--text);overflow:hidden;}.track-name b{max-width:100%;text-overflow:ellipsis;overflow:hidden;white-space:nowrap;font-size:12px;}.track-name span{font-size:10px;color:var(--dim);}
 .lane{display:grid;grid-template-columns:repeat(var(--bars),56px);grid-template-rows:68px;position:relative;}
 .empty-cell{grid-row:1;border:0;border-right:1px solid var(--line);background:transparent;}
 .song-block{grid-row:1;margin:6px 2px;border-radius:8px;z-index:1;display:flex;flex-direction:column;justify-content:center;gap:4px;align-items:flex-start;padding:6px;color:var(--sa3);background:var(--sa3bg);border:1px solid var(--sa3);min-width:0;overflow:hidden;}
 .song-block.selected{outline:2px solid var(--text);outline-offset:-3px;}.song-block span{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;}.song-block small{font-size:9px;opacity:.8;}
 .playhead{position:absolute;top:40px;bottom:0;border-left:2px solid var(--accent);pointer-events:none;z-index:2;}
 .actions{padding:8px 10px;background:var(--panel);}.action-info{font-size:11px;color:var(--dim);margin:0 0 6px;min-height:14px;}.edit-row{display:flex;gap:5px;}.edit-row .ib{flex:1;min-width:0;}.bottom{padding:8px 0 0;}.bottom .btn{font-size:11px;}
 .empty{flex:1;padding:24px;}
</style>
