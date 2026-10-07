"""Shared helpers: tokenizer, ping-pong sampler (same arithmetic as the PoC src/sampling.js),
text conditioning and ORT sessions."""
import math, numpy as np, onnxruntime as ort
from tokenizers import Tokenizer
SR = 44100
def session(path, threads=8):
    so = ort.SessionOptions(); so.intra_op_num_threads = threads
    so.log_severity_level = 3
    return ort.InferenceSession(path, so, providers=['CPUExecutionProvider'])
def tokenize(tok_path, prompt):
    t = Tokenizer.from_file(tok_path)
    t.enable_padding(length=256, pad_id=0, pad_token='<pad>'); t.enable_truncation(256)
    e = t.encode(prompt)
    return np.array([e.ids], dtype=np.int64), np.array([e.attention_mask], dtype=np.int64)
def schedule(steps):
    out = []
    for i in range(steps + 1):
        if i == 0: out.append(1.0)
        elif i == steps: out.append(0.0)
        else:
            t = 1 - i / steps; out.append(1 / (1 + math.exp(2 - t * 8.2)))
    return out
def latent_length(seconds): return math.ceil((seconds + 6) * SR / 8192) * 2
def pingpong(lat, vel, cur, nxt, noise):
    den = lat - cur * vel
    return den if nxt <= 0 else (1 - nxt) * den + nxt * noise
def noises(seed, shape, steps):
    r = np.random.default_rng(seed)
    return r.standard_normal(shape).astype(np.float32), [r.standard_normal(shape).astype(np.float32) for _ in range(steps)]
