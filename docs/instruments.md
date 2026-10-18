# SA3 samples and instruments

Generate has three paths. Sample produces one-shot sounds with conventional sample playback. Instrument produces a single source note, automatically measures it, and extracts a playable evolving tone. No manual root matching is needed for Instrument. Looped keeps the source audio, finds a seamless loop in its sustained part and repeats it while a note is held (see Looped sample).

Instrument analysis and per-pitch preparation run in a separate browser worker. An AudioWorklet plays additive partials with their measured amplitude envelopes and inharmonic intervals, plus a notched noise residual. A 35–90 ms crossfade preserves the short source attack through sinc interpolation. Played pitches use equal temperament (A4 = 440 Hz, A3 = 220 Hz), with a Nyquist guard and 150 ms release. Hold tone uses a measured body spectrum; Natural decay follows the source and extrapolates its decay beyond the recording.

Piano and guitar are source-dependent approximations. They preserve a recognizable attack and evolving resonance; they are not multisampled physical instruments. Loud overtones are considered during pitch detection. Silence, broadband noise and substantial unrelated pitched energy are rejected. Failed analysis keeps the previous sound and offers an explicit Use as sample action.

Profiles and source PCM are saved alongside the existing sample records in IndexedDB. Records without profiles remain samples. The generated service worker includes the instrument worker and processor for offline playback. Heavy transforms never run inside the audio callback. Prepared attacks/residuals have a 16-pitch cache per loaded instrument; live voices are bounded.

## Looped sample

Looped asks for one isolated, sustained note (the Instrument prompt guidance plus steady pitch and volume), keeps the audio as generated and plays it like a sample: `playbackRate` sets the pitch from the detected root, `AudioBufferSourceNode.loop` repeats the region while the note is held, and the usual release follows. The track keeps `soundType: 'loop'`; the stored sample carries `loop: {start, end}` (seconds of the stored audio) and `meta.mode: 'loop'`. Records without `loop` play as one-shots. Cloud and on-device sources use the same path.

Preparation (`prepareGeneration` in `src/app/generate.ts`, pure parts in `src/audio/loopPoints.ts`):

1. Trim and normalize as for a sample, but without the closing fade-out. Detect the root with `detectPitch`.
2. `findLoop`: the sustained part is the longest run of the RMS envelope (40 ms window, 10 ms hop) whose max/min ratio stays within 1.5 and above 10 % of the peak, starting no earlier than 0.15 s, with 20 ms margins. The period comes from `detectPitch` refined by autocorrelation (correlation of at least 0.8, pitch confidence of at least 0.5). Loop lengths are whole numbers of periods between 0.12 s and 1.2 s (at most 85 % of the sustained part); starts are upward zero crossings. The pair whose material before the start and before the end differs least wins (normalised difference, 0 identical to 2 opposite; longer loops are slightly preferred), and a difference above 0.2 gives no loop.
3. `bakeLoop` blends the last min(30 ms, a third of the loop) of the region into the material just before the start with an equal-power crossfade (compensated for the correlation of the two parts, so coherent material keeps its level). The region then ends on the sample before its start, so the wrap has the size of an ordinary sample step. The closing fade-out is applied afterwards and never reaches into the loop.
4. No loop found (unpitched or noisy sound, a steadily decaying tone, too short, silent, or too different at the seam): the sound is saved as a normal one-shot sample, the result panel says so, and Regenerate tries another seed.

Chop edits only the kept region. The loop moves with it; a chop edge (with its 3 ms fade) that reaches into the loop makes the sound play as a one-shot until the chop is widened. Preview and Edit sound play a held note. Song export renders looped samples with the same `playNote` call as live playback.

Limits: mono only (stereo looping is not implemented); the tail after the loop end is never played, so the release happens inside the loop; unpitched textures are not looped; loop quality on real SA3 notes and the sound on a phone are to check (only synthetic signals were tested).

## Prompts and lengths

Sample presets describe the hit, decay and texture. Instrument source generation uses native radio selections for instrument, character, attack and note behavior; a read-only final prompt preview shows their combined description. Source behavior supplies both the prompt and the initial resynthesis behavior. Sample requests one isolated hit; Instrument requests one note without chords, melody, accompaniment, drums or reverb; Looped requests the same plus a sustained note with steady pitch and volume, from presets (Synth, Pad, Organ, Strings, Flute) that start at 4 s, 16 steps on device (cloud at most 8). Piano/guitar/bell selections default to Natural decay; synth/pad/bass to Hold tone. Sample presets start at 0.5–2 s, Instrument at 4 s. Each path remembers its own source length and steps. These durations are practical starting points from the listening experiment; they are not official model recommendations.

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

## Sampled instrument presets

A track with `soundType: 'preset'` plays a multisampled instrument named by `presetId`. It needs no generation and stores no sample. Mini piano ships in the app (`public/instruments/mini-piano/`, 0.57 MB, precached by the service worker); the other presets are packs `inst-<id>` downloaded into Cache Storage. A preset that is not installed is silent without errors; the Tracks screen and the piano roll show "Preset not installed" and the Download button.

### Packs

| Pack | Download | Decoded | Velocity layers | Files (samples) | Notes |
|---|---|---|---|---|---|
| `mini-piano` (bundled) | 0.57 MB | 6.8 MB mono | 1 (of 2) | 19 (16) | every second Upright sample, tails 4/3/2 s with a fade, no loops |
| `inst-upright` | 8.91 MB | 115.8 MB stereo | 2 (of 2) | 70 (66) | 33 regions per layer, 34 looped samples (loops kept, crossfaded) |
| `inst-grand` | 10.76 MB | 116.9 MB mono | 5 (of 16) | 242 (238) | 30 notes in minor thirds A0..C8, 88 hammer-noise release samples, no string resonance |
| `inst-ep-cp80` | 7.19 MB | 78.0 MB mono | 4 (of 4) | 85 (81) | tails scaled to 0.95 by the decoded budget |
| `inst-ep-pianet` | 4.11 MB | 44.2 MB mono | 2 (of 2) | 53 (49) | 16 key-release noise regions |
| `inst-ep-wurlitzer` | 1.66 MB | 17.7 MB mono | 4 (of 4) | 46 (42) | 20 centre keys, six regions reuse a file |

Decoded memory is frames × channels × 4 bytes, summed over the pack's samples: it is what the app holds when every sample of the pack is decoded. The player decodes a file when a note first needs it, keeps files used by the tracks' patterns, evicts the least recently used others beyond a budget of 96 MB (64 MB when `navigator.deviceMemory` is 4 or less, 48 MB at 2 or less) and decodes everything a pattern needs before Play. A context running at 48 kHz decodes 8.8 % larger. Grand piano: 5 layers in mono because 120 MB decoded is the limit, not the download (45 MB allowed, 10.8 MB used); tails are 6 s up to centre key 47, 4.5 s up to 71, 3 s up to 91 and 2.25 s above, ended with a 120 ms fade, which is the configured 8/6/4/3 s scaled by 0.75 to fit the budget. The five layers are the original layers nearest to five equal velocity bands; the velocity ranges are re-split halfway between their centres (1-26, 27-50, 51-76, 77-104, 105-127).

Pack folder: `preset.json`, `samples/NNN.m4a`, `LICENSE.txt` and the source readme (copied from the library), `CREDITS.txt`. `preset.json` fields are documented in `src/audio/sfz/format.ts`; times are seconds, volumes dB, loops in seconds of the encoded file, optional fields are omitted at their default. Each sample is normalised by one gain per pack so the loudest region peaks at -6 dBFS at full velocity.

### Playback

- Regions for a note: key inside `lokey..hikey`, velocity inside `lovel..hivel`, every matching region plays (overlapping layers add). `trigger: 'release'` regions play at note end.
- Rate `2^((key - center)/12 + tune/1200)` (`keytrack: 0` ignores the key). Gain `10^(volume/20) * ((1 - t) + t * (velocity/127)^2)` with `t` the region's `veltrack`; release triggers are attenuated by `rtDecay` dB per second the key was held.
- Envelope: attack (at least 2 ms), hold, decay to sustain, release at note end (at least 15 ms); linear segments. Looped regions loop between their points until the note ends; the release happens inside the loop. `oneShot` regions ignore the note end.
- At most 32 voices per preset player; a new voice beyond that fades the oldest over 30 ms.
- A sample that is not decoded when its note is due starts late and keeps the note's end; one with less than 30 ms left is skipped.
- Song export builds the same voices in the offline context, without the voice cap.

### SFZ subset

Parsed and used: `<control>` `default_path`, `set_ccN`/`set_hdccN` (default controller values); `<global>`/`<master>`/`<group>`/`<region>` inheritance; `#define $NAME value` and `#include "file"` (included files are read through an injected reader, defines apply textually); `//` and `/* */` comments; `sample`, `key`, `lokey`, `hikey`, `pitch_keycenter`, `pitch_keytrack`, `lovel`, `hivel`, `tune`, `transpose`, `volume`, `group_volume`, `pan`, `loop_mode` (`no_loop`, `one_shot`, `loop_continuous`), `loop_start`, `loop_end` (inclusive), `offset`, `end`, `ampeg_attack`, `ampeg_hold`, `ampeg_decay`, `ampeg_sustain`, `ampeg_release`, `amp_veltrack`, `trigger` (`attack`, `release`), `rt_decay`, `fil_type=lpf_1p|lpf_2p` with `cutoff`, `locc`/`hicc` conditions at the default controller values, `sw_default`/`sw_last` (only the default keyswitch region set is kept), and controller modulation `ampeg_*_onccN`, `amp_veltrack_onccN` (with `*_curveccN` curves 0 to 3) evaluated at the default controller values. Regions with `lokey=-1` (not note-triggered) are skipped. `loop_sustain` is built as `loop_continuous`; `trigger=first` and `legato` are built as note-on regions; `group` and `off_by` are parsed but not played.

Opcodes found in the five libraries and ignored (the builder logs them as a warning with their region counts): `amplitude_oncc#`, `amplitude_curvecc#`, `pan_oncc#`, `pan_curvecc#`, `note_polyphony`, `off_time`, `offset_oncc#` (Salamander; the controller is at 0, so no offset), `width` (Upright). The controller defaults the libraries set for amplitude and pan are not applied (to check by ear: level against the original). Label opcodes (`region_label`, `group_label`, `master_label`, `sw_label`, `label_ccN`) and `default_path` need no warning; round-robin (`seq_position`) and random (`lorand`) alternatives keep the first variant rather than playing all variants together; every other unknown opcode appears in the builder warning. The `offset` values of the EP libraries are applied when the samples are cut.

### Building packs

```
node scripts/instruments/build.mjs <pack-id|all> [--source DIR] [--out DIR] [--layers N] [--key-step N] [--decoded-mb N] [--download-mb N] [--bitrate KBPS] [--channels auto|mono|stereo] [--bake-loops|--no-bake-loops]
```

The libraries are read from `~/Music/sfz/` (read only). Packs are written to `models/inst-<id>/` (ignored by git); `mini-piano` to `public/instruments/mini-piano/`. Pack definitions (source paths, credit lines, licence, layers, tails, budgets) are in `scripts/instruments/packs.mjs`. `npm run manifest` lists the packs. The pipeline: parse the SFZ (warning for unsupported opcodes), choose velocity layers (`--layers`, original layers nearest to equal bands, ranges re-split to cover 1..127 when reducing layers; keeping every layer preserves the original per-key ranges), optionally thin the keys (`--key-step`, ranges re-split), plan sample lengths (tail limit by register; looped samples end at the loop end plus 4096 frames; the tail scale is lowered in steps of 0.05 until the decoded size fits `--decoded-mb`; stereo falls back to mono under `--channels auto`), cut, fade, downmix, resample to 44.1 kHz with ffmpeg (`/usr/bin/ffmpeg`), apply the pack gain, encode AAC-LC in `.m4a` (the highest bitrate of 128 down to 32 kbit/s per channel whose total fits `--download-mb`), write `preset.json` (validated with `normalizePreset`) and copy the licence files.

Looped samples: SFZ loop points (source frames, `loop_end` inclusive) become seconds of the encoded file. The loop tail is crossfaded into the material before the loop start (30 ms, equal power) before encoding, and the file ends after the loop with the loop continued, so a decoder that returns a few frames fewer than it was given does not move the loop end.

### Codec and loop check

Chromium (headless 1243) decodes the ffmpeg-encoded `.m4a` sample-exactly: a test tone starting at frame 10000 has its first sample above 0.02 at frame 10001, the expected position, and the decoded length equals the input length; the encoder delay is removed through the file's edit list. Looped files from the 66-sample Upright were decoded in Chromium with `scripts/instruments/verify.mjs` and the jump at the loop wrap was measured as the extrapolation error divided by the roughness of the nearby audio:

| Audio | median | max |
|---|---|---|
| original FLAC, library loop points | 12.0 | 49.0 |
| AAC without baked crossfade | 15.1 | 49.8 |
| AAC with baked crossfade (shipped) | 2.4 | 9.1 |

Lossy encoding alone does not worsen the library's loops; the baked crossfade lowers the wrap jump about fivefold. A held C3 note of 8 s rendered offline with the shipped pack keeps sounding (RMS 0.0027 at 6 to 7 s) and the largest step between neighbouring samples from 2 s to 7.5 s is 0.002.

### Not verified

- Phone decode time and memory with the large packs; the 96/64/48 MB budget is untested on devices.
- Safari and iOS decoding of the `.m4a` files and their edit-list handling (the loop positions depend on it).
- Sound quality and the loop crossfade by ear; Salamander velocity layer balance after reducing 16 layers to 5.
- Release triggers other than the Salamander hammer noise and Pianet key-up noise; Salamander string resonance and pedal samples are not used.


## Categorized palette

The downloadable collection includes four leads, four pads, four basses, four plucks, four bells/mallets, four strings, four winds/brass, four textures and four drum kits, alongside the existing six keys (including bundled Mini piano). The picker has a Category selector with counts. Installation stays per instrument; installed packs play offline. Older manifests without categories remain readable: known piano IDs appear under Keys and unknown instruments under Other.

Auditions use low bass notes, held pad/texture chords, higher bell notes and a GM drum rhythm. The audition notes are fitted to each preset's playable range at velocity 100, and their files decode before scheduling starts. Drum kits use GM note numbers: kick 36, snare 38, closed hat 42, open hat 46, crash 49. The picker explains the piano-roll note names and switching In-key off to reach drum notes. Hats are independent one-shots; choke groups are not implemented.

Source recipe and pinned SHA256 inventory: `scripts/instruments/prepare-palette.py`, `palette-sources.json` and `palette.json`. Run `python3 scripts/instruments/prepare-palette.py /path/to/sources --download`, then `node scripts/instruments/build.mjs <pack-id> --source /path/to/sources`. The recipe also reads the local Spanish guitar, Discord GM and Virtuosity Drums libraries from `~/Music/sfz` without modifying them. FreePats supplies the synth families, kalimba, water glasses and analog percussion; VSCO 2 CE supplies acoustic strings, winds, harp and three mallets. Both are CC0. The acoustic and lo-fi jazz kits are different microphone mixes of the same Virtuosity performances. The digital kit uses original deterministic FM/noise samples, dedicated to CC0. Each pack contains its licence, credits, source mapping and original README when available. The local GM bank's placeholder synth/pad files are excluded. Sonatina and the noncommercial Rhodes library are excluded.

`check-palette.mjs` uses headless Chromium to decode every new file, validate decoded loop bounds and memory budgets, render each instrument through the actual preset voice, and verify held pads/textures remain audible at 7–8 seconds. Start Vite, set `PUPPETEER_CORE` and `CHROMIUM` as described in the script, then run `node scripts/instruments/check-palette.mjs`. Listening quality and performance on physical phones are to check.
