# Dragonfly browser DSP

Upstream: https://github.com/michaelwillis/dragonfly-reverb
Pinned commit: 440ec7b3b3db2fec34b9f80cf4890102ca14d1c3

Hall/Room/Plate DSP and required Freeverb3 sources retain upstream copyright and GPL notices. Only plugin UI Artwork includes were removed. The minimal Distrho headers provide float comparison and replace native SSE denormal register configuration (not applicable in WASM). Audio algorithms are unchanged. The wrapper provides a reproducible uniform libc RNG so Room modulation is consistent across native/WASM libc implementations.

Install/activate Emscripten SDK 3.1.64, then run `npm run build:dragonfly`. No runtime compiler dependency. The three checked-in public/dragonfly/*.wasm files are the runtime assets, each ~85 KB. Render memory is fixed at 32 MiB per active reverb instance, allocated lazily per track; render buffers are reused. An algorithm crossfade briefly needs two instances. Phone performance/polyphony remains to check on actual hardware.

For native comparison, install g++ and libc development headers, then run `VERIFY_NATIVE=1 npm run build:dragonfly`. The comparison renders a 48 kHz stereo impulse through each actual DSP, checks finite output/energy/stereo/tails, compares native and WASM sample by sample, and verifies near-zero output after mute. Native temporary executables/output are written to /tmp. Native compiler optional additional include flags can be set with NATIVE_CPPFLAGS.

`npm run build` packages corresponding application and DSP source as `/dragonfly/source.tar.gz`, with build scripts and lockfile. Run `npm install`, compile DSP with the pinned SDK, then `npm run build` to reproduce the app. Native plugin artwork and plugin hosts are not part of the browser integration. Runtime assets, license and source archive are precached for offline use.
