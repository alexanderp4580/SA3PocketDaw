<script lang="ts">
 import {ui,updateProject,notify,stop} from '../appState.svelte';
 import {trackBars,type Project} from '../../store/projectModel';
 import {arrangement,arrangementBars,gridBars,blockBars,placeBlock,repeatBlock,moveBlock,removeBlock,addAllPatterns,duplicateRange,normalizeArrangement,type SongBlock} from '../../song/arrangement';
 import {compileSong} from '../../song/events';
 import {newSongHistory,rememberSong,undoSong,redoSong} from '../songHistory';
 import Sheet from '../Sheet.svelte';
 let {onroll,onexport}:{onroll:(id:string)=>void;onexport:()=>void}=$props();
 let selectedId=$state<string|null>(null),selectedBar=$state(1),history=$state(newSongHistory()),moreOpen=$state(false),rangeStart=$state(1),rangeEnd=$state(4);
 const project=$derived(ui.project!);
 const song=$derived(arrangement(project));
 const selected=$derived(song.blocks.find(b=>b.id===selectedId)??null);
 const songEnd=$derived(arrangementBars(project));
 const totalSeconds=$derived(Math.round(songEnd*240/project.bpm));
 const canExport=$derived(compileSong(project).events.length>0);
 const gridLength=$derived(gridBars(project));
 const bars=$derived(Array.from({length:gridLength},(_,i)=>i+1));
 function change(fn:(p:Project)=>Project,message='No room here. Choose an empty range.'){
  const before=$state.snapshot(project),next=fn(before);if(next===before){notify(message);return false;}
  stop();history=rememberSong(history,arrangement(before));updateProject(()=>next);return true;
 }
 function place(trackId:string,bar:number){selectedBar=bar;const before=song.blocks.length;if(change(p=>placeBlock(p,trackId,bar)))selectedId=ui.project!.arrangement!.blocks[before]!.id;}
 function select(b:SongBlock){selectedId=b.id;selectedBar=b.startBar;}
 function repeatSelected(){if(!selected)return;const before=song.blocks.length;if(change(p=>repeatBlock(p,selected!.id)))selectedId=ui.project!.arrangement!.blocks[before]!.id;}
 function restore(result:ReturnType<typeof undoSong>){if(!result.arrangement)return;stop();history=result.history;updateProject(p=>normalizeArrangement({...p,arrangement:result.arrangement!}));selectedId=null;}
 function undo(){restore(undoSong(history,song));}
 function redo(){restore(redoSong(history,song));}
 function shownLength(b:SongBlock){const next=song.blocks.filter(x=>x.trackId===b.trackId&&x.startBar>b.startBar).reduce((n,x)=>Math.min(n,x.startBar),Infinity);return Math.min(blockBars(project,b),next-b.startBar);}
 function openMore(){rangeStart=selectedBar;rangeEnd=Math.max(rangeStart,Math.min(songEnd||rangeStart,selectedBar+3));moreOpen=true;}
</script>
<section class="layout" aria-label="Song layout">
 <div class="layout-head"><div class="title"><h1>Layout</h1><span class="time" aria-label="Song length">{Math.floor(totalSeconds/60)}:{String(totalSeconds%60).padStart(2,'0')}</span></div>
  <button class="ib" aria-label="Undo layout edit" disabled={!history.past.length} onclick={undo}>↶</button><button class="ib" aria-label="Redo layout edit" disabled={!history.future.length} onclick={redo}>↷</button>
  <button class="ib export" aria-label="Export song as MP3" title="Export MP3" disabled={!canExport} onclick={onexport}>⇩</button>
  <button class="ib" aria-label="More layout actions" title="More" onclick={openMore}>⋯</button></div>
 {#if project.tracks.length}
 <div class="song-grid" style="--bars:{gridLength}">
  <div class="grid-inner">
   <div class="ruler"><div class="corner">Tracks</div>{#each bars as bar}<button class="bar-number" class:chosen={selectedBar===bar} aria-label="Select song bar {bar}" onclick={()=>{selectedBar=bar;selectedId=null;}}>{bar}</button>{/each}</div>
   {#each project.tracks as track (track.id)}
    <div class="track-row">
     <button class="track-name" aria-label="Edit {track.name} pattern" onclick={()=>onroll(track.id)}><b>{track.name}</b><span>{trackBars(track,project.bars)} bars</span></button>
     <div class="lane">
      {#each bars as bar}<button class="empty-cell" aria-label="Place {track.name} at bar {bar}" style="grid-column:{bar}" onclick={()=>place(track.id,bar)}></button>{/each}
      {#each song.blocks.filter(b=>b.trackId===track.id) as block (block.id)}
       <button class="song-block" class:selected={block.id===selectedId} style="grid-column:{block.startBar} / span {shownLength(block)}" aria-label="{track.name} block at bar {block.startBar}" aria-pressed={block.id===selectedId} onclick={()=>select(block)}><span>{track.name}</span>{#if block.id===selectedId}<small>{shownLength(block)} {shownLength(block)===1?'bar':'bars'}</small>{/if}</button>
      {/each}
     </div>
    </div>
   {/each}
   {#if ui.playing||ui.step>0}<div class="playhead" style="left:calc(96px + {ui.step/16} * 52px)"></div>{/if}
  </div>
 </div>
 {:else}<div class="empty note">Create a sound and add piano-roll notes on Tracks, then place its pattern here.</div>{/if}
 {#if selected}
  <div class="strip" aria-label="Selected block actions">
   <button class="btn" aria-label="Edit pattern" onclick={()=>onroll(selected.trackId)}>Edit</button>
   <button class="btn" aria-label="Repeat selected block" onclick={repeatSelected}>Repeat</button>
   <button class="btn" aria-label="Move selected block left" onclick={()=>change(p=>moveBlock(p,selected.id,selected.startBar-1))}>←</button>
   <button class="btn" aria-label="Move selected block right" onclick={()=>change(p=>moveBlock(p,selected.id,selected.startBar+1))}>→</button>
   <button class="btn danger" aria-label="Remove selected block" onclick={()=>{if(change(p=>removeBlock(p,selected.id)))selectedId=null;}}>Remove</button>
  </div>
 {/if}
</section>
{#if moreOpen}<Sheet title="More" onclose={()=>moreOpen=false}>
 <button class="btn wide" disabled={!project.tracks.length} onclick={()=>{if(change(p=>addAllPatterns(p,selectedBar)))moreOpen=false;}}>Add all patterns at bar {selectedBar}</button>
 <h2 class="sub">Duplicate range</h2>
 <div class="row"><label>From bar<input class="field" aria-label="Duplicate from bar" type="number" min="1" max={Math.max(1,songEnd)} bind:value={rangeStart}/></label><label>To bar<input class="field" aria-label="Duplicate to bar" type="number" min={rangeStart} max={Math.max(1,songEnd)} bind:value={rangeEnd}/></label></div>
 <p class="note">Copy whole patterns into the bars immediately after this range. The destination needs empty space.</p>
 <button class="btn pri" disabled={!song.blocks.length} onclick={()=>{if(change(p=>duplicateRange(p,rangeStart,rangeEnd),'Choose a range containing whole patterns and an empty destination.'))moreOpen=false;}}>Duplicate</button>
</Sheet>{/if}
<style>
 .ib{height:44px;min-width:44px;border:0;border-radius:10px;background:var(--panel2);color:var(--text);font-size:16px;display:grid;place-items:center;padding:0 10px;}.ib:disabled{opacity:.4;}
 .layout{display:flex;flex-direction:column;overflow:hidden;min-height:0;}
 .layout-head{display:flex;align-items:center;gap:6px;padding:10px 12px 8px;}.title{flex:1;min-width:0;display:flex;flex-direction:column;}.layout-head h1{font-size:18px;margin:0;}.time{font-size:12px;color:var(--dim);font-variant-numeric:tabular-nums;}.export{color:var(--sa3);font-size:22px;}
 .song-grid{flex:1;min-height:0;overflow:auto;touch-action:pan-x pan-y;overscroll-behavior:contain;border-block:1px solid var(--line);}
 .grid-inner{width:calc(96px + var(--bars)*52px);min-height:100%;position:relative;}
 .ruler{height:36px;display:flex;position:sticky;top:0;z-index:4;background:var(--panel);}
 .corner{position:sticky;left:0;width:96px;flex:none;background:var(--panel);padding:11px 12px;font-size:11px;z-index:5;color:var(--dim);}
 .bar-number{width:52px;flex:none;border:0;border-right:1px solid var(--line);background:var(--panel);color:var(--dim);font-size:12px;}.bar-number.chosen{color:var(--sa3);background:var(--sa3bg);}
 .track-row{display:flex;height:60px;border-bottom:1px solid var(--line);}
 .track-name{position:sticky;left:0;z-index:3;width:96px;flex:none;display:flex;flex-direction:column;justify-content:center;gap:4px;text-align:left;padding:8px 12px;background:var(--panel);border:0;border-right:1px solid var(--line);color:var(--text);overflow:hidden;}.track-name b{max-width:100%;text-overflow:ellipsis;overflow:hidden;white-space:nowrap;font-size:12px;}.track-name span{font-size:10px;color:var(--dim);}
 .lane{display:grid;grid-template-columns:repeat(var(--bars),52px);grid-template-rows:60px;position:relative;}
 .empty-cell{grid-row:1;border:0;border-right:1px solid var(--line);background:transparent;}
 .song-block{grid-row:1;margin:6px 3px;border-radius:12px;z-index:1;display:flex;flex-direction:column;justify-content:center;gap:2px;align-items:flex-start;padding:6px 8px;color:var(--sa3);background:var(--sa3bg);border:1px solid var(--sa3);min-width:0;overflow:hidden;}
 .song-block.selected{outline:2px solid var(--text);outline-offset:-3px;}.song-block span{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;}.song-block small{font-size:9px;opacity:.8;}
 .playhead{position:absolute;top:36px;bottom:0;border-left:2px solid var(--accent);pointer-events:none;z-index:2;}
 .strip{display:flex;gap:5px;padding:8px 10px;background:var(--panel);}.strip .btn{flex:1;min-width:0;padding:0 6px;font-size:12px;}
 .wide{width:100%;}.sub{font-size:13px;margin:14px 0 6px;color:var(--dim);}
 .empty{flex:1;padding:24px;}
</style>
