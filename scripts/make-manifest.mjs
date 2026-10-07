import { existsSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PACKS, expandPack } from './model-packs.mjs';

/** Build the manifest object by reading real sizes from files under modelsDir. */
export function buildManifest(modelsDir) {
  const packs = PACKS.filter((spec) => !spec.optionalDir || existsSync(join(modelsDir, spec.optionalDir))).map((spec) => {
    const files = expandPack(spec, (idx) => join(modelsDir, idx.path)).map((f) => ({
      path: f.path,
      bytes: statSync(join(modelsDir, f.path)).size,
    }));
    return {
      id: spec.id,
      label: spec.label,
      requires: [...spec.requires],
      files,
      totalBytes: files.reduce((sum, f) => sum + f.bytes, 0),
    };
  });
  return { version: 1, packs };
}

export function writeManifest(modelsDir) {
  const manifest = buildManifest(modelsDir);
  writeFileSync(join(modelsDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const m = writeManifest(join(root, 'models'));
  for (const p of m.packs) console.log(`${p.id}: ${p.files.length} files, ${p.totalBytes} bytes`);
}
