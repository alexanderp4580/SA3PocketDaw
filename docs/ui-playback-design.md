# Mobile editing and shared playback

User intent: make the mobile controls understandable, edit track patterns of independent lengths, repeat a specific shared bar range while hearing the other tracks, and audition generated sounds before choosing Use.

- Piano roll header contains navigation and note undo/redo. Track length and Solo form a track-control group. Snap, scale restriction and Clear form a note-edit group. Sound editing has its own purple Sound control, opening a separate sheet; source replacement is a distinct section there. Snap picker uses the common viewport sheet.
- Add track opens generation without creating anything. Use creates a track with its accepted sound and opens the roll; closing/cancelling leaves no empty track. Fresh projects start with no tracks. Existing projects remain intact. Home lanes show miniature piano rolls for both samples and instruments, with shorter patterns repeated across the shared timeline.
- Each track stores its own bar count (1–16); existing tracks inherit the saved project length. Changing length preserves notes outside the active pattern so expansion restores them. Timeline length is the longest active track. Short patterns repeat along that timeline.
- One project repeat range (inclusive start/end bars) is shared by all tracks and visible/editable from transport and roll. Choosing bars 2–3 replays that timeline range together; the edited track stays in context. Solo temporarily isolates selected tracks. Mute takes precedence.
- Play changes to Pause. Pause preserves position and resumes overlapping notes; Stop returns to the repeat start. Repeat-range changes restart playback at the new start and cancel queued old events.
- Generate prepares a draft and offers Preview and primary Use sound. The existing track sound remains unchanged until Use. Regenerate/discard never delete the previous sound. Saved metadata and source are committed only on Use.
- Haptics default to a shorter 3 ms pulse and have a visible Off/Light setting. Browsers determine actual vibration strength.

Checks: mobile viewport at 320/375 px including snap picker bounds; per-track length/legacy migration/notes preserved; shared-range scheduling with repeating short tracks, solo/mute, pause/resume and range changes; draft acceptance/discard and persistence; real instrument preview/worklet and mixed playback; full tests/typecheck/build; independent review; hosted link.
