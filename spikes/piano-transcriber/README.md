# Piano transcriber: export scripts

Scripts that produced the browser model for the Piano transcriber pack (ByteDance "High-resolution Piano Transcription", note model). They ran in a scratch directory on 2026-10-17/18; paths inside them point at that scratch layout and the local checkpoint and need adjusting before a re-run.

| Script | Purpose |
|---|---|
| `export_onnx.py` | Exports the note and pedal models to ONNX (opset 17, legacy exporter, input `audio [B,160000]` f32 at 16 kHz, dynamic batch; note outputs `reg_onset, reg_offset, frame, velocity`, each `[B,1001,88]`). |
| `mkq.py`, `variants.py` | Build the size variants (fp16 weights with fp32 front end, fp16 everything, int8). `mkq.py` writes `bd_note_fp16kf.onnx`. |
| `ref.py` | Runs the Python package as the reference (1 s of silence padded in front) and saves notes and raw heads. |
| `parity2.py` | Compares ONNX output with torch output. |
| `evalpy.py`, `compare.py` | Note agreement (onset F1 at 50 ms, pitch equal) and head differences against the reference. |

Inputs: the `piano_transcription_inference` package (Python) and its checkpoint `note_F1=0.9677_pedal_F1=0.9186.pth` (172 MB, Zenodo record 4034264, CC BY 4.0 per the record page). Python needs torch (CPU), onnx and onnxruntime.

## Measured (Steam Deck, headless Chromium, onnxruntime-web 1.27.0 WASM, 6 SA3 piano takes of 8 to 12 s)

| Variant | Size | Note agreement vs fp32 reference | 4-thread time per 12 s take |
|---|---|---|---|
| fp32 | 98.7 MB | exact (231 of 231 notes) | 8.2 s |
| fp16 weights, fp32 front end (shipped as `piano_note_fp16.onnx`) | 58.3 MB | onset F1 1.000 | 8.1 s |
| fp16 everything | 49.4 MB | F1 0.989 | 8.2 s |
| int8 with fp16 weights | 50.7 MB | F1 0.97 to 0.98 | 35.8 s |

The shipped file is the second row. Phone speed and memory are to check.
