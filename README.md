# SA3 Pocket DAW

Browser DAW with on-device Stable Audio 3 sample/instrument generation, piano rolls, per-track mixing, parametric EQ and authentic Dragonfly effects.

`npm ci`, then `npm run dev`. Production: `npm run build`. Check: `npm test` and `npm run typecheck`.

Model files are hosted at https://huggingface.co/alexanderp4580/sa3-browser-models (the local copy is the separate repository `SA3BrowserModels`; `models/` is ignored here, `npm run models:link`). The build variable `VITE_MODELS_BASE_URL` (absolute URL ending in `/`, e.g. `https://huggingface.co/alexanderp4580/sa3-browser-models/resolve/main/`) makes the app fetch `manifest.json` and model files from that host with CORS instead of same-origin `models/`; the host must allow CORS under COEP. Pass it as a Docker build argument; Coolify has it set as a build variable.

Coolify builds the Dockerfile and publishes its port 80 at https://pocketdaw.io.liveleds.io. Browser inference requires a compatible WebGPU device; the server serves static files only.

Dragonfly source, license and reproducible WASM build instructions: `vendor/dragonfly/README.md`. The application serves a corresponding source archive at `/dragonfly/source.tar.gz`.
