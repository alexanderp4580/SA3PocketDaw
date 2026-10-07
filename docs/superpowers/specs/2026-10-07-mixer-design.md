# Per-track mixer and meters — approved design

Status: approved by the user on 2026-10-07. Implementation in progress.

## Intended result

Give every sample and instrument track its own volume, pan, full parametric EQ and Dragonfly reverb. Make levels visible on Home and expose a usable portrait-phone mixer through the existing Mix tab. Keep the current piano roll, shared repeat range, Solo, generation drafts and offline operation.

## Proposed controls and UI

- Enable Mix. Show a vertically scrolling list of track channel cards and a master channel: track name/color, stereo level meter, volume fader with dB readout, pan with L/Center/R readout, existing Mute/Solo, and separate EQ and Reverb buttons. Reset volume/pan buttons and numeric entry supplement sliders. Transport remains available in Mix.
- EQ: use AstraCamillaGui's visual parametric EQ as the reference: colored draggable filter nodes, individual and combined response curves, clear bandwidth boundaries, focused selected-band controls, live pre/post spectrum and optional heatmap. Start with a small useful set of filters; allow adding, removing and disabling filters rather than a fixed eight-band layout. Every filter is freely positioned across the audible range and has adjustable shape, frequency (20 Hz–20 kHz, bounded to the actual sample rate), gain (±24 dB) and Q/bandwidth (Q 0.1–30) where applicable. Include bell, low/high shelf, low/high pass, band-pass, notch and advanced all-pass; adjustable pass-filter slopes (6/12/18/24/36/48 dB per octave). Provide touch-sized graph controls plus visible type, frequency, gain, width and slope controls and numeric entry, so every action is possible without desktop gestures. Add band-range listening, EQ bypass and reset. Initial settings are flat/bypassed.
- EQ in context: show the selected track clearly, with an optional differently colored spectrum overlay from other tracks to reveal frequency overlap. Keep track Solo separate from transient range listening. This supports carving distinct frequency space for kick, bass, piano, guitar and other sounds while playing the shared repeat range.
- Reverb: authentic Dragonfly Hall, Room and Plate choices, Hall initially selected. Presets and wet/dry amount, with editable algorithm-specific parameters including decay, pre-delay, width, filtering and diffusion/modulation where supported. Common controls first, advanced controls in a separate expandable area. Bypass and reset preserve source and notes. Default wet amount is zero, so old projects initially sound the same.
- Home: a compact stereo master meter near the project readouts; track meters are on the Mix screen only. The piano-note preview remains the main tappable area; a separate visible Mix shortcut opens that track's channel controls.
- Meters use actual audio samples: smoothed RMS/VU-style average plus peak markers, dBFS scale/readout and clipping indication. They are not driven by note events or animation guesses. UI refresh approximately 20–30 times/second while visible; no project persistence writes for meters.

## EQ reference and precision

Reference inspected in the local AstraCamillaGui project:

- `client/src/pages/eq/left/EqPlotArea.svelte`: spectrum/heatmap, individual and summed curves, selected-filter focus and bandwidth highlighting, draggable controls and Q gestures.
- `client/src/ui/tokens/EqTokensLayer.svelte`: colored nodes, frequency/Q labels and ring visualization.
- `client/src/pages/eq/right/EqBandColumn.svelte`: filter type selection, enable/disable and explicit parameter controls.
- `client/src/dsp/filterResponse.ts`: filter-response calculations; its fixed 48 kHz assumption must not be copied into this app.

Adapt its visual language and interactions to this project's portrait mobile UI. There is no CamillaDSP server dependency. FL Studio's Parametric EQ 2 is a behavioral reference for freely positioned filter tokens, adjustable type/width and cut slope; this proposal does not depend on its proprietary code.

Use coefficient-controlled biquad sections in a dedicated audio worklet where needed for consistent Q/width, shelf shapes and variable slopes. Native Web Audio shelving filters do not expose every requested shape control. The displayed response must use the same coefficients and actual sample rate as the audio processor, including cascaded stages. Smooth continuous edits and crossfade topology changes; measure stability and performance. EQ output trim permits level-matched comparison independently of the track volume fader.

Interpretation approved with the design: shaping the frequency range of each existing track. “Split the instruments” may mean shaping each existing track's frequency range so tracks fit together, or actual low/mid/high crossover branches with separate effects. The proposed EQ supports the first meaning. Separate multiband routing will be specified if the user confirms the second; it must not be implied by an EQ graph alone.

## Audio routing

Each track has an independent stereo processing chain:

`sample/instrument output → parametric EQ → Dragonfly wet/dry → pan → volume → mute/solo gate → track meter → master gain → master meter → speakers`

Both scheduled notes and piano-key auditions use that track's chain. Mute/Solo gate the complete signal, including reverb tails. Volume and pan affect dry and wet sound together. Parameters change with short smoothing; reverb algorithm switches use a brief crossfade. Existing master headroom is retained.

The existing instrument brightness/attack/release controls remain sound controls, separate from mixer effects. Instrument players must be keyed by track rather than source/sample ID so two tracks can share a source with different mixer and sound controls. Source buffers/profiles can still be cached by sample ID. Replacing a source keeps that track's mixer settings.

Generation draft/source previews stay isolated on their preview path and remain audible before Use. Acceptance assigns the source without altering saved mixer settings. Pause/Stop retain their current silence behavior and clear pending voices and reverb tails; changing a shared repeat range cancels old voices/tails before restarting at the new range.

## Dragonfly browser integration

Upstream distributes native plugins, not an official browser build. Compile pinned upstream DSP and the needed Freeverb3 sources to WebAssembly, with a small wrapper hosted in an AudioWorklet. Include reproducible build instructions, upstream notices, licenses and corresponding source. Do not substitute an impulse-response approximation and call it Dragonfly.

Do a focused build/impulse-render feasibility check first. Compare native and WebAssembly output, verify stereo behavior and parameter ranges, and measure worklet rendering cost. Package all runtime assets into the existing offline app shell. Reverb is initialized only when needed; rendering avoids repeated allocations and UI updates are coalesced. Idle instances should stop consuming processing time once tails finish.

If a reverb cannot initialize, keep dry playback usable, show a clear error and allow retry; do not discard settings or silently swap algorithms. Phone capacity remains to verify with real hardware, so no fixed track-count claim will be made from desktop results.

## Storage and compatibility

Add optional normalized mixer settings to each Track, and optional master volume to Project. Missing settings resolve to flat EQ, zero reverb, centered pan and nominal unity track volume. Preserve legacy tracks, notes, samples and instrument controls. Persist changes through the existing project store; validate/clamp numeric values. Replacing a sound resets only its source-specific controls, not its mixer.

## Verification and delivery

- Unit coverage for normalized settings, independent track routing, EQ behavior (frequency, gain, Q, shelving shape, cut slopes, band-pass/notch), pan/volume, mute/solo gating and persistence.
- Offline/browser renders for EQ frequency/gain/Q, stereo pan, authentic Dragonfly impulse/decay and parameter changes, real RMS/peak/clip meters, and clean Stop/range changes.
- EQ checks: displayed response matches rendered audio at 44.1/48 kHz; added/deleted nodes persist; narrow and wide bandwidth edits, steep cuts, range-listen restoration and track comparison work without altering other tracks.
- Mobile checks at 320×640 and 375×812 for mixer, EQ/reverb sheets, the Home master meter, accessible controls, transport and draft/editor regressions.
- Full tests, typecheck, build, independent review and hosted HTTPS verification before delivery.

## Sources

- Upstream project and native build requirements: https://github.com/michaelwillis/dragonfly-reverb
- Hall DSP: https://github.com/michaelwillis/dragonfly-reverb/blob/master/plugins/dragonfly-hall-reverb/DSP.cpp
- Room DSP: https://github.com/michaelwillis/dragonfly-reverb/blob/master/plugins/dragonfly-room-reverb/DSP.hpp
- Plate DSP: https://github.com/michaelwillis/dragonfly-reverb/blob/master/plugins/dragonfly-plate-reverb/DSP.hpp

- EQ UI reference: local `/home/deck/SketchBook/Projects/AstraMoode/AstraCamillaGui`.
- FL Studio EQ controls: https://www.image-line.com/fl-studio-learning/fl-studio-beta-online-manual/html/plugins/Fruity%20Parametric%20EQ%202.htm
