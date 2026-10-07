#!/bin/sh
# Downloads the SFX sources into downloads/ (run from spikes/sfx-pack).
P=.venv/bin/python
$P dl.py SeasonEngine/stable-audio-3-onnx small-sfx/sa3-sm-sfx/dit.onnx downloads/seasonengine
$P dl.py SeasonEngine/stable-audio-3-onnx small-sfx/same-s/dec_dynamic_bf16.onnx downloads/seasonengine
$P dl.py SeasonEngine/stable-audio-3-onnx small-sfx/export-manifest.json downloads/seasonengine
$P dl.py stabilityai/stable-audio-3-optimized onnx/sa3-sm-sfx/dit.onnx downloads/official
$P dl.py stabilityai/stable-audio-3-optimized onnx/same-s/dec_bf16.onnx downloads/official
$P dl.py stabilityai/stable-audio-3-small-sfx model_config.json downloads/hf-sfx
$P dl.py stabilityai/stable-audio-3-small-sfx model.safetensors downloads/hf-sfx
echo ALLDONE
