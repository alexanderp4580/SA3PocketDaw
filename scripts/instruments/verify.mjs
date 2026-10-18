#!/usr/bin/env node
/**
 * Decodes the looped files of a built pack in headless Chromium and measures the jump at the loop seam against the original audio.
 * Usage: node scripts/instruments/verify.mjs <pack-dir> <source-library-dir> [--sfz NAME]
 * Needs playwright-core (PLAYWRIGHT_CORE=<path to its node_modules entry> if it is not resolvable) and Chromium (CHROMIUM=<binary>).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseSfz } from '../../src/audio/sfz/parser.ts';

/** Seam metric over one channel: extrapolation error at the wrap relative to the roughness of the audio next to it. Pure, also runs in the page. */
export function seamMetric(y, ls, le) {
  const err = Math.abs(y[ls] - (2 * y[le - 1] - y[le - 2]));
  let acc = 0, n = 0;
  const add = (a, b) => { for (let i = a; i < b; i++) { const d = y[i + 1] - 2 * y[i] + y[i - 1]; acc += d * d; n++; } };
  add(Math.max(1, le - 1024), le - 1);
  add(ls + 1, Math.min(le - 1, ls + 1024));
  const rough = Math.sqrt(acc / Math.max(1, n));
  return { err, rough, ratio: err / Math.max(rough, 1e-9) };
}

const median = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] ?? 0;

async function main() {
  const [packDir, libDir] = process.argv.slice(2).map((p) => resolve(p));
  const preset = JSON.parse(readFileSync(join(packDir, 'preset.json'), 'utf8'));
  const looped = new Map();
  preset.regions.forEach((r) => { if (r.loopStart !== undefined && !looped.has(r.file)) looped.set(r.file, r); });
  if (!looped.size) { console.log('no looped regions'); return; }
  const sfzName = process.argv.includes('--sfz') ? process.argv[process.argv.indexOf('--sfz') + 1] : readdirSfz(libDir);
  const parsed = parseSfz(readFileSync(join(libDir, sfzName), 'utf8'));
  const { chromium } = await import(process.env.PLAYWRIGHT_CORE ? pathToFileURL(process.env.PLAYWRIGHT_CORE).href : 'playwright-core');
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? join(homedir(), '.cache/ms-playwright/chromium-1243/chrome-linux64/chrome'), headless: true, args: ['--no-sandbox', '--headless=new'] });
  const page = await browser.newPage();
  await page.goto('about:blank');
  const rows = [];
  for (const [file, r] of looped) {
    const f = preset.files[file];
    const b64 = readFileSync(join(packDir, f.path)).toString('base64');
    const ls = Math.round(r.loopStart * preset.sampleRate), le = Math.round(r.loopEnd * preset.sampleRate);
    const decoded = await page.evaluate(async ({ b64, ls, le, fn, rate }) => {
      const metric = new Function(`return ${fn}`)();
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const ctx = new OfflineAudioContext(1, rate, rate);
      const buf = await ctx.decodeAudioData(bytes.buffer);
      const per = [];
      for (let c = 0; c < buf.numberOfChannels; c++) per.push(metric(buf.getChannelData(c), ls, le));
      return { length: buf.length, rate: buf.sampleRate, per };
    }, { b64, ls, le, fn: seamMetric.toString(), rate: preset.sampleRate });
    // Original: the source file at the same loop frames.
    const region = parsed.regions.find((x) => x.loopEnd !== undefined && Math.abs((x.loopStart + 0) / 44100 - r.loopStart) < 1e-3 && Math.abs((x.loopEnd + 1) / 44100 - r.loopEnd) < 1e-3);
    let base = null;
    if (region) {
      const out = spawnSync(process.env.FFMPEG ?? '/usr/bin/ffmpeg', ['-v', 'error', '-i', join(libDir, region.sample), '-f', 'f32le', '-ac', String(f.channels), '-ar', '44100', 'pipe:1'], { maxBuffer: 1 << 30 }).stdout;
      const all = new Float32Array(out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength));
      const ch = f.channels;
      base = [];
      for (let c = 0; c < ch; c++) { const lane = new Float32Array(all.length / ch); for (let i = 0; i < lane.length; i++) lane[i] = all[i * ch + c]; base.push(seamMetric(lane, region.loopStart, region.loopEnd + 1)); }
    }
    rows.push({ path: f.path, frames: f.frames, minFrames: le, decodedFrames: decoded.length, decodeRate: decoded.rate, aac: Math.max(...decoded.per.map((p) => p.ratio)), orig: base ? Math.max(...base.map((p) => p.ratio)) : null, aacErrRel: Math.max(...decoded.per.map((p) => p.err)) });
  }
  await browser.close();
  const short = rows.filter((r) => r.decodedFrames < r.minFrames);
  console.log(`looped files: ${rows.length}; decoded shorter than the loop end: ${short.length}`);
  console.log(`seam ratio (extrapolation error / local roughness)  AAC median ${median(rows.map((r) => r.aac)).toFixed(2)} max ${Math.max(...rows.map((r) => r.aac)).toFixed(2)}`);
  const o = rows.filter((r) => r.orig !== null).map((r) => r.orig);
  if (o.length) console.log(`original FLAC                                       median ${median(o).toFixed(2)} max ${Math.max(...o).toFixed(2)}`);
  const worst = rows.slice().sort((a, b) => b.aac - a.aac).slice(0, 5);
  for (const w of worst) console.log(`  ${w.path} aac ${w.aac.toFixed(2)} orig ${w.orig?.toFixed(2)} abs err ${w.aacErrRel.toExponential(2)}`);
}

function readdirSfz(dir) {
  const r = spawnSync('ls', [dir]).stdout.toString().split('\n').find((n) => n.endsWith('.sfz'));
  if (!r) throw new Error('no .sfz in the library directory; pass --sfz NAME');
  return r;
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) await main();
