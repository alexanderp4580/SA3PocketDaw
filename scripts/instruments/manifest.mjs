import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';

const PREFIX = 'inst-';

function walk(dir, rel = '') {
  return readdirSync(join(dir, rel), { withFileTypes: true }).flatMap((e) => {
    const next = rel ? posix.join(rel, e.name) : e.name;
    return e.isDirectory() ? walk(dir, next) : [next];
  });
}

/**
 * Manifest packs for the instrument packs under `modelsDir`: every `inst-*` folder with a `preset.json`.
 * The label, credits and licence come from that file; instrument packs require no other pack.
 */
export function instrumentPacks(modelsDir) {
  if (!existsSync(modelsDir)) return [];
  // statSync follows symlinks, so a linked pack folder counts like a real one.
  return readdirSync(modelsDir, { withFileTypes: true })
    .filter((e) => e.name.startsWith(PREFIX) && statSync(join(modelsDir, e.name)).isDirectory() && existsSync(join(modelsDir, e.name, 'preset.json')))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => {
      const preset = JSON.parse(readFileSync(join(modelsDir, e.name, 'preset.json'), 'utf8'));
      const files = walk(join(modelsDir, e.name))
        .filter((f) => !f.startsWith('.'))
        .sort()
        .map((f) => ({ path: posix.join(e.name, f), bytes: statSync(join(modelsDir, e.name, f)).size }));
      return {
        id: e.name,
        label: preset.name,
        ...(typeof preset.category === 'string' ? { category: preset.category } : {}),
        requires: [],
        files,
        totalBytes: files.reduce((sum, f) => sum + f.bytes, 0),
        credits: Array.isArray(preset.credits) ? preset.credits : [],
        license: typeof preset.license === 'string' ? preset.license : '',
      };
    });
}
