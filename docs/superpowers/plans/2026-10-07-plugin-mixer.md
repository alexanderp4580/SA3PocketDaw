# Plugin-based vertical mixer — plan

Spec: `docs/superpowers/specs/2026-10-07-plugin-mixer-design.md`. Branch: `mixer-plugins` in worktree `/home/deck/SketchBook/Projects/sa3BrowserDaw-plugins` (from `main` plus the `feedback-gen-prompt-meters` branch). Not merged to `main` until the user approves on the phone. Implementation by Sonnet workers, test-first; one independent review after tasks 2 and 3, one whole-branch review at the end.

Fixed constraints: portrait phone, every action a visible button, no tombstone wording in docs/comments, no co-author trailers, no push. Baseline at start: 364 tests, typecheck clean.

## Tasks

- [ ] 1. Plugin model and migration (pure). Proves: tracks hold an ordered plugin list; legacy saved tracks migrate without changing their sound settings.
  - Interfaces: `PluginType`, `PluginInstance`, `TrackMix` (volumeDb, pan, plugins), `MAX_PLUGINS = 6`, plugin type registry (label, defaults, normalize), helpers add / remove / move(id, ±1) / setBypass / updateSettings over the immutable project helpers in `src/store/projectModel.ts`; `normalizeMix` accepts legacy `eq`/`reverb`.
  - Test assertions: unknown types dropped; duplicate ids renamed; list truncated to 6; corrupt settings fall back to defaults; legacy track with enabled EQ band and wet > 0 migrates to [eq, reverb] in that order with bypass preserved; legacy track with neither migrates to []; volume and pan preserved; move at the ends is a no-op; add beyond the limit is rejected; legacy fields are not present after normalization.
  - Command: `npx vitest run src/audio/mixer src/store` exits 0.
- [ ] 2. Audio chain. Proves: audio flows through each track's plugins in order, and structure changes are click-free. Depends on 1.
  - Interfaces: plugin node contract (input, output, update(settings, bypass), dispose; EQ node also spectrum(post) and listen(band)); registry factory per type; the mixer controller builds `input → plugins → pan → volume → gate → meter → master`; controller API gains `spectrum(trackId, pluginId, post)` and `listen(trackId, pluginId, band)`; the fused per-track effects processor is replaced by an EQ processor and a reverb processor reusing the existing DSP; the shared reverb bus is removed.
  - Test assertions: node order equals list order; bypass output equals input; removing a plugin disposes its node; reordering rebuilds connections with fades (no step in the gain curve above a fixed small bound); mute/solo gate still silences tails; reverb WASM bytes reach the worklet; unchanged levels for volume −6 dB and hard pan (the existing measured values).
  - Commands: `npm test`, `npm run typecheck`, `npm run build` exit 0. Real-browser audio render in Chromium: EQ bell +12 dB gives +12 dB at the centre frequency; EQ→Reverb and Reverb→EQ give different outputs; reverb tail present and cut by mute.
  - Review: independent reviewer after this task (real-time allocation, initialization races, removed plugins, corrupt settings).
- [ ] 3. Mix screen UI. Proves: the layout and plugin workflow. Depends on 2.
  - Interfaces: `MixScreen` with sideways-scrolling snapping strips; `ChannelStrip` (fixed header: name, M, S, pan; two columns); `PluginStack` (rows with name, bypass, up, down, remove; scrolls inside its own area; **+** button); `PluginPicker` sheet; `EqSheet` and `ReverbSheet` take a track id and a plugin id; Master strip with fader and meter only; Home Mix shortcut opens Mix scrolled to that strip.
  - Test assertions (component or logic level): add, remove, move and bypass update the project; **+** disabled at 6 plugins with a visible reason; editors read and write only their plugin's settings; two EQ plugins on one track keep separate settings.
  - Browser checks at 320×640 and 375×812: no horizontal overflow inside a strip; fader and meter bounding boxes identical with 0, 3 and 6 plugins; stack scrolls internally; all buttons reachable; plugin order and settings survive reload.
  - Review: independent reviewer after this task (layout stability, accessibility of controls, regressions in Home and the roll).
- [ ] 4. Verify and deliver. Depends on 3.
  - Full tests, typecheck, build; browser audio checks repeated for the new chain (volume, pan, EQ, reverb tail, mute/solo, offline reload with the service worker); `docs/handoff.md` section updated; this plan updated; whole-branch review; fixes then the full suite again.
  - Host the branch build for phone testing on the Deck over LAN HTTPS (ports different from the main checkout's server: HTTPS 8444, HTTP 8083; certificate from the main checkout's `certs/`) and send the link.

## Ledger

- Merge: `feedback-gen-prompt-meters` merged into `mixer-plugins`; `public/dragonfly/source.tar.gz` and the earlier mixer plan conflicted and were resolved; baseline 364 tests, typecheck 0 errors.
