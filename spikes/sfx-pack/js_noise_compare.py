"""Re-create the PoC worker's noise (JS LCG + Box-Muller, seed 42, steps 8) and compare the WebGPU browser WAV
with (a) the pack run in ORT CPU and (b) the unconverted FP32 reference run, all on identical noise."""
import sys, json, wave, numpy as np
from pipeline import *
prompt, seconds, steps, seed = 'a short laser zap', 2.0, 8, 42
def rnd(length, seed):
    st = seed & 0xFFFFFFFF; out = np.zeros(length, np.float32)
    def r():
        nonlocal st
        st = (1664525 * st + 1013904223) & 0xFFFFFFFF; return (st + 1) / 4294967297
    for i in range(0, length, 2):
        rad = np.sqrt(-2 * np.log(r())); ang = 2 * np.pi * r()
        out[i] = np.float32(rad * np.cos(ang))
        if i + 1 < length: out[i + 1] = np.float32(rad * np.sin(ang))
    return out
L = latent_length(seconds); ts = schedule(steps)
pack = '/home/deck/SketchBook/Projects/sa3BrowserDaw/models/small-sfx'
ids, mask = tokenize(f'{pack}/tokenizer/tokenizer.json', prompt)
hidden = session(f'{pack}/onnx/text_encoder_q4.onnx').run(None, {'input_ids': ids, 'attention_mask': mask})[0]
emb = session(f'{pack}/onnx/number_conditioner.onnx').run(None, {'seconds': np.array([seconds], np.float32)})[0]
cross = np.concatenate([hidden[:, :256], emb], 1).astype(np.float32); glob = emb[:, 0]
def run(kind):
    lat = rnd(256 * L, seed).reshape(1, 256, L)
    if kind == 'q4':
        s = session(f'{pack}/onnx/dit_q4.onnx')
        f = lambda lat, t: s.run(None, {'x': lat, 't': np.array([t], np.float32), 'cross_attn_cond': cross, 'global_embed': glob, 'local_add_cond': np.zeros((1, 257, L), np.float32), 'padding_mask': np.ones((1, L), bool)})[0]
        dec = session(f'{pack}/onnx/decoder_q4.onnx'); dk = 'latents'
    else:
        s = session('downloads/official/onnx/sa3-sm-sfx/dit.onnx')
        f = lambda lat, t: s.run(None, {'x': lat, 't': np.array([t], np.float32), 't5_hidden': hidden, 't5_mask': mask.astype(np.float32), 'seconds_total': np.array([seconds], np.float32), 'local_add_cond': np.zeros((1, 257, L), np.float32)})[0]
        dec = session('downloads/seasonengine/small-sfx/same-s/dec_dynamic_bf16.onnx'); dk = 'latent'
    for st in range(steps):
        v = f(lat, ts[st]); nz = rnd(256 * L, seed + st + 1).reshape(1, 256, L) if ts[st + 1] > 0 else None
        lat = pingpong(lat, v, ts[st], ts[st + 1], nz)
    return dec.run(None, {dk: lat})[0]
a_q4, a_ref = run('q4'), run('fp32')
w = wave.open('evidence/browser-webgpu-small-sfx-2s.wav'); n = w.getnframes(); b = np.frombuffer(w.readframes(n), '<i2').reshape(-1, 2).T.astype(np.float32) / 32768
n2 = int(seconds * SR); cor = lambda x, y: float(np.corrcoef(x.ravel(), y.ravel())[0, 1])
snr = lambda x, y: float(10 * np.log10((y ** 2).sum() / ((x - y) ** 2).sum()))
q, r = np.clip(a_q4[0, :, :n2], -1, 1), np.clip(a_ref[0, :, :n2], -1, 1)
env = lambda a, wdw=2048: np.abs(a).mean(0)[:len(a[0]) // wdw * wdw].reshape(-1, wdw).mean(1)
res = {'frames': n, 'browser_vs_python_q4': {'corr': cor(b, q), 'snr_db': snr(b, q)}, 'browser_vs_fp32_reference': {'corr': cor(b, r), 'snr_db': snr(b, r), 'envelope_corr': cor(env(b), env(r))},
       'python_q4_vs_fp32_reference': {'corr': cor(q, r), 'snr_db': snr(q, r), 'envelope_corr': cor(env(q), env(r))},
       'rms': {'browser': float(np.sqrt((b ** 2).mean())), 'python_q4': float(np.sqrt((q ** 2).mean())), 'fp32_reference': float(np.sqrt((r ** 2).mean()))},
       'peak': {'browser': float(np.abs(b).max()), 'python_q4': float(np.abs(q).max()), 'fp32_reference': float(np.abs(r).max())}}
json.dump(res, open('evidence/browser-vs-python-js-noise.json', 'w'), indent=1); print(json.dumps(res, indent=1))
