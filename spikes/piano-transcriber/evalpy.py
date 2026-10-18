import sys, json, numpy as np, onnxruntime as ort
from piano_transcription_inference.utilities import RegressionPostProcessor
KEYS=['reg_onset_output','reg_offset_output','frame_output','velocity_output']
def deframe(x):
    if x.shape[0]==1: return x[0]
    x=x[:,:-1,:]; N,S,_=x.shape; r=[x[0,:int(S*.75)]]
    for i in range(1,N-1): r.append(x[i,int(S*.25):int(S*.75)])
    r.append(x[-1,int(S*.25):]); return np.concatenate(r)
def f1(est, ref, tol=.05):
    used=set(); tp=0
    for e in sorted(est,key=lambda x:x['onset']):
        c=[(abs(e['onset']-r['onset']),i) for i,r in enumerate(ref) if i not in used and r['pitch']==e['pitch'] and abs(e['onset']-r['onset'])<=tol]
        if c: used.add(min(c)[1]); tp+=1
    return tp
pp=RegressionPostProcessor(100,classes_num=88,onset_threshold=.3,offset_threshold=.3,frame_threshold=.1,pedal_offset_threshold=.2)
for f in sys.argv[1:]:
    s=ort.InferenceSession(f,providers=['CPUExecutionProvider']); TP=NE=NR=0; mx=[0]*4; mn=[0]*4
    for n in range(1,7):
        y=np.load(f'out/take{n}.pad16k.npy'); pad=int(np.ceil(len(y)/160000))*160000-len(y); y=np.concatenate([y,np.zeros(pad,np.float32)])
        seg=np.stack([y[p:p+160000] for p in range(0,len(y)-159999,80000)]).astype(np.float32)
        o=s.run(None,{'audio':seg}); d={}
        for i,(k,a) in enumerate(zip(KEYS,o)):
            d[k]=deframe(a); t=np.load(f'out/take{n}.torch.{k}.npy'); df=np.abs(d[k]-t); mx[i]=max(mx[i],df.max()); mn[i]+=df.mean()/6
        ev,_=pp.output_dict_to_midi_events(d)
        est=[dict(onset=e['onset_time'],pitch=e['midi_note']) for e in ev]
        ref=json.load(open(f'out/take{n}.py.notes.json'))['notes']; ref=[dict(onset=r['onset'],pitch=r['pitch']) for r in ref]
        TP+=f1(est,ref); NE+=len(est); NR+=len(ref)
    P=TP/NE; R=TP/NR
    print(f'{f:34s} F1@50ms {2*P*R/(P+R):.3f} tp {TP} est {NE} ref {NR} | max '+' '.join(f'{v:.2e}' for v in mx)+' | mean '+' '.join(f'{v:.1e}' for v in mn))
