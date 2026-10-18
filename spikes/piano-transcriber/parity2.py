import numpy as np, onnxruntime as ort, sys
f=sys.argv[1]; tag=sys.argv[2]
y=np.load('out/take1.pad16k.npy'); L=len(y); pad=int(np.ceil(L/160000))*160000-L
y=np.concatenate([y,np.zeros(pad,np.float32)])
seg=np.stack([y[p:p+160000] for p in range(0,len(y)-160000+1,80000)]).astype(np.float32)
s=ort.InferenceSession(f,providers=['CPUExecutionProvider'])
o=s.run(None,{'audio':seg})
keys=['reg_onset_output','reg_offset_output','frame_output','velocity_output']
# torch raw segments? out/take1.torch.* is deframed; compare after deframing same way
def deframe(x):
    x=x[:,:-1,:]; N,S,_=x.shape; r=[x[0,:int(S*.75)]]
    for i in range(1,N-1): r.append(x[i,int(S*.25):int(S*.75)])
    r.append(x[-1,int(S*.25):]); return np.concatenate(r)
for k,a in zip(keys,o):
    t=np.load(f'out/take1.torch.{k}.npy'); d=np.abs(deframe(a)-t)
    print(tag,k,a.shape,'max %.2e mean %.2e'%(d.max(),d.mean()))
