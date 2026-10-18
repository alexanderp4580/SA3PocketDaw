import sys, json, numpy as np, librosa, mido
from piano_transcription_inference import PianoTranscription, sample_rate
CK='/home/deck/piano_transcription_inference_data/note_F1=0.9677_pedal_F1=0.9186.pth'
pt = PianoTranscription(device='cpu', checkpoint_path=CK)
def midi_notes(p):
    m=mido.MidiFile(p); out=[]; on={}; t=0
    for msg in m.tracks[1]:
        t+=mido.tick2second(msg.time,m.ticks_per_beat,500000)
        if msg.type=='note_on' and msg.velocity>0: on[msg.note]=(t,msg.velocity)
        elif msg.type in('note_off','note_on') and msg.note in on:
            s,v=on.pop(msg.note); out.append(dict(onset=s,offset=t,pitch=msg.note,velocity=v))
    return sorted(out,key=lambda n:(n['onset'],n['pitch']))
for n in range(1,7):
    y,_=librosa.load(f'takes/take{n}.wav',sr=sample_rate,mono=True)
    y=np.concatenate([np.zeros(sample_rate),y]).astype(np.float32)
    np.save(f'out/take{n}.pad16k.npy',y)
    r=pt.transcribe(y,f'out/take{n}.py.mid')
    ev=[dict(onset=float(e['onset_time']),offset=float(e['offset_time']),pitch=e['midi_note'],velocity=e['velocity']) for e in r['est_note_events']]
    json.dump(dict(notes=ev,pedal=[{k:float(v) for k,v in e.items()} for e in r['est_pedal_events']]),open(f'out/take{n}.py.notes.json','w'))
    for k,v in r['output_dict'].items():
        if n==1 and k in('reg_onset_output','reg_offset_output','frame_output','velocity_output'): np.save(f'out/take1.torch.{k}.npy',v)
        if k in('reg_onset_output','reg_offset_output','frame_output','velocity_output'): np.save(f'out/take{n}.torch.{k}.npy',v)
    ref=midi_notes(f'takes/take{n}.bd.mid')
    print(n,'notes',len(ev),'refmid',len(ref),'dur',len(y)/16000)
    # compare against existing mid
    a=midi_notes(f'out/take{n}.py.mid')
    same=len(a)==len(ref) and all(x['pitch']==y_['pitch'] and abs(x['onset']-y_['onset'])<.003 and abs(x['offset']-y_['offset'])<.003 and x['velocity']==y_['velocity'] for x,y_ in zip(a,ref))
    print('  equal to existing mid (all fields, 3ms):',same)
    if not same:
        print(a[:3],ref[:3])
