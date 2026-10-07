import { mkdirSync, rmSync, symlinkSync, existsSync, lstatSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PACKS, DEFAULT_POC_ROOT, expandPack } from './model-packs.mjs';

/** Create symlinks under modelsDir pointing at the PoC model files. Returns linked paths. */
export function linkModels(pocRoot, modelsDir) {
  const linked = [];
  for (const spec of PACKS) {
    if (spec.optionalDir) continue;
    const files = expandPack(spec, (idx) => join(pocRoot, idx.src));
    for (const f of files) {
      const source = join(pocRoot, f.src);
      if (!existsSync(source)) throw new Error(`missing source file: ${source}`);
      const target = join(modelsDir, f.path);
      mkdirSync(dirname(target), { recursive: true });
      try {
        lstatSync(target);
        rmSync(target);
      } catch {
        // target does not exist yet
      }
      symlinkSync(source, target);
      linked.push(f.path);
    }
  }
  return linked;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const poc = process.env.POC_ROOT ?? DEFAULT_POC_ROOT;
  const linked = linkModels(poc, join(root, 'models'));
  console.log(`linked ${linked.length} files into models/`);
}
