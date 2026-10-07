# Song Layout Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Arrange existing track patterns into a song and export its complete mix as MP3.
**Architecture:** Persist placements alongside existing project fields. One pure compiler generates absolute note events consumed by finite song playback and offline export. Offline rendering reuses existing instrument, sampler and effects processors; a worker encodes stereo PCM.
**Tech Stack:** Svelte 5, strict TypeScript, Web Audio, Vitest, locally bundled LAME-compatible encoder.
**Spec:** docs/superpowers/specs/2026-10-07-song-layout.md

## Global Constraints

- Mobile portrait, native scrolling, visible actions; same host and existing cache/database.
- Reuse each track's current pattern; 16 initial bars, 256 maximum.
- MP3 stereo 44100 Hz, 192 kbps, complete arrangement and current mute/solo/mix/settings.
- Export rejects missing sounds/effects; cancellation preserves project.
- No merge or push pending phone approval.

## Review Focus

- Held notes/pattern boundaries: no duplicate triggers or notes beyond placement.
- Old projects: no lost patterns, sounds or models.
- Loading effects/instruments: export waits and refuses unavailable assets.
- Navigation/edits: no stale playback or changing export snapshot.
- Mobile export: progress, cancel, retry and download stay reachable.

### Task 1: Arrangement model and finite playback

**Files:** Create src/song/arrangement.ts, events.ts, playback.ts and tests; modify projectModel.ts, projectStore.ts, audio/engine.ts.
**Interfaces:** Arrangement={bars:number;blocks:{id:string;trackId:string;startBar:number}[]}. compileSong(project):{events:NoteEvent[];duration:number}. Song scheduler supports play/pause/stop/position/repeat. Engine setPlaybackMode('pattern'|'song') selects scheduling.

- [x] Write tests for fit/overlap, deletion, copies/ranges, normalization, gaps/chords/boundaries/velocity/mute/solo, finite completion/pause/repeat and persistence.
- [x] Run targeted tests; expect missing-module/export failures.
- [x] Implement immutable helpers, storage normalization, compiler and finite scheduler. Song changes/mode changes stop playback.
- [x] Run targeted and complete suite; expect all pass. Commit.

### Task 2: Offline rendering and MP3

**Files:** Create src/song/render.ts, export.ts, mp3.worker.ts and tests; modify mixer/pluginNodes.ts, controller.ts and instrument/player.ts readiness/context support; bundle encoder/license/source.
**Interfaces:** renderSong(project,sounds,{signal,onProgress}):Promise<AudioBuffer>; exportSong(project,store,{signal,onProgress}):Promise<Blob>.

- [x] Write tests for missing audio, cancel, snapshot, tail trim, PCM conversion and valid MP3; run expecting missing behavior.
- [x] Bundle encoder/notices; make processor readiness awaitable and failures fatal to export. Initialize independent offline graph with settled gains; schedule existing voices from compileSong.
- [x] Encode in worker with progress/cancel and cleanup.
- [x] Run suite/typecheck and real mixed offline/decoded MP3 checks for stereo, duration, pitch, levels/effects and nonzero audio. Commit.

### Task 3: Layout and export UI

**Files:** Create LayoutScreen.svelte, SongExportSheet.svelte and songHistory.ts/tests; modify App.svelte, Nav.svelte, appState.svelte.ts and docs/handoff.md.
**Interfaces:** Layout edits project.arrangement using updateProject and history. Export sheet owns abort controller and finished Blob. Layout route selects song playback.

- [x] Write failing history/browser checks for placement/repeat/move/delete, range duplicate/add all, undo/redo, resize confirmation, navigation/reload/scrolling and export/cancel/download.
- [x] Implement sticky native scrolling grid, selection/actions, length buttons, song transport and natural-end UI synchronization.
- [x] Implement export stages/cancel/error/download; precache worker/encoder.
- [x] Full suite, typecheck/build, mobile/audio/export/offline and same-origin preservation checks. Commit. Independent review; fix important findings with regression tests.
