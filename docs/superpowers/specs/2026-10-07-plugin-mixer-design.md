# Plugin-based vertical mixer — design

Status: design approved by the user on 2026-10-07 (chat); this file is the written spec. Replaces the card-style mixer layout described in `2026-10-07-mixer-design.md`; the EQ and Dragonfly DSP, meters and project storage described there stay.

## Intended result

Every track has an ordered chain of insert plugins the user builds on the Mix screen. The Mix screen shows wide vertical channel strips that scroll sideways. A strip keeps its volume fader and level meter in a fixed place no matter how many plugins the track has.

## User-visible behavior

- Mix screen: strips scroll sideways with snap; the Master strip is last. Strips are wider than the current cards.
- Track strip, top to bottom: track name, **M**, **S**, pan knob (fixed). Below that two columns:
  - Left: the plugin stack in a fixed-height area that scrolls inside itself, ending with a visible **+** button.
  - Right: vertical volume fader with dB readout and the stereo meter, always at the same position.
- Plugin row: name, bypass toggle, move up, move down, remove; every action is a visible button, no drag. Tapping the name opens the plugin editor.
- **+** opens a plugin list sheet. At launch the types are **EQ** and **Reverb**. Each type can be added any number of times per track, up to 6 plugins per track.
- EQ editor: the existing parametric EQ editor, bound to that plugin instance. Reverb editor: the existing Dragonfly editor (Hall, Room, Plate, presets, advanced parameters), bound to that instance.
- Master strip: fader and meter only; no plugin stack.
- The shared reverb bus does not exist; reverb is an insert plugin only.
- Home: unchanged except that the track Mix shortcut opens the Mix screen scrolled to that track's strip.

## Data model

- `TrackMix` = `volumeDb`, `pan`, `plugins: PluginInstance[]`. `PluginInstance` = `id` (unique within the track), `type` (`eq` | `reverb`), `bypass`, `settings` (type-specific, normalized by the type).
- Plugin type registry: one entry per type with label, default settings, settings normalizer, audio node factory and editor component. Adding a plugin type later means adding one registry entry.
- Normalization is total: unknown types are dropped, duplicate ids are renamed, more than 6 plugins are truncated, corrupt settings fall back to defaults.
- Migration of saved projects: a track with legacy `eq`/`reverb` settings becomes `plugins` = EQ first if it has at least one enabled band or non-zero trim, then Reverb if its wet amount is above zero; bypass flags carry over. A track with neither gets an empty list. Volume and pan are preserved. Legacy fields are not written back.

## Audio

- Per track: source → plugin 1 → … → plugin N → pan → volume → mute/solo gate → meter → master.
- Each plugin instance owns its own audio node, created by the registry factory. Bypass makes the node pass audio through unchanged. Settings changes update the node without rebuilding the chain.
- Adding, removing or reordering rebuilds the connections with short gain fades so there are no clicks.
- EQ node exposes its own pre/post spectrum and band-listen; the reverb node loads its Dragonfly WASM on demand (bytes passed to the worklet) and keeps its tail until it decays; the existing mute/solo gate behavior is kept.
- The fused per-track effects worklet is replaced by one EQ processor and one reverb processor that reuse the existing DSP.

## Not in scope

New plugin types, drag reordering, plugins on Master, automation, sidechain, preset sharing between tracks.

## Testing

- Pure model: normalization, migration, add/remove/move/bypass helpers, limits.
- Audio: node order, bypass transparency, reorder changes the result for non-commutative chains, removal disposes nodes, reverb tail and mute behavior, EQ response and volume/pan levels unchanged from the current verified values.
- Browser (Chromium at 320×640 and 375×812): no horizontal overflow inside a strip, the fader and meter positions do not change when plugins are added or removed, stack scrolls inside its own area, every action reachable, edits and plugin order survive reload, offline use still works.
