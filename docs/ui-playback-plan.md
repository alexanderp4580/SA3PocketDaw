# Implementation plan

1. Add independent track lengths, shared repeat range and Solo helpers. Test legacy fallbacks, note bounds and preservation.
2. Rewrite scheduler range mapping, track repetition and pause/resume. Test timing, overlapping notes, solo and changes. Wire engine/UI transport.
3. Split generation preparation from committing Use; add isolated draft preview. Test previous-sound preservation and acceptance.
4. Reorganize mobile roll controls, correct snap sheet bounds, add shared repeat/track controls, gentler selectable haptics.
5. Full tests, strict checks/build, browser mobile and persistence checks, independent review, update handoff and verify HTTPS.

User follow-up: Add track must start sound creation and commit the track only on Use. Replace home waveform lanes with repeated note previews for both sound types. Shared range with shorter patterns repeating was explicitly confirmed.

Completed: all five steps and follow-up scope. 330 tests/44 files, zero typecheck errors/warnings, production build, mobile/persistence/draft browser checks and HTTPS verification passed. Independent source review reported no remaining release blockers.
