import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSwSource } from './sw/build.mjs';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(relative(dist, full).split(sep).join('/'));
  }
  return out;
}

const { source, buildId, precache } = buildSwSource(walk(dist), (url) => readFileSync(join(dist, url.slice(1))));
writeFileSync(join(dist, 'sw.js'), source);
console.log(`dist/sw.js written: build ${buildId}, ${precache.length} precached URLs`);
