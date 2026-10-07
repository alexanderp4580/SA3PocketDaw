"""Check what the SFX pack can share with the Small Music pack."""
import hashlib, json, numpy as np, onnx
from onnx import numpy_helper
POC = '/home/deck/Documents/Codex/sa3-browser-poc/public/models'
def sha(p):
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for b in iter(lambda: f.read(1 << 24), b''): h.update(b)
    return h.hexdigest()
out = {}
toks = {'poc_music_pack': f'{POC}/tokenizer/tokenizer.json',
        'seasonengine_small-sfx': 'downloads/seasonengine/small-sfx/t5gemma/tokenizer.json',
        'seasonengine_small-music': 'downloads/seasonengine/small-music/t5gemma/tokenizer.json'}
out['tokenizer_json'] = {k: {'sha256': sha(v), 'bytes': __import__('os').path.getsize(v)} for k, v in toks.items()}
js = {k: json.load(open(v)) for k, v in toks.items()}
out['tokenizer_json_parsed_equal'] = {k: js[k] == js['poc_music_pack'] for k in js}
# padding embedding: music DiT vs SFX DiT vs baked tensor in the Music pack text encoder
def pad(p):
    m = onnx.load(p, load_external_data=False)
    return numpy_helper.to_array({i.name: i for i in m.graph.initializer}['padding_embedding'])
pm, ps = pad('downloads/official/onnx/sa3-sm-music/dit.onnx'), pad('downloads/official/onnx/sa3-sm-sfx/dit.onnx')
te = onnx.load(f'{POC}/onnx/text_encoder_q4.onnx', load_external_data=False)
t = {i.name: i for i in te.graph.initializer}['expand_3']
d = {e.key: e.value for e in t.external_data}
with open(f"{POC}/onnx/{d['location']}", 'rb') as f:
    f.seek(int(d['offset'])); baked = np.frombuffer(f.read(256 * 768 * 4), dtype=np.float32).reshape(256, 768)
out['padding_embedding'] = {
  'music_dit_vs_baked_in_music_pack_max_abs_diff': float(np.abs(baked - pm).max()),
  'baked_rows_identical': bool((baked == baked[0]).all()),
  'sfx_vs_music_max_abs_diff': float(np.abs(ps - pm).max()),
  'sfx_vs_music_corr': float(np.corrcoef(ps, pm)[0, 1]),
  'music_abs_mean': float(np.abs(pm).mean()), 'sfx_abs_mean': float(np.abs(ps).mean()),
  'baked_tensor_location': d}
# seconds conditioner: music vs sfx
def sec(p):
    m = onnx.load(p, load_external_data=False); i = {i.name: i for i in m.graph.initializer}
    return {k: numpy_helper.to_array(i[k]) for k in ['seconds_freqs', 'seconds_weight', 'seconds_bias']}
a, b = sec('downloads/official/onnx/sa3-sm-music/dit.onnx'), sec('downloads/official/onnx/sa3-sm-sfx/dit.onnx')
z = np.load(f'{POC}/number_conditioner.npz')
out['seconds_conditioner'] = {k: float(np.abs(a[k] - b[k]).max()) for k in a}
out['seconds_conditioner_poc_npz_vs_music_dit_max_abs_diff'] = {'weight': float(np.abs(z['linear__weight'] - a['seconds_weight']).max()), 'bias': float(np.abs(z['linear__bias'] - a['seconds_bias']).max())}
json.dump(out, open('evidence/shared-components.json', 'w'), indent=1); print(json.dumps(out, indent=1))
