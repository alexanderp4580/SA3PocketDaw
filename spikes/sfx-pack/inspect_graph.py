import onnx,sys,collections
for p in sys.argv[1:]:
    m=onnx.load(p,load_external_data=False)
    f=lambda l:[(i.name,i.type.tensor_type.elem_type,[d.dim_value or d.dim_param for d in i.type.tensor_type.shape.dim]) for i in l]
    print('==',p,[(o.domain,o.version) for o in m.opset_import],'ir',m.ir_version)
    print(' in',f(m.graph.input));print(' out',f(m.graph.output),len(m.graph.node),'nodes',len(m.graph.initializer),'inits')
    print(collections.Counter(x.op_type for x in m.graph.node).most_common(25))
    for x in m.graph.node:
        if x.op_type in('MatMulNBits',):
            print(x.input,[(a.name,a.i) for a in x.attribute]);break
