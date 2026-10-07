import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPrecacheList, cacheNameFor } from './core.mjs';

const here = dirname(fileURLToPath(import.meta.url));

/** Build id: short hash over the precached paths and their bytes. */
export function buildIdFor(urls, read) {
  const h = createHash('sha256');
  for (const u of urls) {
    h.update(u);
    h.update(u === '/' ? '' : read(u));
  }
  return h.digest('hex').slice(0, 12);
}

/** Source of dist/sw.js for the given dist file list. `read(url)` returns the bytes of a precached URL. */
export function buildSwSource(files, read) {
  const precache = buildPrecacheList(files);
  const id = buildIdFor(precache, read);
  const core = readFileSync(join(here, 'core.mjs'), 'utf8').replace(/^export /gm, '');
  const template = readFileSync(join(here, 'template.js'), 'utf8');
  const header = `const CACHE_NAME = ${JSON.stringify(cacheNameFor(id))};\nconst PRECACHE = ${JSON.stringify(precache, null, 2)};\n`;
  return { source: `// build ${id}\n${header}\n${core}\n${template}`, buildId: id, precache };
}
