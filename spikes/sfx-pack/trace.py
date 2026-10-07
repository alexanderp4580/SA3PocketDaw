import onnx,sys
p=sys.argv[1]
m=onnx.load(p,load_external_data=False)
g=m.graph
cons={}
for n in g.node:
    for i in n.input: cons.setdefault(i,[]).append(n)
prod={o:n for n in g.node for o in n.output}
ini={i.name:i for i in g.initializer}
def show(name,depth=0,maxd=int(sys.argv[3]) if len(sys.argv)>3 else 6,seen=None):
    seen=seen or set()
    for n in cons.get(name,[]):
        print('  '*depth+f'{n.op_type} {n.name} in={[x[:40] for x in n.input]} out={[x[:40] for x in n.output]}')
        if depth<maxd:
            for o in n.output:
                if o not in seen: seen.add(o); show(o,depth+1,maxd,seen)
show(sys.argv[2])
