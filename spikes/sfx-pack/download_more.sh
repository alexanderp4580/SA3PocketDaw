#!/bin/sh
# Extra comparison sources (run from spikes/sfx-pack).
P=.venv/bin/python
$P dl.py SeasonEngine/stable-audio-3-onnx small-sfx/t5gemma/encoder.onnx downloads/seasonengine
$P dl.py SeasonEngine/stable-audio-3-onnx small-sfx/t5gemma/tokenizer.json downloads/seasonengine
$P dl.py SeasonEngine/stable-audio-3-onnx small-music/t5gemma/tokenizer.json downloads/seasonengine
$P dl.py stabilityai/stable-audio-3-optimized onnx/sa3-sm-music/dit.onnx downloads/official
$P dl.py stabilityai/stable-audio-3-optimized LICENSE.md downloads/official
$P dl.py stabilityai/stable-audio-3-optimized LICENSE_GEMMA.md downloads/official
$P dl.py stabilityai/stable-audio-3-optimized NOTICE downloads/official
echo ALLDONE
