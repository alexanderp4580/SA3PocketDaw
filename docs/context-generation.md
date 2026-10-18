# Follow song

In a track's piano roll, Generate bars → Follow song generates one or two selected bars using the surrounding musical material. It requires Cloud with a saved Stability AI key and the downloaded Piano transcriber. Standalone generation retains its On device and Cloud choices.

Choose pitched context tracks; unmuted preset/instrument tracks with notes start checked. Leave drum tracks unchecked. The target's existing selected phrase is also used as a piano seed when present. Other selected tracks repeat at their own pattern lengths. Context uses the piano-roll patterns rather than Layout placements.

The browser renders two bars of dry Mini piano, leaves a silent generation gap, then repeats the exact first part after that gap. The repeated tail is copied sample-for-sample, including its timing and level. It guides the generated part back toward the first part so a loop has a return point. The complete input is at least six seconds, as required by the API; it is sent as stereo 44.1 kHz PCM16 WAV directly to Stability AI's Stable Audio 3 inpaint endpoint. Cost: 8 credits per successful take. Audio is not sent to the hosting server, logged, saved in the project or exported as source metadata.

Only the selected gap is cropped from the returned audio and transcribed locally. The input gap is silent, so generated notes matching the song's pitches and timing remain valid: unisons and repeated phrases are kept. Notes are quantized to sixteenths. An empty playable transcription is an error and does not overwrite the track.

Preview with song temporarily plays the new notes with the track's real sound and the other unmuted tracks at their matching pattern phases. It clears solo flags only in that temporary preview. Stop and closing the sheet restore the saved project and preserve all instrument source references. Keep replaces only the selected range in one note-history edit. Notes outside the range are preserved; Undo restores the previous notes. Changes to context notes, sounds, tempo, key or scale invalidate the draft take.

Verification: pure wrapping/masking/cropping/unison-preservation and cloud request tests, real Mini piano rendering, real ByteDance transcription with a deterministic inpaint-response fixture, and browser preview/Keep/Undo/Redo/reload/stale/cancel checks. The actual paid inpainting request needs a Stability credential for independent end-to-end verification; no key was supplied to the implementation session. Real SA3 musical adherence and listening quality remain to check. A prompt and loop sandwich guide the model but do not guarantee a musically seamless result.

API contract: https://api.stability.ai/v2alpha/openapi (retrieved 2026-10-18), `POST /v2beta/audio/stable-audio/inpaint`, async 202 plus results polling, `audio`, `mask_start`, `mask_end`, `duration`, `prompt`, `model`, `steps`, `seed`, `output_format`.

When a take produces no playable notes, Generate bars retains the generated gap as stereo WAV with playback and download controls. No notes are added. Debug → Copy report includes the mono transcription input level, duration, detected note count and pitch range for that failed take. The audio stays in this sheet until it is closed or another take starts.
