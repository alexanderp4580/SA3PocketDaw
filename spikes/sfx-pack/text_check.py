"""Compare the pack text encoder (Q4, SFX padding embedding) with the unconverted SeasonEngine SFX T5Gemma encoder."""
import json, numpy as np
from pipeline import *
pack = '/home/deck/SketchBook/Projects/sa3BrowserDaw/models/small-sfx'
src = session('downloads/seasonengine/small-sfx/t5gemma/encoder.onnx')
print([(i.name, i.type) for i in src.get_inputs()], [(o.name) for o in src.get_outputs()])
te = session(f'{pack}/onnx/text_encoder_q4.onnx'); pe = np.load('work/padding_embedding.npy')
res = {}
for p in ['a short laser zap', 'heavy wooden door slamming in a large hall, long reverb tail']:
    ids, mask = tokenize(f'{pack}/tokenizer/tokenizer.json', p)
    q = te.run(None, {'input_ids': ids, 'attention_mask': mask})[0]
    feeds = {src.get_inputs()[0].name: ids, src.get_inputs()[1].name: mask}
    s = src.run(None, feeds)[0]; v = int(mask.sum())
    rel = lambda a, b: float(np.linalg.norm(a - b) / np.linalg.norm(b))
    res[p] = {'valid_tokens': v, 'valid_rel_l2': rel(q[0, :v], s[0, :v]), 'valid_corr': float(np.corrcoef(q[0, :v].ravel(), s[0, :v].ravel())[0, 1]),
              'padding_rows_equal_sfx_padding_embedding': bool(np.abs(q[0, v:] - pe).max() == 0), 'source_padding_rows_raw_abs_mean': float(np.abs(s[0, v:]).mean()) if v < 256 else None}
json.dump(res, open('evidence/text-encoder-check.json', 'w'), indent=1); print(json.dumps(res, indent=1))
