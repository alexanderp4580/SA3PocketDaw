# Instrument palette implementation plan

> Execute inline using executing-plans. User approved the in-chat 10-category, four-sound palette and deployment.

**Goal:** At least four distinct, usable instruments per category: leads, pads, bass, plucks, bells/mallets, keys, strings, winds/brass, textures/effects and drum kits. Existing keys count. Preserve individual downloads and offline playback. Deploy to Coolify after verification.

**Architecture:** Extend existing SFZ -> AAC/preset.json pack builder and manifest, no new playback subsystem. Add optional category and preview-note metadata, preserving old manifests. Category filter in existing picker with accessible visible buttons. Appropriate bass/drum previews. Sources must permit redistribution; carry original licences and mapping attribution. Reject placeholder oscillators and unsupported musical behaviors rather than silently publishing them. Original procedural sample sources may supply distinct electronic drum kits with reproducible provenance.

### Task 1: Prepare sources and build library
- Inspect licences and source opcodes. Download pinned FreePats/CC0 libraries, use local licensed instruments and CC0 orchestral sources as needed.
- Add reproducible source inventory and pack definitions. Build >=4 distinct sounds in each category, preserve loops and sensible envelopes. Record source checksums and build statistics. Avoid copying source libraries into git.
- Verify generated presets, file existence, actual decoded audio, key coverage and loop bounds. Existing keys are retained.

### Task 2: Browse and preview by category
- Write failing tests for category metadata roundtrip/defaults, category filters/counts and low-register/drum preview sequences.
- Extend pack manifest metadata, card mapping and picker filters. Preserve installs/retries and older packs. Drum previews use mapped drum notes; bass previews use low notes; pad notes sustain longer if needed.
- Run targeted tests and typecheck; document source inventory and user behavior.

### Task 3: Verify, publish and deploy
- Run full tests, typecheck, build. Headless real Chromium decode/render verification for every new pack, sustained loop seams, mobile category/download/preview/use and offline reload.
- Fresh whole-branch review; resolve material findings with regression tests.
- Upload only new packs and merged manifest to existing HF repo using TokenCrypt. Preserve old generation-model entries and existing packs.
- Commit, fast-forward/push main, trigger existing Coolify application. Verify successful deployment commit and production mobile download/playback.

**Review focus:** Licence provenance; dummy SFZ rejection; repeated/unsupported layers and controllers; missing key coverage; AAC loop bounds/seams and sustained notes; memory budgets; backwards manifest compatibility; drum mapping and previews; mobile overflow; publish manifest preserving existing assets.
