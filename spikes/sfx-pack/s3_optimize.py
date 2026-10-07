"""Stage 3: ORT basic graph optimisation (constant folding, standard-op cleanups only; no contrib fusions)."""
import sys, onnxruntime as ort
src, dst, data = sys.argv[1:4]
so = ort.SessionOptions()
so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_BASIC
so.optimized_model_filepath = dst
so.add_session_config_entry('session.optimized_model_external_initializers_file_name', data)
so.add_session_config_entry('session.optimized_model_external_initializers_min_size_in_bytes', '1024')
ort.InferenceSession(src, so, providers=['CPUExecutionProvider'])
print('written', dst)
