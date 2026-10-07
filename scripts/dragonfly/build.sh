#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
# Emscripten SDK 3.1.64 (em++ must be on PATH). DSP source pinned in vendor/dragonfly/UPSTREAM.
parts=(allpass biquad comb delay delayline earlyref efilter nrev nrevb progenitor progenitor2 revbase slot strev utils zrev zrev2)
sources=(); for part in "${parts[@]}"; do sources+=("vendor/dragonfly/common/freeverb/$part.cpp"); done
mkdir -p public/dragonfly
for algorithm in hall room plate; do
 flags=(-std=c++11 -O3 -DLIBFV3_FLOAT -Wno-deprecated -Ivendor/dragonfly -Ivendor/dragonfly/common -I"vendor/dragonfly/$algorithm")
 em++ "${flags[@]}" scripts/dragonfly/wrapper.cpp "vendor/dragonfly/$algorithm/DSP.cpp" "${sources[@]}" -s STANDALONE_WASM=1 --no-entry -s ALLOW_MEMORY_GROWTH=0 -s INITIAL_MEMORY=33554432 -s 'EXPORTED_FUNCTIONS=["_dr_create","_dr_destroy","_dr_buffer","_dr_param","_dr_mute","_dr_process"]' -o "public/dragonfly/$algorithm.wasm"
 if [ "${VERIFY_NATIVE:-0}" = 1 ]; then
  nativeflags=(); if [ "$algorithm" = room ]; then nativeflags+=(-DROOM); fi; if [ "$algorithm" = plate ]; then nativeflags+=(-DPLATE); fi
  g++ ${NATIVE_CPPFLAGS:-} "${flags[@]}" "${nativeflags[@]}" -DNATIVE_VERIFY scripts/dragonfly/wrapper.cpp "vendor/dragonfly/$algorithm/DSP.cpp" "${sources[@]}" -o "/tmp/sa3-dragonfly-$algorithm"
  "/tmp/sa3-dragonfly-$algorithm" > "/tmp/sa3-dragonfly-$algorithm.f32"
 fi
done
cp vendor/dragonfly/LICENSE public/dragonfly/LICENSE
if [ "${VERIFY_NATIVE:-0}" = 1 ]; then node scripts/dragonfly/verify.mjs; fi
