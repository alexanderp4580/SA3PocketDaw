# Follow song implementation plan

Goal: extend the approved Generate bars flow to generate a pitched part that hears piano context, then preview it with the existing song before one-step acceptance.

Bounded scope: Cloud inpainting for 1–2 selected bars using the existing async Stability API client, piano transcriber, bundled Mini piano, pattern playback and note history. Existing standalone generation remains available on device and Cloud. No local audio-encoder pack or drum transcription is introduced.

Interfaces and tasks:
- [x] `src/melody/context.ts`: pure `contextPlan(project, trackId, startBar, bars, contextIds)` produces piano events for 2 lead bars + selected gap + the exact first 2 bars repeated as the tail, min 6 seconds. Loop each track at its own pattern length, include target notes as seed outside the gap, omit muted background tracks. Collect selected-range background notes for stripping. Test wrapping, held notes, empty context and removal tolerance.
- [x] `src/melody/renderContext.ts`: render plan events with bundled Mini piano in OfflineAudioContext using preset region voices; normalize and blank the mask including release tails, then copy the first part sample-for-sample after the gap; encode stereo 44.1kHz PCM16 WAV. Check cancellation before/after asynchronous steps. Test WAV roundtrip, exact mask zeros and normalized bounds.
- [x] Extend `CloudParams` with optional inpaint audio/mask. Route only that request to `/v2beta/audio/stable-audio/inpaint`; same key redaction/cancellation/deadline/polling. Reject invalid mask/audio parameters before network. Test multipart fields, masking validation, cancellation and secret redaction.
- [x] `generateContextBars` uses render -> inpaint -> crop selected region -> transcribe -> strip context onset matches -> quantize. Keep raw notes and removed count; reject empty/copy-only results. Test crop offsets, preservation, cancellation, empty/copy-only takes and malformed/short outputs.
- [x] Extend GenerateBarsSheet with Follow song, explicit pitched context track selection, Cloud requirement, summary and Preview with song. Add note-only preview that leaves all source references installed. Stamp the full context and project key/scale against stale acceptance. Reuse Keep/Discard and undo.
- [ ] Tests/typecheck/build, independent reviewer, real rendering/transcription and live API check when an approved credential is available. Merge, push and deploy with TokenCrypt; production browser verification before completion.

Evidence: Stability official `/v2alpha/openapi`, retrieved 2026-10-18. Inpaint is async 202, audio 6..380 s, masks in seconds, stable-audio-3, 4..8 steps, 8 credits. Current browser packs include no SAME audio encoder. Prior sa3test lessons support piano-only context, a silent gap and background onset stripping at 0.15 s.

Review focus: source profiles survive preview; abort never applies a take; context changes invalidate a take; exact crop/mask times and wrap phase; keys/audio not logged or persisted; empty or copied context does not overwrite notes.

Execution: inline under the user's explicit implement-and-deploy instruction. Preserve the existing demo worktree and production until verified.
