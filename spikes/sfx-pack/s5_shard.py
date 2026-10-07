"""Stage 5: re-pack external data into <=95 MiB chunk files (4096-byte aligned offsets), write
<name>.onnx + <name>_chunks.json in the Small Music pack layout; keep only the ai.onnx and
com.microsoft opset domains."""
import sys, json, onnx
from onnx import TensorProto
src, data_dir, out_dir, name = sys.argv[1:5]
LIMIT = 99614720; ALIGN = 4096
m = onnx.load(src, load_external_data=False)
for o in list(m.opset_import):
    if o.domain not in ('', 'com.microsoft'): m.opset_import.remove(o)
used_ms = any(n.domain == 'com.microsoft' for n in m.graph.node)
if used_ms and not any(o.domain == 'com.microsoft' for o in m.opset_import):
    m.opset_import.add(domain='com.microsoft', version=1)
del m.graph.value_info[:]
files = []; cur = None; off = 0
def read(t):
    d = {e.key: e.value for e in t.external_data}
    with open(f"{data_dir}/{d['location']}", 'rb') as f:
        f.seek(int(d['offset'])); return f.read(int(d['length']))
def new_chunk():
    global cur, off
    if cur: cur.close()
    n = f'{name}_chunk_{len(files)}.data'; files.append(n); cur = open(f'{out_dir}/{n}', 'wb'); off = 0
for t in m.graph.initializer:
    if t.data_location != TensorProto.EXTERNAL: continue
    data = read(t)
    pad = (-off) % ALIGN
    if cur is None or off + pad + len(data) > LIMIT:
        new_chunk(); pad = 0
    cur.write(b'\0' * pad); off += pad
    start = off; cur.write(data); off += len(data)
    del t.external_data[:]
    for k, v in [('location', files[-1]), ('offset', str(start)), ('length', str(len(data)))]:
        e = t.external_data.add(); e.key = k; e.value = v
if cur:
    cur.write(b'\0' * ((-off) % ALIGN)); cur.close()
import os
onnx.save(m, f'{out_dir}/{name}.onnx')
chunks = [{'name': n, 'size': os.path.getsize(f'{out_dir}/{n}')} for n in files]
tot = sum(c['size'] for c in chunks)
json.dump({'model': f'{name}.onnx', 'chunks': chunks, 'total_weight_mb': round(tot / 1e6, 2)}, open(f'{out_dir}/{name}_chunks.json', 'w'), indent=2)
print(name, 'graph bytes', os.path.getsize(f'{out_dir}/{name}.onnx'), 'chunks', [c['size'] for c in chunks], 'total', tot)
