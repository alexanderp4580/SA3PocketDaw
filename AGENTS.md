# sa3BrowserDaw

## Purpose

Proof-of-concept phone DAW in the browser: Stable Audio 3 generates instrument samples on-device, a piano roll plays them. Hosted from the Steam Deck for sharing. Design: `docs/design.md`.

## Ownership

- `docs/`: design, handoff and compatibility notes. `src/`: app. `server/`: static HTTPS host. `scripts/`: manifest and model-link helpers. `models/`, `certs/`, `dist/`, `node_modules/`: ignored.

## Local Contracts

- No server-side inference; the host only serves static files.
- Everything needed after the first visit must work offline; model files come from Cache Storage once installed.
- Mobile first, portrait only; every action has a visible button; no swipe actions.
- Every module logs through `src/log`; the Debug screen and report must show real data.
- Docs and comments describe only what exists now; no mentions of removed or replaced things.
- Unverified device or API claims are marked "to check".
- Never add co-author trailers to commits.

## Work Guidance

- TypeScript (strict), Svelte 5, Vite, Vitest, svelte-check; style from AstraCamillaGui. Tests first for logic (Vitest, node environment; browser APIs are injected fakes).
- `onnxruntime-web` 1.27.0 and `@huggingface/transformers` 3.8.1 are pinned exactly. `npm run prepare-assets` (run by `dev` and `build`) copies the ORT WASM files into ignored `public/ort/` and checks `public/gpu-probe.onnx`.
- Commands: `npm run dev|build|test|typecheck|manifest|models:link|serve`. `models:link` symlinks the PoC model files into `models/`; `manifest` writes `models/manifest.json` (packs `encoder`, `small-music`, `medium`; `small-sfx` only when `models/small-sfx/` exists). `scripts/make-cert.sh` writes the self-signed cert; `serve` listens on HTTPS 8443 and HTTP 8082 (`HTTPS_PORT`, `HTTP_PORT` override).
- Modules: `src/log` (ring-buffer logger, `log.scope(name)`, worker forwarding via `forwardLogs`/`ingestWorkerMessage`, report builder with registered providers), `src/compat` (`evaluate` pure rules, `probeEnvironment`/`runCompat` collect the real environment), `src/store/modelManager.ts` (manifest, Cache Storage install state, download, delete, persistence), `src/audio` (`samplePrep` mono 44.1 kHz trim/fade/normalize to -1 dBFS; `pitch` multi-window harmonic spectral detection plus `rootFromDetection` (C4 fallback below confidence 0.7) and note names; `sampler` playback rate and voices over an AudioContext-like interface; `scheduler` look-ahead loop over a pattern with injected clock/timer, events carry velocity as 0..1 gain; `instrument/` analyses isolated notes in a worker, prepares sinc attacks/notched noise and plays evolving partials in an AudioWorklet; `engine` wires sample and instrument playback, context, master gain, caches and scheduler, context created on `unlock()`), `src/store/projectModel.ts` (pure immutable project/track/note helpers, notes snapped to 16ths, MIDI 24..96, velocity 1..127 with missing = 96), `src/store/projectStore.ts` (IndexedDB `sa3daw`: `project` slot `current` and `samples` by id; debounced 500 ms save with `flush()`; `subscribe` store; unreferenced samples deleted on track removal/replacement and on load; `registerClear(addClearHook)`), `src/gen` (generation: `client.ts` main-thread queue and error mapping, `worker.ts` module worker, `pipeline.ts` stage logic over the `Ports` interface, `ortRuntime.ts` the only file touching ONNX Runtime and the tokenizer, `layout.ts` manifest path resolution and graph reading, `sampling.ts`, `float16.ts`, `timing.ts`, `prompt.ts`, `protocol.ts` message types and guards), `src/components` (Nav, KnobDial, HSlider), `src/app/screens/PianoRoll.svelte` (PocketDaw cursor-edited piano roll from `PocketDaw/docs/screens.md`: header with sample chip and undo/redo, Grid/In-key/Loop chips, info line, ruler plus key rows, D-pad | Keys play surface with velocity strip; positioned divs inside one scroll container so the sticky ruler and key column scroll with the grid; no transport, the shell owns it; logic in `src/app/pianoroll`: `geometry` row/cell/ruler mapping and scroll reveal, `cursor` grid steps, in-key pitch moves, target rule, jumps, info line and velocity mapping, `edit` place/delete/length/velocity over the project helpers, `keyboard` one-octave layout, `history` undo/redo stack, `repeater` hold-to-repeat timing; `harness.html` is a dev-only page at `/src/app/pianoroll/harness.html`, not part of the build), `src/styles/theme.css`.
- Model files live in Cache Storage `sa3-models-v1`; the manifest copy in `sa3-manifest-v1`. `clearAllAppData` runs hooks registered with `addClearHook`; project and sample stores register theirs.

## Verification

- `npm test`, `npm run typecheck`, `npm run build`. The headless smoke test is not built yet.

## Child DOX Index

None.
