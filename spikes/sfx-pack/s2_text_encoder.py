"""Stage 2: Small Music text encoder files with the baked padding-embedding tensor
(expand_3, [1,256,768] FP32, in text_encoder_q4_chunk_1.data) replaced by the SFX
padding embedding. All other bytes are unchanged."""
import shutil, hashlib, json, numpy as np
POC = '/home/deck/Documents/Codex/sa3-browser-poc/public/models'
OUT = 'work/pack'
for f in ['text_encoder_q4.onnx', 'text_encoder_q4_chunks.json', 'text_encoder_q4_chunk_0.data', 'text_encoder_q4_chunk_1.data', 'text_encoder_q4_chunk_2.data']:
    shutil.copyfile(f'{POC}/onnx/{f}', f'{OUT}/onnx/{f}')
for f in ['tokenizer.json', 'tokenizer_config.json']:
    shutil.copyfile(f'{POC}/tokenizer/{f}', f'{OUT}/tokenizer/{f}')
pe = np.load('work/padding_embedding.npy').astype(np.float32)
patch = np.tile(pe, (256, 1)).tobytes()
assert len(patch) == 786432
p = f'{OUT}/onnx/text_encoder_q4_chunk_1.data'
with open(p, 'r+b') as f:
    f.seek(524288); old = f.read(len(patch)); f.seek(524288); f.write(patch)
sha = lambda b: hashlib.sha256(b).hexdigest()
a = open(f'{POC}/onnx/text_encoder_q4_chunk_1.data', 'rb').read(); b = open(p, 'rb').read()
diff = [i for i in range(0, len(a), 4096) if a[i:i+4096] != b[i:i+4096]]
print('bytes changed region', 524288, 524288 + len(patch), 'size equal', len(a) == len(b), 'diff pages', diff[0] if diff else None, diff[-1] if diff else None)
assert a[:524288] == b[:524288] and a[524288 + len(patch):] == b[524288 + len(patch):]
print('old region sha', sha(old)[:16], 'new region sha', sha(patch)[:16])
