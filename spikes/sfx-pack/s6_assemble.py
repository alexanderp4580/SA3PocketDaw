"""Stage 6: assemble the pack directory (same layout as the Small Music pack's public/models)."""
import json, shutil, sys, numpy as np, os
POC = '/home/deck/Documents/Codex/sa3-browser-poc/public/models'
dst = sys.argv[1]
os.makedirs(dst, exist_ok=True)
shutil.copytree('work/pack/onnx', f'{dst}/onnx', dirs_exist_ok=True)
shutil.copytree('work/pack/tokenizer', f'{dst}/tokenizer', dirs_exist_ok=True)
for f in ['LICENSE.md', 'LICENSE_GEMMA.md', 'NOTICE']: shutil.copyfile(f'downloads/official/{f}', f'{dst}/{f}')
z = np.load('work/seconds_conditioner.npz'); old = np.load(f'{POC}/number_conditioner.npz')
np.savez(f'{dst}/number_conditioner.npz', linear__weight=z['seconds_weight'], linear__bias=z['seconds_bias'], cfg=old['cfg'])
cfg = json.load(open(f'{POC}/config.json'))
cfg['name'] = 'stable-audio-3-small-sfx'; cfg['upstream'] = 'https://huggingface.co/stabilityai/stable-audio-3-small-sfx'
json.dump(cfg, open(f'{dst}/config.json', 'w'), indent=2)
print(sorted(os.listdir(dst)))
