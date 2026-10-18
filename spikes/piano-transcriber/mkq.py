import onnx, numpy as np
from onnx import numpy_helper, TensorProto, helper
from onnxruntime.quantization import quantize_dynamic, QuantType
m=onnx.load('bd_note_fp32.onnx',load_external_data=False)
front=[n.name for n in m.graph.node if 'spectrogram_extractor' in n.name or 'logmel_extractor' in n.name]
cb1=[n.name for n in m.graph.node if n.op_type=='Conv' and 'conv_block1' in n.name]
def fp16(src,dst):
    m=onnx.load(src); g=m.graph; nn=[]
    for init in list(g.initializer):
        if init.data_type==TensorProto.FLOAT and np.prod(init.dims)>=1024:
            a=numpy_helper.to_array(init); h=numpy_helper.from_array(a.astype(np.float16),init.name+'_fp16')
            g.initializer.remove(init); g.initializer.append(h); nn.append(helper.make_node('Cast',[h.name],[init.name],to=TensorProto.FLOAT,name='cast_'+init.name))
    old=list(g.node); del g.node[:]; g.node.extend(nn+old); onnx.save(m,dst)
#quantize_dynamic('bd_note_fp32.onnx','bd_note_int8_nofront.onnx',weight_type=QuantType.QInt8,nodes_to_exclude=front)
#quantize_dynamic('bd_note_fp32.onnx','bd_note_int8_nofront_cb1.onnx',weight_type=QuantType.QInt8,nodes_to_exclude=front+cb1)
#fp16('bd_note_int8_nofront.onnx','bd_note_int8nf_fp16.onnx'); #fp16('bd_note_int8_nofront_cb1.onnx','bd_note_int8nfcb1_fp16.onnx')
def fp16k(src,dst):
    m=onnx.load(src); g=m.graph; nn=[]
    for init in list(g.initializer):
        if init.data_type==TensorProto.FLOAT and np.prod(init.dims)>=1024 and 'spectrogram_extractor' not in init.name and 'logmel_extractor' not in init.name:
            a=numpy_helper.to_array(init); h=numpy_helper.from_array(a.astype(np.float16),init.name+'_fp16')
            g.initializer.remove(init); g.initializer.append(h); nn.append(helper.make_node('Cast',[h.name],[init.name],to=TensorProto.FLOAT,name='cast_'+init.name))
    old=list(g.node); del g.node[:]; g.node.extend(nn+old); onnx.save(m,dst)
fp16k('bd_note_fp32.onnx','bd_note_fp16kf.onnx'); fp16k('bd_note_int8_nofront_cb1.onnx','bd_note_int8cb1_fp16kf.onnx')
