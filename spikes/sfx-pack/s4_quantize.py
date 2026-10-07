"""Stage 4: MatMul -> com.microsoft::MatMulNBits (4-bit, symmetric, block 16, accuracy_level 4)
using the ONNX Runtime weight-only quantizer; output keeps external data in one file."""
import sys, time, onnx
from onnxruntime.quantization.matmul_nbits_quantizer import MatMulNBitsQuantizer, DefaultWeightOnlyQuantConfig
src, dst = sys.argv[1:3]
block = int(sys.argv[3]) if len(sys.argv) > 3 else 16
t0 = time.time()
m = onnx.load(src)
cfg = DefaultWeightOnlyQuantConfig(block_size=block, is_symmetric=True, accuracy_level=4, bits=4)
q = MatMulNBitsQuantizer(m, algo_config=cfg)
q.process()
q.model.save_model_to_file(dst, True)
print('quantized in', round(time.time() - t0), 's ->', dst)
