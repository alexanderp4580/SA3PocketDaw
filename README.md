# SA3 Pocket DAW

Browser DAW with on-device Stable Audio 3 sample/instrument generation, piano rolls, per-track mixing, parametric EQ and authentic Dragonfly effects.

`npm ci`, then `npm run dev`. Production: `npm run build`. Check: `npm test` and `npm run typecheck`. Model files live in the separate repository `SA3BrowserModels` (Git LFS); `models/` is ignored here (`npm run models:link`).

Build variable `VITE_MODELS_BASE_URL` (absolute URL ending in `/`, e.g. `https://huggingface.co/alexanderp4580/sa3-browser-models/resolve/main/`) makes the app fetch `manifest.json` and model files from that host with CORS instead of same-origin `models/`; the host must send CORS headers and `Cross-Origin-Resource-Policy: cross-origin` or allow CORS under COEP. Pass it as a Docker build argument.

Coolify builds the Dockerfile and publishes its port 80 at https://pocketdaw.io.liveleds.io. Model files are served at `/models/` from the host directory `/data/pocketdaw/models`, mounted at `/models`. That directory is a clone of `git@github.com:alexanderp4580/SA3BrowserModels.git` and is not part of the image. Browser inference requires a compatible WebGPU device; the server serves static files only.

Dragonfly source, license and reproducible WASM build instructions: `vendor/dragonfly/README.md`. The application serves a corresponding source archive at `/dragonfly/source.tar.gz`.
