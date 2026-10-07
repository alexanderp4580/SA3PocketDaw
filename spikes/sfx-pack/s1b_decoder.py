"""Stage 1b: SAME-S decoder -> pack contract (input latents [1,256,t_lat], output audio [1,2,N])."""
import sys, onnx
src, dst = sys.argv[1:3]
m = onnx.load(src); g = m.graph
ren = {'latent': 'latents', 'pcm': 'audio'}
for n in g.node:
    for k, i in enumerate(n.input):
        if i in ren: n.input[k] = ren[i]
    for k, o in enumerate(n.output):
        if o in ren: n.output[k] = ren[o]
for vi in list(g.input) + list(g.output):
    if vi.name in ren: vi.name = ren[vi.name]
d = g.input[0].type.tensor_type.shape.dim[2]; d.dim_param = 't_lat'
o = g.output[0].type.tensor_type.shape.dim
o[0].ClearField('dim_param'); o[0].dim_value = 1
o[1].ClearField('dim_param'); o[1].dim_value = 2
o[2].dim_param = 'n_samples'
del g.value_info[:]
onnx.save(m, dst, save_as_external_data=True, all_tensors_to_one_file=True, location=dst.split('/')[-1] + '.data', size_threshold=1024)
print('ok')
