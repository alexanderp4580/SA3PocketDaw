import json, sys, numpy as np
tag, thr = sys.argv[1], sys.argv[2]   # e.g. fp32 1
KEYS=['reg_onset_output','reg_offset_output','frame_output','velocity_output']
def shifted(notes):  # python notes are in padded time; apply pipeline shift-back
    return [dict(onset=max(0,n['onset']-1),offset=n['offset']-1,pitch=n['pitch'],velocity=n['velocity']) for n in notes if n['offset']-1>0]
def f1(est, ref, tol=.05):
    used=set(); tp=0
    for e in sorted(est,key=lambda x:x['onset']):
        c=[(abs(e['onset']-r['onset']),i) for i,r in enumerate(ref) if i not in used and r['pitch']==e['pitch'] and abs(e['onset']-r['onset'])<=tol]
        if c: used.add(min(c)[1]); tp+=1
    p=tp/len(est) if est else 0; r=tp/len(ref) if ref else 0
    return tp,(2*p*r/(p+r) if p+r else 0)
TP=NE=NR=0; exact=0
for n in range(1,7):
    ref=shifted(json.load(open(f'out/take{n}.py.notes.json'))['notes'])
    est=json.load(open(f'out/take{n}.{tag}.t{thr}.notes.json'))
    arr=json.load(open(f'out/take{n}.{tag}.t{thr}.arrays.json')) if True else None
    ds=[]
    for k,a in zip(KEYS,arr):
        t=np.load(f'out/take{n}.torch.{k}.npy'); a=np.array(a,np.float32).reshape(t.shape); d=np.abs(a-t); ds.append((d.max(),d.mean()))
    key=lambda x:(x['pitch'],round(x['onset'],3))
    ex = len(est)==len(ref) and all(a['pitch']==b['pitch'] and a['velocity']==b['velocity'] and abs(a['onset']-b['onset'])<1e-4 and abs(a['offset']-b['offset'])<1e-4 for a,b in zip(sorted(est,key=key),sorted(ref,key=key)))
    exact+=ex; tp,f=f1(est,ref); TP+=tp; NE+=len(est); NR+=len(ref)
    print(f'take{n} notes js={len(est)} py={len(ref)} exact={ex} tp50ms={tp} | '+' '.join(f'{k[:8]} max{m:.1e}/mean{u:.1e}' for k,(m,u) in zip(KEYS,ds)))
P=TP/NE; R=TP/NR; print(tag,'t'+thr,'exact takes',exact,'/6  onset F1@50ms',round(2*P*R/(P+R),4),'tp',TP,'est',NE,'ref',NR)
