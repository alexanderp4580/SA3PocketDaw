import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ortSrc = join(root, 'node_modules/onnxruntime-web/dist');
const ortDst = join(root, 'public/ort');
mkdirSync(ortDst, { recursive: true });
for (const f of ['ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm']) {
  copyFileSync(join(ortSrc, f), join(ortDst, f));
}
const probe = join(root, 'public/gpu-probe.onnx');
if (!existsSync(probe)) throw new Error('public/gpu-probe.onnx is missing');
console.log('assets ready');
