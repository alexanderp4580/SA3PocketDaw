"""Reference: unconverted official SFX DiT + SeasonEngine SAME-S decoder (FP32, ORT CPU).
Text conditioning comes from the pack text encoder (Q4 + SFX padding embedding) in both pipelines,
so the comparison isolates DiT/decoder conversion. Writes work/ref_<tag>.npz."""
import sys, json, time, numpy as np
from pipeline import *
prompt, seconds, steps, seed = sys.argv[1], float(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
tag = sys.argv[5]
ids, mask = tokenize('work/pack/tokenizer/tokenizer.json', prompt)
print('first ids', ids[0, :6], 'n valid', int(mask.sum()))
te = session('work/pack/onnx/text_encoder_q4.onnx')
hidden = te.run(None, {'input_ids': ids, 'attention_mask': mask})[0]
print('hidden', hidden.shape, float(np.abs(hidden).max()))
dit = session('downloads/official/onnx/sa3-sm-sfx/dit.onnx')
dec = session('downloads/seasonengine/small-sfx/same-s/dec_dynamic_bf16.onnx')
L = latent_length(seconds)
x, ns = noises(seed, (1, 256, L), steps)
ts = schedule(steps); lat = x; vels = []; t0 = time.time()
for s in range(steps):
    v = dit.run(None, {'x': lat, 't': np.array([ts[s]], np.float32), 't5_hidden': hidden.astype(np.float32), 't5_mask': mask.astype(np.float32) if dit.get_inputs()[3].type == 'tensor(float)' else mask,
                       'seconds_total': np.array([seconds], np.float32), 'local_add_cond': np.zeros((1, 257, L), np.float32)})[0]
    vels.append(v); lat = pingpong(lat, v, ts[s], ts[s + 1], ns[s]); print('step', s, round(time.time() - t0, 1), flush=True)
audio = dec.run(None, {'latent': lat})[0]
print('audio', audio.shape, float(np.abs(audio).max()), 'finite', bool(np.isfinite(audio).all()))
np.savez(f'work/ref_{tag}.npz', hidden=hidden, mask=mask, x=x, vels=np.stack(vels), latent=lat, audio=audio, L=L)
