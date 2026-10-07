# Small SFX browser pack (Stable Audio 3)

Result: `models/small-sfx/` (git-ignored, 675,147,009 bytes, 21 files) has the same on-disk shape as the Small Music pack in the PoC (`public/models`). The unchanged PoC `src/worker.js` code path (`initializeRuntime`, `generate`) loaded it from a copy of the built PoC page and produced a 2 s clip from the prompt "a short laser zap" in Chrome/WebGPU. Only the model directory differs.

Date: 2026-10-07. Host: Steam Deck (8 threads, 14 GiB RAM), Python 3.13.5 in `spikes/sfx-pack/.venv`.

## Layout of `models/small-sfx/`

| File | Bytes | Origin |
| --- | ---: | --- |
| `onnx/dit_q4.onnx` + `dit_q4_chunks.json` + `dit_q4_chunk_0..3.data` | 1,083,777 + 366 + 98,717,696 / 96,731,136 / 98,566,144 / 84,082,688 | built here from the official SFX DiT |
| `onnx/decoder_q4.onnx` + `decoder_q4_chunks.json` + `decoder_q4_chunk_0.data` | 293,512 + 155 + 44,937,216 | built here from SAME-S |
| `onnx/number_conditioner.onnx` + `number_conditioner_chunks.json` | 790,593 + 84 | built here from SFX conditioner weights |
| `onnx/text_encoder_q4.onnx` + `_chunks.json` + `_chunk_0..2.data` | 2,232,988 + 330 + 98,304,000 / 99,418,112 / 14,811,136 | Small Music pack file copies; 786,432 bytes patched (see Text encoder) |
| `tokenizer/tokenizer.json`, `tokenizer_config.json` | 34,362,428 + 469 | Small Music pack copies |
| `number_conditioner.npz`, `config.json` | 790,548 + 1,141 | SFX conditioner weights in the Music pack's npz layout; Music `config.json` with `name`/`upstream` changed |
| `LICENSE.md`, `LICENSE_GEMMA.md`, `NOTICE` | 11,852 + 10,541 + 97 | byte-identical to the official repo and to the Music pack copies (sha256 compared) |

SHA-256 of every pack file: `evidence/pack-sha256.txt`. Graph contracts equal the Music pack: DiT inputs `x [1,256,t_lat]`, `t [1]`, `cross_attn_cond [1,257,768]`, `global_embed [1,768]`, `local_add_cond [1,257,t_lat]`, `padding_mask bool [1,t_lat]`, output `out [1,256,t_lat]`; decoder `latents [1,256,t_lat]` to `audio [1,2,n]`; number conditioner `seconds [1]` to `embedding [1,1,768]`; text encoder `input_ids`, `attention_mask` int64 `[1,256]` to `last_hidden_state`. `padding_mask` is a declared but unused input (the worker feeds all ones).

## Sources (checked against the HF API before download)

- `stabilityai/stable-audio-3-optimized` rev `a0109036e3009e47ba7dcb8a2fec7ee6ac0d1ef8` (not gated): `onnx/sa3-sm-sfx/dit.onnx` (1,839,539,412 B, sha256 `a4d4ef70...ccfc23`, equals the API LFS oid), `onnx/same-s/dec_bf16.onnx`, `LICENSE.md`, `LICENSE_GEMMA.md`, `NOTICE`; `onnx/sa3-sm-music/dit.onnx` (comparison only).
- `SeasonEngine/stable-audio-3-onnx` rev `04ac3512440167c6e104556f615be6c947d6ccb4`: `small-sfx/same-s/dec_dynamic_bf16.onnx` (218,652,901 B, sha256 `757e0d2a...095e01`, equals API oid; the same oid as `small-music/same-s/...`), `small-sfx/sa3-sm-sfx/dit.onnx` (b7c91ca1..., downloaded, not used), `small-sfx/t5gemma/encoder.onnx` (comparison only), `small-sfx/export-manifest.json`, tokenizer files.
- `haixin/stable-audio-3-small-music-onnx` rev `0b8a05e0bc3511e674b4cb3413d3ef6c48880cdb`: the PoC copies were hashed against the API LFS oids (text encoder graph + 3 chunks + tokenizer.json all match).
- `stabilityai/stable-audio-3-small-sfx` (the checkpoint repo) is gated; its `model.safetensors` could not be downloaded and was not needed. `evidence/source-sha256.txt` lists the downloaded source hashes.
- Intermediates (`downloads/`, `work/`, `ref/`) were deleted after validation; `download_all.sh` and `download_more.sh` re-fetch them.

## Recipe

The haixin README states: MatMul to `MatMulNBits` int4, `block_size=16`, embedding as `GatherBlockQuantized`, other initializers FP32, external data in chunks of at most 100 MB. No conversion script is published in that repo (file tree checked), so the recipe was reproduced from the README and from inspecting the published graphs (`MatMulNBits` with 3 inputs, so symmetric without zero points, attributes `bits=4 block_size=16 accuracy_level=4`, FP32 scales `[N, K/16]`, packed weights `[N, K/16, 8]` uint8, 4096-byte aligned offsets). It is not the Medium recipe (block 32, FP16 scales); block 16 with FP32 scales was used because the Music pack and the runtime it was tested with use it. Result per graph:

| Graph | MatMulNBits | MatMul left (attention QK/AV) | Q4 weight bytes |
| --- | ---: | ---: | ---: |
| DiT | 185 (Music pack: 184) | 80 | 378,097,664 (Music: 380.15 MB) |
| Decoder | 25 (Music: 25) | 24 | 44,937,216 (Music: 44,894,208) |

Stages (all scripts in this folder; run from `spikes/sfx-pack`, `P=.venv/bin/python`):

1. `./download_all.sh` (the final `model.safetensors` line fails: gated, ignore) and `./download_more.sh`.
2. `$P s0_verify_shared.py` -> `evidence/shared-components.json`.
3. `$P s1_cut_dit.py downloads/official/onnx/sa3-sm-sfx/dit.onnx work` — cuts the official DiT (inputs `t5_hidden`, `t5_mask`, `seconds_total`) at the tensors `/Concat_1_output_0` (cross-attention conditioning, text rows plus the seconds embedding) and `/Squeeze_output_0` (global embedding), which become the inputs `cross_attn_cond` and `global_embed`; renames `L`->`t_lat`, `velocity`->`out`; adds `padding_mask`. Writes the SFX padding embedding, the SFX seconds-conditioner weights (clip 0..384, divide 384, Fourier features, Gemm) and `number_conditioner.onnx`.
4. `$P s1b_decoder.py downloads/seasonengine/small-sfx/same-s/dec_dynamic_bf16.onnx work/dec/dec_cut_fp32.onnx` (run in `work/dec`), renames `latent`->`latents`, `pcm`->`audio`, fixes output dims `[1,2,n_samples]`.
5. In `work/dit` and `work/dec`: `$P ../../s3_optimize.py X_cut_fp32.onnx X_opt.onnx X_opt.onnx.data` (ORT_ENABLE_BASIC: constant folding, folds weight transposes; DiT 12,636 -> 4,531 nodes) then `$P ../../s4_quantize.py X_opt.onnx X_q4_raw.onnx 16` (ORT 1.30.0 `MatMulNBitsQuantizer`, `DefaultWeightOnlyQuantConfig(block_size=16, is_symmetric=True, accuracy_level=4, bits=4)`; 5 s for the DiT).
6. `$P s2_text_encoder.py` (copies Music text encoder + tokenizer into `work/pack`), `$P s5_shard.py work/dit/dit_q4_raw.onnx work/dit work/pack/onnx dit_q4`, same for `work/dec ... decoder_q4`, copy `work/number_conditioner.onnx`, write `number_conditioner_chunks.json` (`chunks: []`, as in the Music pack).
7. `$P s6_assemble.py /home/deck/SketchBook/Projects/sa3BrowserDaw/models/small-sfx`.

Library versions: onnx 1.23.2, onnxruntime 1.30.0, onnx-ir 1.0.0, numpy 2.5.3, tokenizers 0.23.2 (`requirements.lock.txt`). Browser: PoC ONNX Runtime Web 1.27.0, Chrome 153.0.8010.12.

## Text encoder and tokenizer sharing

- The T5Gemma weights are shared: the git blob oid of `t5gemma-b-b-ul2/model.safetensors` (aeda74048154) is identical in `stabilityai/stable-audio-3-small-music` and `-small-sfx` (API tree listing; LFS content address). `config.json` and tokenizer files have equal oids too.
- Not shared: the learned padding embedding. The Music text encoder graph bakes the padding embedding as initializer `expand_3` (`[1,256,768]` FP32, `text_encoder_q4_chunk_1.data` offset 524288, 786,432 bytes). It equals the Music DiT's `padding_embedding` exactly (max abs diff 0.0) and differs from the SFX one (max abs diff 5.04e-3, correlation 0.606; `evidence/shared-components.json`). The SFX pack therefore has the Music encoder with those 786,432 bytes replaced by the SFX `padding_embedding` tiled 256 times; every other byte equals the Music file (`s2_text_encoder.py` asserts this). The SeasonEngine SFX encoder output on padded rows equals the same SFX padding embedding (abs mean 0.00136898), which agrees with this.
- Also not shared: the seconds conditioner (`seconds_weight` max abs diff 1.30, `seconds_bias` 0.164 between Music and SFX); the pack's `number_conditioner.onnx` and `.npz` carry the SFX values. The Music pack's `.npz` matched the Music DiT exactly.
- Tokenizer: the official `tokenizer.json` is identical for Music and SFX (sha256 7794135c...114cbd, 34,362,429 B). The Music pack's copy (34,362,428 B, sha256 923de64f...2a074f) differs in exactly one field: `<mask>` (id 4) has `special: true` there and `false` in the official file. Tokenization of the test prompt through the browser's Transformers.js tokenizer gave ids `[235250, 3309, 16503, 18169, 0, ...]`, 4 valid tokens, equal to the Python `tokenizers` result. Other effects of that field are unchecked. The tokenizer chosen is the Music pack copy so the path-only change holds.

## Validation

Settings: prompt "a short laser zap", 2 s, 8 steps, seed 42, latent length 88, ORT CPU unless stated. All numbers from `evidence/*.json`.

Reference = unconverted official SFX DiT (FP32) + SeasonEngine SAME-S decoder (FP32). Text conditioning is the pack text encoder in both paths (hidden states identical, max abs diff 0.0), so these numbers isolate DiT and decoder conversion.

- Surgery check: the cut and ORT-optimised FP32 DiT reproduces the reference velocity exactly at all 8 steps (rel L2 0.0, correlation 1.0), so the cut points, `number_conditioner.onnx` and padding handling are correct.
- DiT Q4, teacher-forced velocity versus reference (reference latents as inputs): SNR 12.1, 12.1, 12.1, 11.8, 11.9, 11.7, 11.5, 11.0 dB; correlation 0.969 to 0.962. Full 8-step trajectory final latent: rel L2 0.241, correlation 0.971, SNR 12.4 dB.
- Decoder Q4 on the reference latent versus FP32 decoder: SNR 8.78 dB, correlation 0.932. The Music pack's own `decoder_q4.onnx` on the same latent gives 8.93 dB / 0.934, so the decoder matches the Music pack's quality (identical SAME-S weights in both repos' SeasonEngine exports, same oid). Asymmetric block-16 quantization measured 9.42 dB (symmetric 8.91 in the same experiment, `exp_quant.py`); HQQ was not run (needs torch, not installed).
- End to end (Q4 DiT + Q4 decoder vs reference, same noise, numpy RNG): peak 0.517 vs 0.559, correlation 0.724 over the waveform, envelope correlation 0.995, all samples finite and non-silent (`evidence/validation-python-q4.json`). WAVs: `evidence/python-q4-laser2s.wav`, `evidence/python-fp32-reference-laser2s.wav`.
- Text encoder (shared Music Q4 encoder, SFX padding patch) vs unconverted SeasonEngine SFX encoder: valid-token rel L2 0.179 / correlation 0.984 for "a short laser zap"; rel L2 0.632 / correlation 0.799 for a 12-token prompt; padded rows equal the SFX padding embedding exactly (`evidence/text-encoder-check.json`). This Q4 text-encoder error is not part of the DiT/decoder numbers above and was not propagated through an end-to-end run.
- Browser (Chrome 153.0.8010.12, headless, AMD RDNA2 `isFallbackAdapter: false`, Vulkan flags as in the PoC, external hostnames blocked, zero non-local requests): `browser/browser-smoke-sfx.mjs 2` completed in 27.7 s including model load (text encoder 3.7 s, DiT initialised 9.7 s, decoder 10.4 s, 8 steps 11.7 to 25.3 s, WAV 27.7 s). Output `evidence/browser-webgpu-small-sfx-2s.wav` (PCM16 stereo, 88,200 frames, 352,844 B), stats peak 0.2404, RMS 0.0192, 0 non-finite. The only non-200 response was `favicon.ico` (404).
- Browser versus Python on identical noise (`js_noise_compare.py`, JS LCG noise re-created): browser WAV vs the pack in ORT CPU: correlation 0.995, SNR 20.4 dB. Browser WAV vs FP32 reference: correlation 0.792, SNR 3.96 dB, envelope correlation 0.989. So the WebGPU path reproduces the CPU Q4 result and the Q4 damage on this clip is about 4 dB SNR at the waveform level with the envelope preserved. Listening was not done; audio quality and prompt adherence are unrated.

The browser copy used for the smoke test is `browser/` (PoC `public/index.html`, `worker.js`, `ort/`, `gpu-probe.onnx` copied unchanged; `public/models` symlinks to `models/small-sfx`; `serve.py` on port 8791). Run: `cd browser && node browser-smoke-sfx.mjs 2` (uses the PoC's `node_modules/puppeteer-core`).

## Licence notices carried over

All weights are derived from Stability AI models under the Stability AI Community License (`LICENSE.md`, last updated July 5, 2024); the T5Gemma encoder additionally falls under the Gemma Terms of Use (`LICENSE_GEMMA.md`; `NOTICE` reads "Gemma is provided under and subject to the Gemma Terms of Use found at ai.google.dev/gemma/terms"). Both files and `NOTICE` ship in the pack unchanged. The conversion does not change the licences. Distribution terms (the licence has a US $1,000,000 annual-revenue threshold and Derivative Works clauses) have not been reviewed here.

## Unverified or open

- No listening test; the 4 dB waveform SNR is a measurement, not a quality verdict.
- The 12-token prompt text-encoder error (corr 0.80) suggests the shared Q4 encoder is the weakest part; an SFX-specific higher-precision encoder was not built.
- The decoder keeps 6 Einsum nodes; the browser run completed with them, execution-provider assignment per node was not inspected. Mobile/Android behaviour of this pack was not tested.
- The `<mask>` special-token difference and `tokenizer_config.json` (Music pack's 469-byte file vs official 46,437 bytes) were not exercised beyond the two prompts above.
- SeasonEngine's `small-sfx/sa3-sm-sfx/dit.onnx` (different size and hash from the official one) was not compared numerically with the official DiT.
- HQQ/GPTQ-style quantization (possible quality gain) not tried.
- 10 s and longer clips and default step counts other than 8 were not run; `config.json` still carries the Music `default_seconds` 10.
