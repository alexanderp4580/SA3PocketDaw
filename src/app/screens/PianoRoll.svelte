<script lang="ts">
  import { noteVelocity, DEFAULT_VELOCITY, type Bars, type Track } from '../../store/projectModel';
  import Sheet from '../Sheet.svelte';
  import {ui,play,pause,stop} from '../appState.svelte';
  import {loopRange} from '../../store/projectModel';
  import { midiToName } from '../../audio/pitch';
  import {
    GRIDS,
    displayName,
    findTarget,
    infoLine,
    jumpNote,
    movePitch,
    moveStep,
    snapStep,
    stepsLabel,
    velocityFromY,
    type KeyFilter,
    type Scale,
  } from '../pianoroll/cursor';
  import { changeLength, changeVelocity, deleteTarget, place, clearTrackNotes } from '../pianoroll/edit';
  import {
    CELL_W,
    KEY_W,
    ROW_H,
    RULER_H,
    gridHeight,
    gridWidth,
    isBlackKey,
    midiToY,
    noteRect,
    pointToCell,
    revealScroll,
    rowMidis,
    rulerLabels,
    stepToX,
  } from '../pianoroll/geometry';
  import { emptyHistory, record, redo as redoH, undo as undoH, type History } from '../pianoroll/history';
  import { keyboardLayout, shiftBase } from '../pianoroll/keyboard';
  import { createRepeater } from '../pianoroll/repeater';

  let {
    track,
    bars,
    playhead,
    onChange,
    onAudition,
    onBack,
    onTrackBars,
    onSolo,
    onOpenGenerate,
    onOpenInstrument,
    sampleName,
    keyRoot = 0,
    scale = 'major',
  }: {
    track: Track;
    bars: number;
    playhead: () => number;
    onChange: (track: Track) => void;
    onAudition: (midi: number, velocity?: number) => void;
    onBack: () => void;
    onTrackBars:(n:number)=>void;
    onSolo:()=>void;
    onOpenGenerate?: () => void;
    onOpenInstrument?:()=>void;
    sampleName?: string;
    keyRoot?: number;
    scale?: Scale;
  } = $props();

  const rows = rowMidis();
  const height = gridHeight();

  let cursor = $state({ step: 0, midi: 60 });
  let grid = $state(2);
  let newLength = $state(2);
  let defaultVelocity = $state(DEFAULT_VELOCITY);
  let inKeyOn = $state(true);
  let mode = $state<'dpad' | 'keys'>('dpad');
  let gridOpen = $state(false);
  let lengthOpen=$state(false);
  const range=$derived(ui.project?loopRange(ui.project):{startBar:1,endBar:bars});
  let kbBase = $state(60);
  let history = $state<History<Track['notes']>>(emptyHistory());
  let head = $state(0);
  let scroller: HTMLDivElement | undefined = $state();
  let cellsEl: HTMLDivElement | undefined = $state();
  let velEl: HTMLDivElement | undefined = $state();
  let velDrag = false;
  let historyTrackId: string | undefined;

  const barCount = $derived(bars as Bars);
  const total = $derived(bars * 16);
  const repeatSegments=$derived.by(()=>{const count=range.endBar-range.startBar+1,start=(range.startBar-1)%bars;if(count>=bars)return [{start:0,bars}];if(start+count<=bars)return [{start,bars:count}];return [{start,bars:bars-start},{start:0,bars:count-(bars-start)}];});
  const width = $derived(gridWidth(bars));
  const filter = $derived<KeyFilter | undefined>(inKeyOn ? { keyRoot, scale } : undefined);
  const ctx = $derived({ track, bars: barCount, cell: { step: cursor.step, midi: cursor.midi }, grid });
  const target = $derived(findTarget(track.notes, ctx.cell, grid));
  const shownVelocity = $derived(target ? noteVelocity(target) : defaultVelocity);
  const info = $derived(infoLine(ctx.cell, target, newLength, defaultVelocity));
  const labels = $derived(rulerLabels(bars));
  const kb = $derived(keyboardLayout(kbBase));
  const lines = $derived(
    `repeating-linear-gradient(to bottom, transparent 0 ${ROW_H - 1}px, rgba(255,255,255,0.05) ${ROW_H - 1}px ${ROW_H}px),` +
      `linear-gradient(to right, rgba(255,255,255,0.28) 1px, transparent 1px) 0 0 / ${CELL_W * 16}px 100% repeat-x,` +
      `linear-gradient(to right, rgba(255,255,255,0.12) 1px, transparent 1px) 0 0 / ${CELL_W * 4}px 100% repeat-x,` +
      `linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px) 0 0 / ${CELL_W}px 100% repeat-x`,
  );

  const repeater = createRepeater({
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  });

  $effect(() => {
    if (historyTrackId !== undefined && track.id !== historyTrackId) history = emptyHistory();
    historyTrackId = track.id;
  });

  $effect(() => {
    let raf = 0;
    const loop = () => {
      const p = playhead() % total;
      if (p !== head) head = p;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      repeater.stop();
    };
  });

  $effect(()=>{if(cursor.step>=total)cursor.step=snapStep(total-1,grid,total);});

  $effect(() => {
    if (!scroller) return;
    const x = stepToX(cursor.step);
    const y = midiToY(cursor.midi);
    scroller.scrollLeft = revealScroll(x, grid * CELL_W, scroller.scrollLeft, scroller.clientWidth - KEY_W, 8);
    scroller.scrollTop = revealScroll(y, ROW_H, scroller.scrollTop, scroller.clientHeight - RULER_H, 0);
  });

  function commit(next: Track, rec = true) {
    if (next === track) return;
    if (rec) history = record(history, track.notes);
    onChange(next);
  }

  function doUndo() {
    const u = undoH(history, track.notes);
    if (!u) return;
    history = u.history;
    onChange({...track,notes:u.value});
  }

  function doRedo() {
    const r = redoH(history, track.notes);
    if (!r) return;
    history = r.history;
    onChange({...track,notes:r.value});
  }

  function hear(midi: number) {
    onAudition(midi, defaultVelocity);
  }

  function up() {
    cursor.midi = movePitch(cursor.midi, 1, filter);
    hear(cursor.midi);
  }
  function down() {
    cursor.midi = movePitch(cursor.midi, -1, filter);
    hear(cursor.midi);
  }
  function left() {
    cursor.step = moveStep(cursor.step, -1, grid, total);
  }
  function right() {
    cursor.step = moveStep(cursor.step, 1, grid, total);
  }

  function doPlace() {
    const res = place(ctx, newLength, defaultVelocity);
    commit(res.track);
    onAudition(res.audition.midi, res.audition.velocity);
  }

  function doClear() {
    repeater.stop();
    commit(clearTrackNotes(track));
  }

  function doDelete() {
    commit(deleteTarget(ctx));
  }

  function doLength(dir: 1 | -1) {
    const res = changeLength(ctx, newLength, dir);
    newLength = res.newLength;
    commit(res.track);
  }

  function doJump(dir: 1 | -1) {
    const cell = jumpNote(track.notes, ctx.cell, grid, dir, total);
    if (!cell) return;
    cursor.step = cell.step;
    cursor.midi = cell.midi;
    hear(cell.midi);
  }

  function pickGrid(g: number) {
    grid = g;
    newLength = g;
    cursor.step = snapStep(cursor.step, g, total);
    gridOpen = false;
  }

  function onCellsClick(e: MouseEvent) {
    if (!cellsEl) return;
    const r = cellsEl.getBoundingClientRect();
    const hit = pointToCell(e.clientX - r.left, e.clientY - r.top, bars);
    if (!hit) return;
    const note = track.notes.find((n) => n.midi === hit.midi && hit.step >= n.start && hit.step < n.start + n.length);
    if (note) {
      cursor.step = snapStep(note.start, grid, total);
      cursor.midi = note.midi;
      onAudition(note.midi, noteVelocity(note));
      return;
    }
    cursor.step = snapStep(hit.step, grid, total);
    cursor.midi = hit.midi;
    hear(hit.midi);
  }

  function pressKey(midi: number) {
    cursor.midi = midi;
    hear(midi);
  }

  function velAt(e: PointerEvent, rec: boolean) {
    if (!velEl) return;
    const r = velEl.getBoundingClientRect();
    const res = changeVelocity(ctx, defaultVelocity, velocityFromY(e.clientY - r.top, r.height));
    defaultVelocity = res.defaultVelocity;
    commit(res.track, rec);
  }
  function velDown(e: PointerEvent) {
    velDrag = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    velAt(e, true);
  }
  function velMove(e: PointerEvent) {
    if (velDrag) velAt(e, false);
  }
  function velUp() {
    velDrag = false;
  }
  function velKey(e: KeyboardEvent) {
    const d = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const res = changeVelocity(ctx, defaultVelocity, shownVelocity + d * 8);
    defaultVelocity = res.defaultVelocity;
    commit(res.track);
  }

  const noteAlpha = (n: { velocity?: number }) => 0.3 + (0.7 * noteVelocity(n)) / 127;
</script>

{#snippet hold(label: string, text: string, fn: () => void, cls: string = '')}
  <button
    class="pad {cls}"
    aria-label={label}
    onpointerdown={(e) => {
      e.preventDefault();
      repeater.start(fn);
    }}
    onpointerup={() => repeater.stop()}
    onpointercancel={() => repeater.stop()}
    onpointerleave={() => repeater.stop()}
    oncontextmenu={(e) => e.preventDefault()}
    onclick={(e) => {
      if (e.detail === 0) fn();
    }}>{text}</button
  >
{/snippet}

<section class="screen" aria-label="Piano roll">
  <div class="rh">
    <div class="line">
      <button class="ib" aria-label="Back to tracks" onclick={onBack}>←</button>
      <b class="name">{track.name}</b>
      {#if onOpenInstrument}<button class="ib sound" aria-label="Tweak instrument" onclick={onOpenInstrument}><span>⚙</span><small>Sound</small></button>{:else}<button class="ib sound" aria-label="Generate sound" disabled={!onOpenGenerate} onclick={()=>onOpenGenerate?.()}><span>✦</span><small>Sound</small></button>{/if}
      <button class="ib sq" aria-label="Undo" disabled={history.past.length === 0} onclick={doUndo}>↶</button>
      <button class="ib sq" aria-label="Redo" disabled={history.future.length === 0} onclick={doRedo}>↷</button>
    </div>
    <div class="line roll-transport" aria-label="Piano roll playback">
      <button class="ib playback" class:on={ui.playing} aria-label={ui.playing?'Pause':'Play'} aria-pressed={ui.playing} onclick={()=>ui.playing?pause():void play()}>{ui.playing?'Ⅱ Pause':'▶ Play'}</button>
      <button class="ib" aria-label="Play from start" onclick={()=>{stop();void play();}}>⏮ Play from start</button>
      <button class="ib" aria-label="Reset playback" onclick={stop}>■ Reset</button>
    </div>
    <div class="line chips tracktools" aria-label="Track playback">
      <button class="ib" aria-label="Track length" onclick={()=>lengthOpen=true}>{bars} {bars===1?'bar':'bars'} ▾</button>
      <button class="ib" class:on={track.solo} aria-pressed={!!track.solo} onclick={onSolo}>Solo</button>
      <button class="ib" aria-label="Repeat bars, all tracks" onclick={()=>ui.loopOpen=true}>Repeat {range.startBar}–{range.endBar} ▾</button>
    </div>
    <div class="line chips notetools" aria-label="Note editing">
      <button class="ib" aria-label="Grid {stepsLabel(grid)}" onclick={() => (gridOpen = true)}>Snap {stepsLabel(grid)} ▾</button>
      <button class="ib" class:on={inKeyOn} aria-pressed={inKeyOn} aria-label="In-key" onclick={() => (inKeyOn = !inKeyOn)}>In-key</button>
      <button class="ib clear" aria-label="Clear all notes" disabled={track.notes.length===0} onclick={doClear}>Clear all</button>
    </div>
    <div class="infoline" aria-live="polite">{info}</div>
  </div>

  <div class="roll">
    <div class="scroller" bind:this={scroller}>
      <div class="inner" style:width="{KEY_W + width}px" style:grid-template-columns="{KEY_W}px {width}px" style:grid-template-rows="{RULER_H}px {height}px">
        <div class="corner"></div>
        <div class="ruler">
          {#each labels as l (l.step)}
            <span style:left="{stepToX(l.step)}px">{l.text}</span>
          {/each}
          {#each repeatSegments as segment}<div class="lp" style:left="{segment.start*16*CELL_W}px" style:width="{segment.bars*16*CELL_W}px"></div>{/each}
        </div>
        <div class="keys">
          {#each rows as midi (midi)}
            <button
              class="key"
              class:blk={isBlackKey(midi)}
              class:cur={midi === cursor.midi}
              style:height="{ROW_H}px"
              aria-label="Play {midiToName(midi)}"
              onclick={() => pressKey(midi)}>{displayName(midi)}</button
            >
          {/each}
        </div>
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div class="cells" data-haptic bind:this={cellsEl} style:background={lines} onclick={onCellsClick}>
          <div class="xh" style:left="0" style:right="0" style:top="{midiToY(cursor.midi) + ROW_H / 2}px" style:height="1px"></div>
          <div class="xh" style:top="0" style:bottom="0" style:left="{stepToX(cursor.step) + (grid * CELL_W) / 2}px" style:width="1px"></div>
          {#each track.notes.filter(n=>n.start<total) as n (n.id)}
            {@const r = noteRect({...n,length:Math.min(n.length,total-n.start)})}
            <div
              class="n"
              class:target={n.id === target?.id}
              style:left="{r.left}px"
              style:top="{r.top}px"
              style:width="{r.width}px"
              style:height="{r.height}px"
              style:--a={noteAlpha(n)}
            ></div>
          {/each}
          <div class="cursor" style:left="{stepToX(cursor.step)}px" style:width="{grid * CELL_W}px" style:top="{midiToY(cursor.midi)}px" style:height="{ROW_H}px">{target ? '' : '+'}</div>
          <div class="playhead" style:left="{stepToX(head)}px"></div>
        </div>
      </div>
    </div>
  </div>

  <div class="ctrl">
    <div class="seg" role="group" aria-label="Play surface">
      <button class="sg" class:on={mode === 'dpad'} aria-pressed={mode === 'dpad'} onclick={() => (mode = 'dpad')}>D-pad</button>
      <button class="sg" class:on={mode === 'keys'} aria-pressed={mode === 'keys'} onclick={() => (mode = 'keys')}>Keys</button>
    </div>
    {#if mode === 'dpad'}
      <div class="dpadrow">
        <div class="pad3">
          <span></span>{@render hold('Cursor up', '▲', up)}<span></span>
          {@render hold('Cursor left', '◀', left)}
          <button class="pad ok" aria-label={target ? 'Play target note' : 'Place note'} onclick={doPlace}>●</button>
          {@render hold('Cursor right', '▶', right)}
          <span></span>{@render hold('Cursor down', '▼', down)}<span></span>
        </div>
        <div class="side">
          <div class="pair">
            <button class="btn" aria-label="Previous note" onclick={() => doJump(-1)}>⏮</button>
            <button class="btn" aria-label="Next note" onclick={() => doJump(1)}>⏭</button>
          </div>
          <button class="btn danger" aria-label="Delete target note" disabled={!target} onclick={doDelete}>🗑 Delete</button>
          <div class="pair len">
            <button class="btn" aria-label="Shorter note" onclick={() => doLength(-1)}>−</button>
            <span class="lenv" aria-label="Note length">♪{stepsLabel(target ? target.length : newLength)}</span>
            <button class="btn" aria-label="Longer note" onclick={() => doLength(1)}>+</button>
          </div>
        </div>
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <div
          class="vel"
          bind:this={velEl}
          role="slider"
          tabindex="0"
          aria-label="Velocity"
          aria-valuemin="1"
          aria-valuemax="127"
          aria-valuenow={shownVelocity}
          onpointerdown={velDown}
          onpointermove={velMove}
          onpointerup={velUp}
          onpointercancel={velUp}
          onkeydown={velKey}
        >
          <span>vel {shownVelocity}</span>
          <i style:height="{(shownVelocity / 127) * 100}%"></i>
        </div>
      </div>
    {:else}
      <div class="kb" role="group" aria-label="Keyboard">
        {#each kb.whites as k (k.midi)}
          <button class="w" class:dn={k.midi === cursor.midi} style:left="{k.left * 100}%" style:width="{k.width * 100}%" aria-label="Key {midiToName(k.midi)}" onclick={() => pressKey(k.midi)}></button>
        {/each}
        {#each kb.blacks as k (k.midi)}
          <button class="b" class:dn={k.midi === cursor.midi} style:left="{k.left * 100}%" style:width="{k.width * 100}%" aria-label="Key {midiToName(k.midi)}" onclick={() => pressKey(k.midi)}></button>
        {/each}
      </div>
      <div class="kbrow">
        <button class="ib" aria-label="Octave down" disabled={kbBase === shiftBase(kbBase, -1)} onclick={() => (kbBase = shiftBase(kbBase, -1))}>Oct −</button>
        <span class="note">{displayName(kbBase)}–{displayName(kbBase + 16)}</span>
        <button class="ib" aria-label="Octave up" disabled={kbBase === shiftBase(kbBase, 1)} onclick={() => (kbBase = shiftBase(kbBase, 1))}>Oct +</button>
      </div>
    {/if}
  </div>

  {#if gridOpen}
    <Sheet title="Grid spacing" onclose={()=>gridOpen=false}><p class="note">Snap note positions and new note lengths to this spacing.</p><div class="seg">{#each GRIDS as g (g)}<button class="sg" class:on={g===grid} aria-pressed={g===grid} onclick={()=>pickGrid(g)}>{stepsLabel(g)}</button>{/each}</div></Sheet>
  {/if}
  {#if lengthOpen}
    <Sheet title="Track length" sub={track.name} onclose={()=>lengthOpen=false}>
      <div class="lengthstep"><button class="ib" aria-label="Shorten track" disabled={bars<=1} onclick={()=>onTrackBars(bars-1)}>−</button><b>{bars} {bars===1?'bar':'bars'}</b><button class="ib" aria-label="Lengthen track" disabled={bars>=16} onclick={()=>onTrackBars(bars+1)}>+</button></div>
      <p class="note">This track repeats every {bars} bars. Notes past the end are kept and return when you lengthen it.</p><div class="btnrow"><button class="btn pri" onclick={()=>lengthOpen=false}>Done</button></div>
    </Sheet>
  {/if}
</section>

<style>
  .roll-transport{justify-content:flex-start;gap:6px}.roll-transport .ib{font-size:11px;padding:0 8px;white-space:nowrap}.roll-transport .playback{background:var(--accent);color:#111;min-width:70px}

  .screen {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    background: var(--ui-bg);
    color: var(--ui-text);
    font-size: 14px;
    line-height: 1.3;
    --dim: var(--ui-text-muted);
    --line: var(--ui-border);
  }
  button {
    font: inherit;
    color: inherit;
    border: 0;
    cursor: pointer;
    touch-action: manipulation;
  }
  button:disabled {
    color: var(--ui-text-dim);
    cursor: default;
  }
  .rh {
    flex: none;
    background: var(--ui-panel);
    border-bottom: 1px solid var(--line);
    padding: 8px 10px;
  }
  .line {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .chips {
    margin-top: 6px;
  }
  .name {
    flex: 1;
    min-width: 0;
    font-size: 15px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ib {
    flex: none;
    height: 44px;
    min-width: 44px;
    padding: 0 10px;
    border-radius: 10px;
    background: var(--ui-panel-2);
    display: grid;
    place-items: center;
    font-size: 13px;
    font-weight: 600;
  }
  .ib.sq {
    width: 44px;
    padding: 0;
    font-size: 16px;
  }
  .ib.on {
    background: #3a2c14;
    color: var(--accent);
  }
  .ib.clear:not(:disabled) {color:var(--bad);}
  .infoline {
    margin-top: 6px;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
  }
  .roll {
    flex: 1;
    min-height: 0;
    position: relative;
    background: var(--ui-bg);
  }
  .scroller {
    position: absolute;
    inset: 0;
    overflow: auto;
    overscroll-behavior: contain;
  }
  .inner {
    display: grid;
    position: relative;
  }
  .corner {
    position: sticky;
    top: 0;
    left: 0;
    z-index: 6;
    background: var(--ui-panel-2);
  }
  .ruler {
    position: sticky;
    top: 0;
    z-index: 5;
    background: var(--ui-panel-2);
    font-size: 10px;
    color: var(--dim);
  }
  .ruler span {
    position: absolute;
    top: 4px;
    padding-left: 3px;
    border-left: 1px solid #556;
    height: 18px;
  }
  .lp {
    position: absolute;
    top: 16px;
    height: 4px;
    background: var(--accent);
    border-radius: 2px;
  }
  .keys {
    position: sticky;
    left: 0;
    z-index: 4;
    background: var(--ui-panel);
    border-right: 1px solid var(--line);
  }
  .key {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 0 0 0 6px;
    font-size: 11px;
    color: var(--dim);
    background: transparent;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    text-align: left;
  }
  .key.blk {
    background: rgba(0, 0, 0, 0.3);
  }
  .key.cur {
    background: var(--band-1);
    color: #000;
    font-weight: 700;
  }
  .cells {
    position: relative;
  }
  .xh {
    position: absolute;
    background: rgba(255, 255, 255, 0.25);
    z-index: 1;
    pointer-events: none;
  }
  .n {
    position: absolute;
    border-radius: 3px;
    background: color-mix(in srgb, var(--band-1) calc(var(--a) * 100%), transparent);
    border: 1px solid rgba(255, 255, 255, 0.3);
    pointer-events: none;
  }
  .n.target {
    background: var(--amber);
    border: 2px solid #fff;
    z-index: 3;
  }
  .cursor {
    position: absolute;
    border: 2px solid #fff;
    background: rgba(255, 255, 255, 0.18);
    z-index: 4;
    display: grid;
    place-items: center;
    font-weight: 700;
    pointer-events: none;
  }
  .playhead {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    margin-left: -1px;
    background: var(--accent);
    z-index: 2;
    pointer-events: none;
  }
  .ctrl {
    flex: none;
    background: var(--ui-panel);
    border-top: 1px solid var(--line);
    padding: 8px 10px;
  }
  .seg {
    display: flex;
    gap: 4px;
  }
  .ctrl .seg {
    margin-bottom: 8px;
  }
  .sg {
    flex: 1;
    height: 44px;
    border-radius: 10px;
    background: var(--ui-panel-2);
    font-size: 13px;
    font-weight: 600;
    color: var(--dim);
  }
  .sg.on {
    background: #3a2c14;
    color: var(--accent);
    outline: 1px solid var(--accent);
  }
  .dpadrow {
    display: flex;
    align-items: stretch;
    gap: 10px;
  }
  .pad3 {
    display: grid;
    grid-template-columns: repeat(3, 58px);
    grid-template-rows: repeat(3, 58px);
    gap: 6px;
  }
  .pad {
    border-radius: 12px;
    background: var(--ui-panel-2);
    font-size: 20px;
    -webkit-user-select: none;
    user-select: none;
  }
  .pad.ok {
    background: var(--accent);
    color: #111;
    font-size: 26px;
  }
  .side {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1;
    min-width: 0;
  }
  .pair {
    display: flex;
    gap: 6px;
    flex: 1;
  }
  .btn {
    flex: 1;
    min-height: 44px;
    border-radius: 12px;
    background: var(--ui-panel-2);
    font-weight: 600;
    font-size: 15px;
  }
  .btn.danger:not(:disabled) {
    color: var(--bad);
  }
  .lenv {
    flex: 1.4;
    display: grid;
    place-items: center;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
  }
  .len .btn {
    flex: 1;
  }
  .vel {
    width: 46px;
    border-radius: 10px;
    background: #0e1014;
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: flex-end;
    touch-action: none;
  }
  .vel i {
    display: block;
    width: 100%;
    background: var(--band-1);
  }
  .vel span {
    position: absolute;
    top: 6px;
    left: 0;
    right: 0;
    text-align: center;
    font-size: 11px;
    z-index: 1;
  }
  .kb {
    position: relative;
    height: 120px;
    border-radius: 10px;
    overflow: hidden;
  }
  .kb button {
    position: absolute;
    top: 0;
  }
  .kb .w {
    height: 100%;
    background: #e9e9ec;
    border-right: 1px solid #aaa;
  }
  .kb .b {
    height: 60%;
    background: #111;
    border-radius: 0 0 4px 4px;
    z-index: 1;
  }
  .kb .w.dn {
    background: #b5d8ff;
  }
  .kb .b.dn {
    background: #3b6c9c;
  }
  .kbrow {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 6px;
  }
  .note {
    flex: 1;
    text-align: center;
    font-size: 12px;
    color: var(--dim);
  }
  .ib.sound{width:44px;padding:3px;gap:0;align-content:center;line-height:1.1;background:var(--sa3bg);color:var(--sa3);border:1px solid #7a5cc855;margin-right:3px;}.ib.sound small{font-size:10px;}.ib.sound span{font-size:16px;}
  .ctrl .btn{height:44px;padding:0 4px;}
  .tracktools .ib,.notetools .ib{flex:1;min-width:0;padding:0 6px;font-size:12px;}
  .lengthstep{display:flex;align-items:center;justify-content:space-between;margin:16px 0;}
  .dpadrow{gap:6px;}.pad3{grid-template-columns:repeat(3,clamp(40px,12vw,58px));grid-template-rows:repeat(3,clamp(40px,12vw,58px));gap:4px;}.vel{flex:none;width:34px;}.pair{gap:3px;}.lenv{font-size:11px;}.len .btn{min-width:24px;}
</style>
