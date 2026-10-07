# Song layout and MP3 export — proposed design

Status: approved by the user. Reuse existing track patterns.

## Intended outcome

Build a song quickly from the sounds and piano-roll patterns already in the project. Arrange when each track plays, audition the complete song, and download an MP3. Keep the phone portrait layout, downloaded models, saved sounds and existing mixer settings.

## Recommended approach

Add a Layout tab with a track-by-bar timeline. Each block references the current pattern of its track. Changes in the piano roll update every placement of that pattern. This keeps arranging fast and avoids duplicating notes or sounds.

Alternatives considered: a list of whole-song sections is simpler but cannot place tracks independently; multiple patterns per instrument adds verse/chorus variations but needs a pattern library and a way to select the pattern being edited. The pending user choice determines whether that library is included.

## Layout page

- Compact header: Layout, song length, Export icon with an accessible label.
- Tracks down the left; numbered bars across the top. Track names and the ruler stay visible during native horizontal and vertical scrolling.
- Start a new arrangement at 16 bars. Quick +4, +8 and +16 buttons extend it, up to 256 bars. Reducing length requires a visible confirmation if blocks would be lost.
- Tap an empty bar in a track row to place its complete pattern. A two-bar track pattern occupies two bars. Overlapping placements on the same track are prevented; the UI explains why placement cannot fit.
- Tap a block to select it. Visible controls repeat it immediately after itself, move it by bars, remove it, or open its piano roll. Repeated taps on Repeat build longer sections quickly. Undo and Redo cover arrangement edits.
- Add all patterns creates one aligned set of blocks at the selected bar. Duplicate range repeats all placements in a selected bar range for quick verse/chorus construction.
- Empty sections are silent. Muted tracks stay silent and Solo is honored, matching the Mix page.
- Bottom icon controls: play from start, play/pause, reset. Song plays once and stops at the end. Repeat song is an explicit toggle.
- Existing Tracks and piano-roll playback retain their pattern preview behavior. Playback mode is explicit; changing it stops the previous playback.

## Storage and timing

Add an optional arrangement to the existing project record: song bar count and blocks containing ID, track ID and start bar. Legacy projects retain their existing data and receive no implicit arrangement until the user starts one. Removing a track also removes its blocks.

Use one pure arrangement-to-note-event compiler for playback and export. It resolves track patterns into absolute song positions, preserving pitch, velocity, note duration and gaps. A placement ends at its pattern boundary; release envelopes and effects can continue after the boundary. Arrangement edits during playback stop playback before updating it, avoiding stale scheduled notes.

The project store continues to save everything in its existing IndexedDB database. No model-cache changes or host-port changes are part of this feature.

## MP3 export

Export the complete arrangement as stereo 44.1 kHz MP3 at 192 kbps, named from the project title. Include current sample attack/release/brightness, instrument synthesis settings, ordered EQ and Dragonfly reverb inserts, pan, track levels, Mute/Solo and master level.

Capture an immutable project and sound snapshot at export start. Stop playback; show Preparing, Rendering and Encoding stages with Cancel. Other edits cannot change the export snapshot. Render with an independent OfflineAudioContext and reuse existing source/effects processors, with an explicit readiness acknowledgement for every required processor and reverb module before rendering starts. Export uses settled parameter values rather than interactive mixer fades. Unsupported offline processing or missing sounds produce a useful error; export must never silently omit a sound or effect.

Allow up to ten seconds for the final effects tail, including release, then trim trailing silence without shortening the song timeline. Apply a brief ending fade only when the tail reaches the limit. Encode PCM in a worker using a locally bundled LAME-compatible MP3 encoder. Bundle the encoder, worker and required assets into the offline shell cache and include its license and corresponding source where required. Encoding should not block scrolling or cancellation.

Provide Download MP3 when complete; retain the finished file if the browser requires another user tap to download it. Show filename and file size. Empty arrangements cannot export. Allocation/encoding failures preserve the arrangement and provide a retry action.

## Verification required before delivery

- Unit tests: placement bounds, overlap, duplicate/range operations, undo/redo, track deletion, legacy loading and persistence.
- Timing tests: gaps, simultaneous tracks, pattern boundaries, BPM, finite song completion, pause/resume and repeat behavior. Playback and export consume identical events.
- Actual audio checks: sample and instrument rendering, controls, ordered effects, pan/levels, Mute/Solo, final tail, decoded MP3 duration and nonzero audio.
- Browser checks at 320×640 and 375×812: native scrolling, tap placement, repeat/remove, visible controls, project reload, export progress/cancel/download and offline export.
- Run the complete unit suite, strict typecheck and production build. Verify the single existing host serves the updated build and preserves model cache and saved project.

## Pending choice

Reuse existing track patterns, or add multiple patterns per instrument? The recommendation is reuse first. The user approved the recommended scope.

## Technical references

- Existing project model: src/store/projectModel.ts
- Existing pattern scheduler: src/audio/scheduler.ts
- Existing sample/instrument playback: src/audio/engine.ts
- Existing effect graph: src/audio/mixer/controller.ts and pluginNodes.ts
- Browser offline rendering API: https://developer.mozilla.org/en-US/docs/Web/API/OfflineAudioContext
- Browser MP3 encoder upstream: https://github.com/zhuker/lamejs
