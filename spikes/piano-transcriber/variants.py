"""fp16 weights (cast back to fp32 at load: initializers fp16 + Cast) and int8 dynamic quantization variants of bd_note_fp32.onnx."""
import onnx, numpy as np, sys
from onnx import numpy_helper, TensorProto, helper
src='bd_note_fp32.onnx'
# (a) fp16 storage: every big fp32 initializer stored as fp16, followed by a Cast to fp32 node; compute stays fp32.
m=onnx.load(src); g=m.graph; new_nodes=[]; cnt=0; saved=0
for init in list(g.initializer):
    if init.data_type==TensorProto.FLOAT and np.prod(init.dims)>=1024:
        a=numpy_helper.to_array(init); h=numpy_helper.from_array(a.astype(np.float16),init.name+'_fp16')
        g.initializer.remove(init); g.initializer.append(h)
        new_nodes.append(helper.make_node('Cast',[h.name],[init.name],to=TensorProto.FLOAT,name='cast_'+init.name)); cnt+=1
old=list(g.node); del g.node[:]; g.node.extend(new_nodes+old)
onnx.save(m,'bd_note_fp16w.onnx'); print('fp16w initializers cast',cnt)
# (b) int8 dynamic quantization
from onnxruntime.quantization import quantize_dynamic, QuantType
for name,ops in (('int8_all',['MatMul','Gemm','Conv']),('int8_mm',['MatMul','Gemm'])):
    try:
        quantize_dynamic(src,f'bd_note_{name}.onnx',weight_type=QuantType.QInt8,op_types_to_quantize=ops); print('ok',name)
    except Exception as e: print('fail',name,e)
