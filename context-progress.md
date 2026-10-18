# Context bars ledger — docs/superpowers/plans/2026-10-18-context-bars.md

Baseline main 5cf7be8, clean; prior fresh release verification 1100 tests and production real SA3 + transcription passed. Work continues in existing isolated worktree on feature/context-bars.
Ruling: use Cloud for audio-conditioned generation because the installed browser packs lack an audio encoder. Leave standalone source choices intact. Requesting an existing TokenCrypt Stability secret name for live API verification; no key is requested in chat.
Ruling: render pattern context at each track's own repeat length. Explicit context-track checkboxes let the user exclude drums; preset/instrument tracks default selected. Include the target's existing phrase as seed outside the generation mask. Background is removed by onset/pitch matches, with the known limitation that intentional unison cannot be separated reliably.

User correction: input must repeat the first part after the gap to guide looping. Planner repeats prefix events; renderer copies the exact prefix PCM after the mask. Only the gap is transcribed and kept. Added plan/event/waveform regressions that failed before the change.

Tasks 1–5 implemented. New planner, WAV renderer, Cloud inpaint option, crop/transcribe/strip pipeline and with-song preview. Targeted tests RED/GREEN; full suite 1118 passes, typecheck 0 errors/warnings, production build b33c3003e49f. Independent reviewer found no important defects.
Browser375: real piano input + real ByteDance transcription against deterministic inpaint response fixture: 5 retained notes, 8 background matches removed, gap peak0, repeated-tail error0, background preserved, Keep/Undo/Redo/persistence pass, stale context disables Keep, no overflow/errors. API preflight for the production origin returns204. Paid live API call still requires credential from user.
