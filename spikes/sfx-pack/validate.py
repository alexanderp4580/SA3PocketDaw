"""Validate converted pack (ORT CPU) against the unconverted reference run (work/ref_<tag>.npz)."""
import sys, json, numpy as np, wave
from pipeline import *
prompt, seconds, steps, seed, tag, packdir = sys.argv[1], float(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), sys.argv[5], sys.argv[6]
out = sys.argv[7]
R = np.load(f'work/ref_{tag}.npz'); L = int(R['L'])
ids, mask = tokenize(f'{packdir}/tokenizer/tokenizer.json', prompt)
te = session(f'{packdir}/onnx/text_encoder_q4.onnx'); nc = session(f'{packdir}/onnx/number_conditioner.onnx')
hidden = te.run(None, {'input_ids': ids, 'attention_mask': mask})[0]
emb = nc.run(None, {'seconds': np.array([seconds], np.float32)})[0]
cross = np.concatenate([hidden[:, :256], emb], axis=1).astype(np.float32); glob = emb[:, 0].astype(np.float32)
def rel(a, b): return float(np.linalg.norm(a - b) / np.linalg.norm(b))
def corr(a, b): return float(np.corrcoef(a.ravel(), b.ravel())[0, 1])
def snr(a, b): return float(10 * np.log10((b ** 2).sum() / ((a - b) ** 2).sum()))
res = {'prompt': prompt, 'seconds': seconds, 'steps': steps, 'seed': seed, 'latent_length': L, 'hidden_vs_ref_max_abs': float(np.abs(hidden - R['hidden']).max())}
ts = schedule(steps); x, ns = noises(seed, (1, 256, L), steps)
assert np.array_equal(x, R['x'])
def feed(lat, s): return {'x': lat, 't': np.array([ts[s]], np.float32), 'cross_attn_cond': cross, 'global_embed': glob,
                          'local_add_cond': np.zeros((1, 257, L), np.float32), 'padding_mask': np.ones((1, L), bool)}
models = {'fp32_cut_optimized': 'work/dit/dit_opt.onnx', 'q4_pack': f'{packdir}/onnx/dit_q4.onnx'}
# teacher-forced: ref latents at each step
lats = [R['x']]
for s in range(steps - 1): lats.append(pingpong(lats[-1], R['vels'][s], ts[s], ts[s + 1], ns[s]))
for name, path in models.items():
    if name == 'q4_pack' and False: pass
    sess = session(path); tf = []; traj = x; vels = []
    for s in range(steps):
        v = sess.run(None, feed(lats[s], s))[0]
        tf.append({'step': s, 't': ts[s], 'rel_l2': rel(v, R['vels'][s]), 'corr': corr(v, R['vels'][s]), 'snr_db': snr(v, R['vels'][s])})
        v2 = sess.run(None, feed(traj, s))[0]; traj = pingpong(traj, v2, ts[s], ts[s + 1], ns[s])
    res[name] = {'teacher_forced_velocity': tf, 'final_latent': {'rel_l2': rel(traj, R['latent']), 'corr': corr(traj, R['latent']), 'snr_db': snr(traj, R['latent'])}}
    if name == 'q4_pack': final = traj
    del sess
dec = session(f'{packdir}/onnx/decoder_q4.onnx')
# decoder in isolation: same (reference) latent into Q4 decoder vs FP32 decoder output
a_ref = R['audio']
a_dec_only = dec.run(None, {'latents': R['latent']})[0]
res['decoder_q4_on_reference_latent'] = {'shape': list(a_dec_only.shape), 'rel_l2': rel(a_dec_only, a_ref), 'corr': corr(a_dec_only, a_ref), 'snr_db': snr(a_dec_only, a_ref)}
a_full = dec.run(None, {'latents': final})[0]
n = int(seconds * SR)
def stats(a): return {'shape': list(a.shape), 'finite': bool(np.isfinite(a).all()), 'peak': float(np.abs(a).max()), 'rms': float(np.sqrt((a ** 2).mean())), 'rms_first_%gs' % seconds: float(np.sqrt((a[..., :n] ** 2).mean())), 'nonzero_fraction': float((a != 0).mean())}
res['audio_ref'] = stats(a_ref); res['audio_converted_end_to_end'] = stats(a_full)
res['end_to_end_vs_ref'] = {'rel_l2': rel(a_full, a_ref), 'corr': corr(a_full, a_ref), 'snr_db': snr(a_full, a_ref)}
def env(a, w=2048):
    m = np.abs(a).mean(axis=1)[0, :n]; k = len(m) // w; return m[:k * w].reshape(k, w).mean(1)
res['end_to_end_vs_ref']['envelope_corr'] = corr(env(a_full), env(a_ref))
res['end_to_end_vs_ref']['first_%gs_corr' % seconds] = corr(a_full[..., :n], a_ref[..., :n])
def wav(a, p):
    s = np.clip(a[0, :, :n].T, -1, 1); pcm = np.where(s < 0, s * 32768, s * 32767).astype('<i2')
    with wave.open(p, 'wb') as w: w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
import os; os.makedirs('evidence', exist_ok=True)
wav(a_full, f'evidence/python-q4-{tag}.wav'); wav(a_ref, f'evidence/python-fp32-reference-{tag}.wav')
json.dump(res, open(out, 'w'), indent=1)
print(json.dumps({k: v for k, v in res.items() if k not in ('fp32_cut_optimized', 'q4_pack')}, indent=1))
for k in ('fp32_cut_optimized', 'q4_pack'):
    print(k, 'final', res[k]['final_latent'], [round(x['snr_db'], 1) for x in res[k]['teacher_forced_velocity']])
