"""Export ByteDance piano transcription note + pedal models to ONNX. Input audio [B,160000] f32 16 kHz."""
import torch, numpy as np, sys
from piano_transcription_inference.models import Note_pedal
CK='/home/deck/piano_transcription_inference_data/note_F1=0.9677_pedal_F1=0.9186.pth'
m=Note_pedal(frames_per_second=100,classes_num=88)
m.load_state_dict(torch.load(CK,map_location='cpu')['model'],strict=False)
m.eval()
class W(torch.nn.Module):
    def __init__(s,mod,keys): super().__init__(); s.m=mod; s.k=keys
    def forward(s,x):
        d=s.m(x); return tuple(d[k] for k in s.k)
jobs={'note':(m.note_model,['reg_onset_output','reg_offset_output','frame_output','velocity_output']),
      'pedal':(m.pedal_model,['reg_pedal_onset_output','reg_pedal_offset_output','pedal_frame_output'])}
for name,(mod,keys) in jobs.items():
    w=W(mod,keys).eval(); x=torch.randn(2,160000)*0.1
    torch.onnx.export(w,(x,),f'bd_{name}_fp32.onnx',input_names=['audio'],output_names=keys,
        dynamic_axes={'audio':{0:'batch'},**{k:{0:'batch'} for k in keys}},opset_version=17,dynamo=False)
    print('exported',name)
