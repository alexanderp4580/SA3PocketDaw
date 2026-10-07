# SA3 Pocket DAW

Browser DAW with on-device Stable Audio 3 sample/instrument generation, piano rolls, per-track mixing, parametric EQ and authentic Dragonfly effects.

`npm ci`, then `npm run dev`. Production: `npm run build`. Check: `npm test` and `npm run typecheck`. Models are stored in Git LFS under `models/`; run `git lfs install` and `git lfs pull` for a complete local set.

Coolify builds the Dockerfile and publishes its port 80 at https://pocketdaw.io.liveleds.io. Model files are served at `/models/` from the host directory `/data/pocketdaw/models`, mounted read-only at `/models`; it holds the same files as `models/` in this repo and is not part of the image. Browser inference requires a compatible WebGPU device; the server serves static files only.

Dragonfly source, license and reproducible WASM build instructions: `vendor/dragonfly/README.md`. The application serves a corresponding source archive at `/dragonfly/source.tar.gz`.
