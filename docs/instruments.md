# SA3 samples and instruments

Generate has two paths. Sample produces one-shot sounds with conventional sample playback. Instrument produces a single source note, automatically measures it, and extracts a playable evolving tone. No manual root matching is needed for Instrument.

Instrument analysis and per-pitch preparation run in a separate browser worker. An AudioWorklet plays additive partials with their measured amplitude envelopes and inharmonic intervals, plus a notched noise residual. A 35–90 ms crossfade preserves the short source attack through sinc interpolation. Played pitches use equal temperament (A4 = 440 Hz, A3 = 220 Hz), with a Nyquist guard and 150 ms release. Hold tone uses a measured body spectrum; Natural decay follows the source and extrapolates its decay beyond the recording.

Piano and guitar are source-dependent approximations. They preserve a recognizable attack and evolving resonance; they are not multisampled physical instruments. Loud overtones are considered during pitch detection. Silence, broadband noise and substantial unrelated pitched energy are rejected. Failed analysis keeps the previous sound and offers an explicit Use as sample action.

Profiles and source PCM are saved alongside the existing sample records in IndexedDB. Records without profiles remain samples. The generated service worker includes the instrument worker and processor for offline playback. Heavy transforms never run inside the audio callback. Prepared attacks/residuals have a 16-pitch cache per loaded instrument; live voices are bounded.

## Prompts and lengths

Sample presets describe the hit, decay and texture. Instrument source generation uses native radio selections for instrument, character, attack and note behavior; a read-only final prompt preview shows their combined description. Source behavior supplies both the prompt and the initial resynthesis behavior. Sample requests one isolated hit; Instrument requests one note without chords, melody, accompaniment, drums or reverb. Piano/guitar/bell selections default to Natural decay; synth/pad/bass to Hold tone. Sample presets start at 0.5–2 s, Instrument at 4 s. Each path remembers its own source length and steps. These durations are practical starting points from the listening experiment; they are not official model recommendations.

The [official prompting guide](https://github.com/Stability-AI/stable-audio-3/blob/main/docs/guides/prompting.md) and [SA3 prompt guide](https://stability.ai/guides/stable-audio-3-prompt-guide) support descriptive sound/instrument prompts and track-type tags. Instrument uses `TrackType: Instrument` on Music/Medium; Sample uses `TrackType: SFX` on SFX/Medium and Instrument on Music. Length is passed separately as the model duration. Small Music or Medium is suggested for instrument sources; model choice remains explicit.

## Verification — Steam Deck Chromium, 2026-10-07

- Full suite: 317 tests passed; strict typecheck zero errors/warnings; production build passed.
- Synthetic untuned source, dominant second harmonic, noise/chord rejection, decay/sustain/release, stored profile reload, old sound preservation and Stop cancelling future notes.
- Actual AudioWorklet output from the approved SA3 synth/piano/guitar fixtures: A3 fundamental 219.99982–219.99998 Hz, within 0.002 cents. Analysis of 4 s sources took 1.3–2.6 s on the Deck.
- Real Medium inference through the app: 4 s/16 step piano Instrument and 1 s/8 step kick Sample. Separate tracks, mixed playback, reload and offline playback passed; no external network requests or browser errors.
- Independent code review completed; queued-note stopping and unnecessary audio-buffer cloning corrected.

Evidence and smoke harness: `/home/deck/Documents/Codex/2026-10-07-go-to-sa3-browser-project-and/verification/`. Phone source quality, memory and polyphony performance are still to check. Model generation retains the existing phone/runtime constraints.

## Playback controls and piano roll

Tweak instrument is a separate sheet, available from the selected Instrument track or its piano roll. Brightness controls a gently smoothed low-pass filter; attack (3–2000 ms), release (20–2000 ms) and playback behavior affect subsequent notes. Changes save automatically with the track. Reset restores the source profile's defaults. No SA3 inference runs when tweaking. Generating a new source resets playback tweaks to the new source defaults.

Home note previews open their track's piano roll for samples and instruments. Clear all removes that roll's notes and remains undoable/redoable. Note history restores only notes, preserving the current source and controls. Svelte snapshots are taken at the piano-roll/store boundary so persisted project values remain cloneable.

App-wide haptic feedback requests a light 3 ms pulse on physical enabled control presses and keyboard control activation, including native radio/range controls and custom sliders. Unsupported or denied vibration calls do not interrupt actions. Project settings offer Off/Light. Actual vibration depends on browser/device support; phone feedback remains to check.

Additional browser verification at 375×812: waveform navigation; clear scope and undo/redo; one haptic call per tested press, none on disabled controls; selections/preview/submitted prompt agreement; separate tweak screen; no regeneration during tweaking; controls preserved across note undo and page reload; reset to source behavior; no horizontal overflow or browser errors. Evidence: `verification/controls.json` in the session workspace.

## Shared playback and acceptance

Each track has its own 1–16 bar pattern. A shared inclusive repeat range controls all tracks together; shorter patterns repeat within it. Multiple Solo buttons can be active, with Mute taking precedence. Pause holds position; Play resumes; Stop returns to the chosen range start. Notes crossing into a selected range are resumed, with queued sample voices cancelled on transport changes.

Generation prepares an uncommitted draft. Preview uses isolated audio, Use sound persists and assigns it, and Discard retains the old source/tweaks. Add track starts generation and creates the track only on Use, then opens the roll. Fresh projects have no empty track; saved projects are preserved. Home lanes show piano note previews instead of source waveforms, with short patterns repeated across the timeline.

## Tweak before Use

Generated instrument results show brightness, attack, release and playback behavior controls before acceptance. Preview and primary Use sound stay visible while scrolling the mobile sheet. Controls are shared with the saved instrument editor. Draft edits leave the existing track/source untouched; Use carries the settings into the track, and regeneration starts fresh. Brightness changes update a playing preview; press Preview to hear envelope and behavior changes on a new note. Reset controls restores the source defaults.
