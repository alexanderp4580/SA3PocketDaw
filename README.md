# SA3 Pocket DAW

Browser DAW with on-device Stable Audio 3 sample/instrument generation, piano rolls, per-track mixing, parametric EQ and authentic Dragonfly effects.

`npm ci`, then `npm run dev`. Production: `npm run build`. Check: `npm test` and `npm run typecheck`.  Model files are not in git; `models/` is ignored locally (`npm run models:link`).

Coolify builds the Dockerfile and publishes its port 80 at https://pocketdaw.liveleds.io. Model files are served at `/models/` from a persistent host directory `/data/pocketdaw/models`, mounted read-only at `/models`. Models are kept outside the image so deployments retain downloaded assets. Browser inference requires a compatible WebGPU device; the server serves static files only.

Dragonfly source, license and reproducible WASM build instructions: `vendor/dragonfly/README.md`. The application serves a corresponding source archive at `/dragonfly/source.tar.gz`.
