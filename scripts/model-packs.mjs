import { readFileSync } from 'node:fs';
import { posix } from 'node:path';

export const DEFAULT_POC_ROOT = '/home/deck/Documents/Codex/sa3-browser-poc/public';

// Each pack lists plain files plus chunk index files. A chunk index
// (`*_chunks.json`) names the `.data` chunk files stored next to it.
// `src` is the location below the PoC public directory.
export const PACKS = [
  {
    id: 'encoder',
    label: 'Text encoder (shared)',
    requires: [],
    files: [
      { path: 'tokenizer/tokenizer.json', src: 'models/tokenizer/tokenizer.json' },
      { path: 'tokenizer/tokenizer_config.json', src: 'models/tokenizer/tokenizer_config.json' },
      { path: 'onnx/text_encoder_q4.onnx', src: 'models/onnx/text_encoder_q4.onnx' },
    ],
    chunkIndexes: [{ path: 'onnx/text_encoder_q4_chunks.json', src: 'models/onnx/text_encoder_q4_chunks.json' }],
  },
  {
    id: 'small-music',
    label: 'SA3 Small Music',
    requires: ['encoder'],
    files: [
      { path: 'onnx/number_conditioner.onnx', src: 'models/onnx/number_conditioner.onnx' },
      { path: 'onnx/dit_q4.onnx', src: 'models/onnx/dit_q4.onnx' },
      { path: 'onnx/decoder_q4.onnx', src: 'models/onnx/decoder_q4.onnx' },
    ],
    chunkIndexes: [
      { path: 'onnx/number_conditioner_chunks.json', src: 'models/onnx/number_conditioner_chunks.json' },
      { path: 'onnx/dit_q4_chunks.json', src: 'models/onnx/dit_q4_chunks.json' },
      { path: 'onnx/decoder_q4_chunks.json', src: 'models/onnx/decoder_q4_chunks.json' },
    ],
  },
  {
    id: 'medium',
    label: 'SA3 Medium',
    requires: ['encoder'],
    files: [
      { path: 'medium/dit_q4.onnx', src: 'models-medium/dit_q4.onnx' },
      { path: 'medium/decoder_fp16.onnx', src: 'models-medium/decoder_fp16.onnx' },
    ],
    chunkIndexes: [
      { path: 'medium/dit_q4_chunks.json', src: 'models-medium/dit_q4_chunks.json' },
      { path: 'medium/decoder_fp16_chunks.json', src: 'models-medium/decoder_fp16_chunks.json' },
    ],
  },
  {
    id: 'small-sfx',
    label: 'SA3 Small SFX',
    requires: ['encoder'],
    // Produced locally into models/small-sfx; listed only when that directory exists.
    optionalDir: 'small-sfx',
    files: [
      { path: 'small-sfx/onnx/number_conditioner.onnx' },
      { path: 'small-sfx/onnx/dit_q4.onnx' },
      { path: 'small-sfx/onnx/decoder_q4.onnx' },
    ],
    chunkIndexes: [
      { path: 'small-sfx/onnx/number_conditioner_chunks.json' },
      { path: 'small-sfx/onnx/dit_q4_chunks.json' },
      { path: 'small-sfx/onnx/decoder_q4_chunks.json' },
    ],
  },
];

/**
 * Expand a pack into [{path, src}] including chunk files.
 * `resolveIndex(entry)` returns the absolute path of a chunk index file to read.
 */
export function expandPack(spec, resolveIndex) {
  const out = [...spec.files];
  for (const idx of spec.chunkIndexes) {
    out.push({ path: idx.path, src: idx.src });
    const json = JSON.parse(readFileSync(resolveIndex(idx), 'utf8'));
    for (const chunk of json.chunks ?? []) {
      out.push({
        path: posix.join(posix.dirname(idx.path), chunk.name),
        src: idx.src ? posix.join(posix.dirname(idx.src), chunk.name) : undefined,
      });
    }
  }
  return out;
}
