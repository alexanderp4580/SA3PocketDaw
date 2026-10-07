"""Experiment: quantizer variants for the decoder; reports decoder-only SNR on the reference latent."""
import sys, time, numpy as np, onnx
from onnxruntime.quantization.matmul_nbits_quantizer import MatMulNBitsQuantizer, DefaultWeightOnlyQuantConfig, HQQWeightOnlyQuantConfig
from pipeline import *
R = np.load('work/ref_laser2s.npz')
variant, src, tag = sys.argv[1:4]
m = onnx.load(src)
if variant == 'rtn16': cfg = DefaultWeightOnlyQuantConfig(block_size=16, is_symmetric=True, accuracy_level=4, bits=4)
elif variant == 'rtn16asym': cfg = DefaultWeightOnlyQuantConfig(block_size=16, is_symmetric=False, accuracy_level=4, bits=4)
elif variant == 'hqq16': cfg = HQQWeightOnlyQuantConfig(block_size=16, bits=4)
elif variant == 'rtn32': cfg = DefaultWeightOnlyQuantConfig(block_size=32, is_symmetric=True, accuracy_level=4, bits=4)
t = time.time(); q = MatMulNBitsQuantizer(m, algo_config=cfg); q.process()
q.model.save_model_to_file(f'work/exp_{tag}.onnx', True); print('quant', round(time.time() - t))
s = session(f'work/exp_{tag}.onnx'); a = s.run(None, {'audio' if False else 'latents': R['latent']})[0]; b = R['audio']
print(variant, 'decoder snr', 10 * np.log10((b ** 2).sum() / ((a - b) ** 2).sum()), 'corr', np.corrcoef(a.ravel(), b.ravel())[0, 1])
