"""Stage 1: cut the official SFX DiT at the conditioning boundary used by the
Small Music browser pack (inputs: x, t, cross_attn_cond, global_embed,
local_add_cond, padding_mask; output: out) and write number_conditioner.onnx,
the SFX padding embedding and the cut DiT (FP32)."""
import sys, json
import numpy as np, onnx
from onnx import helper, numpy_helper, TensorProto
src, outdir = sys.argv[1], sys.argv[2]
m = onnx.load(src)
g = m.graph
ini = {i.name: i for i in g.initializer}
# --- conditioner values from the source graph
np.save(f'{outdir}/padding_embedding.npy', numpy_helper.to_array(ini['padding_embedding']))
weights = {k: numpy_helper.to_array(ini[k]) for k in ['seconds_freqs', 'seconds_weight', 'seconds_bias']}
np.savez(f'{outdir}/seconds_conditioner.npz', **weights)
consts = {}
for n in g.node:
    if n.op_type == 'Constant':
        consts[n.output[0]] = numpy_helper.to_array(n.attribute[0].t)
print('clip min/max', consts['/Constant_3_output_0'], consts['/Constant_4_output_0'], 'div', consts['/Constant_6_output_0'])
# --- cut: replace producers of the two boundary tensors by new graph inputs
CROSS, GLOBAL = '/Concat_1_output_0', '/Squeeze_output_0'
def rename_use(old, new):
    for n in g.node:
        for k, i in enumerate(n.input):
            if i == old: n.input[k] = new
rename_use(CROSS, 'cross_attn_cond'); rename_use(GLOBAL, 'global_embed')
# rename dynamic dim L -> t_lat, velocity -> out
for vi in list(g.input) + list(g.output):
    for d in vi.type.tensor_type.shape.dim:
        if d.dim_param == 'L': d.dim_param = 't_lat'
for k, n in enumerate(g.node):
    for j, o in enumerate(n.output):
        if o == 'velocity': n.output[j] = 'out'
    for j, i in enumerate(n.input):
        if i == 'velocity': n.input[j] = 'out'
g.output[0].name = 'out'
# batch dim of output -> 1
d0 = g.output[0].type.tensor_type.shape.dim[0]; d0.ClearField('dim_param'); d0.dim_value = 1
keep_inputs = {'x', 't', 'local_add_cond'}
old_inputs = {i.name: i for i in g.input}
del g.input[:]
for name in ['x', 't']: g.input.append(old_inputs[name])
g.input.append(helper.make_tensor_value_info('cross_attn_cond', TensorProto.FLOAT, [1, 257, 768]))
g.input.append(helper.make_tensor_value_info('global_embed', TensorProto.FLOAT, [1, 768]))
g.input.append(old_inputs['local_add_cond'])
g.input.append(helper.make_tensor_value_info('padding_mask', TensorProto.BOOL, [1, 't_lat']))
# dead-code elimination by backward reachability
need = {o.name for o in g.output}; nodes = list(g.node); order = []
changed = True
while changed:
    changed = False
    for n in nodes:
        if any(o in need for o in n.output):
            for i in n.input:
                if i and i not in need: need.add(i); changed = True
kept = [n for n in nodes if any(o in need for o in n.output)]
del g.node[:]; g.node.extend(kept)
inits = [i for i in g.initializer if i.name in need]
del g.initializer[:]; g.initializer.extend(inits)
del g.value_info[:]
print('nodes', len(nodes), '->', len(kept), 'initializers', len(ini), '->', len(inits))
onnx.save(m, f'{outdir}/dit_cut_fp32.onnx', save_as_external_data=True, all_tensors_to_one_file=True, location='dit_cut_fp32.onnx.data', size_threshold=1024)
# --- number conditioner graph (SFX weights), same contract as the Music pack
nc_nodes = []
w = weights
clip_min, clip_max = float(consts['/Constant_3_output_0']), float(consts['/Constant_4_output_0'])
div = float(consts['/Constant_6_output_0'])
I = lambda n, a: numpy_helper.from_array(np.asarray(a), n)
inits = [I('clip_min', np.float32(clip_min)), I('clip_max', np.float32(clip_max)), I('div', np.float32(div)),
         I('axes_last', np.array([-1], dtype=np.int64)), I('axes_zero', np.array([0], dtype=np.int64)),
         I('freqs', w['seconds_freqs']), I('weight', w['seconds_weight']), I('bias', w['seconds_bias'])]
nodes = [
 helper.make_node('Clip', ['seconds', 'clip_min', 'clip_max'], ['clipped']),
 helper.make_node('Div', ['clipped', 'div'], ['scaled']),
 helper.make_node('Unsqueeze', ['scaled', 'axes_last'], ['scaled_col']),
 helper.make_node('Mul', ['scaled_col', 'freqs'], ['phase']),
 helper.make_node('Cos', ['phase'], ['c']), helper.make_node('Sin', ['phase'], ['s']),
 helper.make_node('Concat', ['c', 's'], ['feat'], axis=-1),
 helper.make_node('Gemm', ['feat', 'weight', 'bias'], ['proj'], transB=1),
 helper.make_node('Unsqueeze', ['proj', 'axes_zero'], ['embedding']),
]
nc = helper.make_model(helper.make_graph(nodes, 'number_conditioner',
    [helper.make_tensor_value_info('seconds', TensorProto.FLOAT, [1])],
    [helper.make_tensor_value_info('embedding', TensorProto.FLOAT, [1, 1, 768])], inits),
    opset_imports=[helper.make_opsetid('', 17)])
nc.ir_version = 8
onnx.checker.check_model(nc)
onnx.save(nc, f'{outdir}/number_conditioner.onnx')
print('done')
