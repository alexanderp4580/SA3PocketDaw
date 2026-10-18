#!/usr/bin/env node
/**
 * Builds a browser instrument pack from an SFZ library.
 * Usage: node scripts/instruments/build.mjs <pack|all> [--source DIR] [--out DIR] [--layers N] [--key-step N]
 *        [--decoded-mb N] [--download-mb N] [--bitrate KBPS] [--channels auto|mono|stereo] [--bake-loops|--no-bake-loops]
 * Needs ffmpeg and ffprobe (FFMPEG / FFPROBE override /usr/bin/ffmpeg and ffprobe on PATH).
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSfz } from '../../src/audio/sfz/parser.ts';
import { normalizePreset } from '../../src/audio/sfz/format.ts';
import { PACKS } from './packs.mjs';
import { bakeCrossfade, chooseLayers, distinctLayers, keptSeconds, loopSeconds, pickBitrate, respanLayers, thinKeys, tailSeconds } from './lib.mjs';

const RATE = 44100;
const LADDER = [32, 48, 64, 80, 96, 112, 128];
/** The loudest region of a pack peaks here at full velocity, leaving headroom for chords. */
const TARGET_PEAK = Math.pow(10, -6 / 20);
const FADE_SEC = 0.12;
/** Frames kept after a loop end (the loop continued where the file ends): the encoder can return a few frames fewer than it was given. */
const LOOP_PAD_FRAMES = 4096;
const FFMPEG = process.env.FFMPEG ?? (existsSync('/usr/bin/ffmpeg') ? '/usr/bin/ffmpeg' : 'ffmpeg');
const FFPROBE = process.env.FFPROBE ?? (existsSync('/usr/bin/ffprobe') ? '/usr/bin/ffprobe' : 'ffprobe');
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function run(cmd, args, input) {
  const r = spawnSync(cmd, args, { input, maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`${cmd} failed: ${String(r.stderr).slice(0, 400)}`);
  return r.stdout;
}

function probe(path) {
  const [rate, ch, dur] = String(run(FFPROBE, ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=sample_rate,channels,duration', '-of', 'csv=p=0', path])).trim().split(',');
  return { rate: Number(rate), channels: Number(ch), seconds: Number(dur) };
}

function decode(path, channels) {
  const out = run(FFMPEG, ['-v', 'error', '-i', path, '-f', 'f32le', '-ac', String(channels), '-ar', String(RATE), 'pipe:1']);
  return new Float32Array(out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength));
}

function encode(pcm, channels, kbps, out) {
  run(FFMPEG, ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(RATE), '-ac', String(channels), '-i', 'pipe:0', '-c:a', 'aac', '-b:a', `${kbps * channels}k`, '-movflags', '+faststart', out], Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength));
}

const round = (v, d = 6) => Number(v.toFixed(d));

/** Region list after layer, key and release selection. */
export function selectRegions(parsed, cfg) {
  let regions = parsed.regions.filter((r) => !cfg.excludeSample?.test(r.sample));
  const attack = regions.filter((r) => r.trigger !== 'release');
  const release = regions.filter((r) => r.trigger === 'release');
  const chosen = chooseLayers(distinctLayers(attack), cfg.layers);
  const spans = respanLayers(chosen);
  let kept = attack.filter((r) => spans.has(`${r.lovel}-${r.hivel}`)).map((r) => ({ ...r, ...spans.get(`${r.lovel}-${r.hivel}`) }));
  kept = thinKeys(kept, cfg.keyStep ?? 1);
  return { regions: [...kept, ...(cfg.keyStep > 1 ? [] : release)], layers: chosen.length };
}

/** File entries: one per distinct (sample, offset, end), with the longest tail of the regions that use it. */
function planFiles(regions, cfg, root) {
  const files = new Map();
  for (const r of regions) {
    const key = `${r.sample}|${r.offset}|${r.end ?? ''}`;
    let f = files.get(key);
    if (!f) {
      const info = probe(join(root, r.sample));
      f = { key, sample: r.sample, info, offset: r.offset, end: r.end, centers: [], loopEnd: null, regions: [] };
      files.set(key, f);
    }
    f.regions.push(r);
    f.centers.push(r.trigger === 'release' ? 127 : r.pitchKeycenter);
    const loop = cfg.dropLoops ? null : loopSeconds(r, f.info.rate);
    if (loop) f.loopEnd = Math.max(f.loopEnd ?? 0, loop.end);
  }
  return [...files.values()];
}

function frameCount(f, cfg, scale, channels) {
  const rate = f.info.rate;
  const end = f.end !== undefined ? Math.min(f.info.seconds, f.end / rate) : f.info.seconds;
  const available = Math.max(0, end - f.offset / rate);
  const tail = f.regions.every((r) => r.trigger === 'release') ? Infinity : Math.max(...f.centers.map((c) => tailSeconds(c, cfg.tails, scale)));
  if (f.loopEnd !== null) return { frames: Math.round(f.loopEnd * RATE) + LOOP_PAD_FRAMES, truncated: false, channels };
  const kept = keptSeconds({ available, tail });
  return { frames: Math.max(1, Math.round(kept.seconds * RATE)), truncated: kept.truncated, channels };
}

export function planBudget(files, cfg, channelsOpt, budgetBytes) {
  const anyStereo = files.some((f) => f.info.channels > 1);
  const trial = (channels, scale) => files.reduce((s, f) => s + frameCount(f, cfg, scale, channels).frames * channels * 4, 0);
  let channels = channelsOpt === 'mono' || !anyStereo ? 1 : 2;
  if (channelsOpt === 'auto' && channels === 2 && trial(2, 1) > budgetBytes) channels = 1;
  let scale = 1;
  while (trial(channels, scale) > budgetBytes && scale > 0.25) scale = round(scale - 0.05, 2);
  if (trial(channels, scale) > budgetBytes) throw new Error('decoded budget cannot be met even with the shortest tails');
  return { channels, scale, bytes: trial(channels, scale) };
}

export function buildPack(cfg, opts = {}) {
  const log = opts.log ?? console.log;
  const srcRoot = join(opts.source ?? join(homedir(), 'Music', 'sfz'), cfg.libraryDir);
  const sfzPath = join(srcRoot, cfg.sfz);
  const sfzDir = dirname(sfzPath);
  const out = resolve(opts.out ?? join(root, cfg.outDir ?? join('models', `inst-${cfg.id}`)));
  const settings = { ...cfg, ...(opts.layers ? { layers: opts.layers } : {}), ...(opts.keyStep ? { keyStep: opts.keyStep } : {}) };
  const budgetBytes = (opts.decodedMb ?? cfg.maxDecodedMB) * 1e6 * 0.995;
  const downloadBudget = (opts.downloadMb ?? cfg.maxDownloadMB) * 1e6;

  const parsed = parseSfz(readFileSync(sfzPath, 'utf8'), { readFile: (p) => readFileSync(join(sfzDir, p), 'utf8') });
  const unsupported = Object.entries(parsed.unsupported);
  if (unsupported.length) log(`[${cfg.id}] WARNING unsupported opcodes ignored: ${unsupported.map(([k, n]) => `${k} x${n}`).join(', ')}`);
  for (const s of parsed.skipped) log(`[${cfg.id}] skipped ${s.count} regions: ${s.reason}`);

  const sel = selectRegions(parsed, settings);
  const files = planFiles(sel.regions, settings, sfzDir);
  const plan = planBudget(files, settings, opts.channels ?? cfg.channels, budgetBytes);
  log(`[${cfg.id}] ${sel.regions.length} regions, ${files.length} files, ${sel.layers} velocity layers, ${plan.channels} channel(s), tail scale ${plan.scale}`);

  rmSync(out, { recursive: true, force: true });
  const work = join(out, '.work');
  mkdirSync(join(out, 'samples'), { recursive: true });
  mkdirSync(work, { recursive: true });

  // Pass A: decode, cut, fade, downmix; the pack-wide peak sets one gain for every file.
  let peakWanted = 0;
  files.forEach((f, i) => {
    const decoded = decode(join(sfzDir, f.sample), f.info.channels);
    const ch = f.info.channels;
    const info = frameCount(f, settings, plan.scale, plan.channels);
    const startFrame = Math.round((f.offset / f.info.rate) * RATE);
    const mono = new Float32Array(info.frames * plan.channels);
    const loopSec = f.regions.map((r) => (settings.dropLoops ? null : loopSeconds(r, f.info.rate))).find(Boolean);
    const loopA = loopSec ? Math.round(loopSec.start * RATE) : 0, loopB = loopSec ? Math.round(loopSec.end * RATE) : 0;
    for (let n = 0; n < info.frames; n++) {
      let src = startFrame + n;
      if (loopSec && n >= loopB && src >= decoded.length / ch) src = startFrame + loopA + ((n - loopB) % (loopB - loopA));
      if (src >= decoded.length / ch) break;
      if (plan.channels === 1) {
        let sum = 0;
        for (let c = 0; c < ch; c++) sum += decoded[src * ch + c];
        mono[n] = sum / ch;
      } else for (let c = 0; c < 2; c++) mono[n * 2 + c] = decoded[src * ch + Math.min(c, ch - 1)];
    }
    if (info.truncated) {
      const fade = Math.min(Math.round(FADE_SEC * RATE), Math.floor(info.frames / 4));
      for (let n = 0; n < fade; n++) for (let c = 0; c < plan.channels; c++) mono[(info.frames - fade + n) * plan.channels + c] *= 1 - (n + 1) / (fade + 1);
    }
    f.frames = info.frames;
    f.loop = null;
    for (const r of f.regions) {
      const loop = settings.dropLoops ? null : loopSeconds(r, f.info.rate);
      if (loop) f.loop = { start: loop.start, end: loop.end };
    }
    if (f.loop && (opts.bakeLoops ?? cfg.bakeLoops)) {
      const a = Math.round(f.loop.start * RATE), b = Math.min(info.frames, Math.round(f.loop.end * RATE));
      for (let c = 0; c < plan.channels; c++) {
        const lane = new Float32Array(info.frames);
        for (let n = 0; n < info.frames; n++) lane[n] = mono[n * plan.channels + c];
        bakeCrossfade(lane, a, b, Math.round(0.03 * RATE));
        for (let n = 0; n < info.frames; n++) mono[n * plan.channels + c] = lane[n];
      }
    }
    let peak = 0;
    for (let n = 0; n < mono.length; n++) peak = Math.max(peak, Math.abs(mono[n]));
    const volume = Math.max(...f.regions.map((r) => Math.pow(10, r.volume / 20)));
    peakWanted = Math.max(peakWanted, peak * volume);
    f.peak = peak;
    writeFileSync(join(work, `${i}.f32`), Buffer.from(mono.buffer));
  });
  const gain = peakWanted > 0 ? TARGET_PEAK / peakWanted : 1;

  // Pass B: apply the gain and encode, lowering the bitrate until the download fits.
  const channelSeconds = files.reduce((s, f) => s + (f.frames / RATE) * plan.channels, 0);
  let kbps = opts.bitrate ?? pickBitrate(channelSeconds / plan.channels, downloadBudget / plan.channels, LADDER);
  let total = 0;
  for (;;) {
    total = 0;
    files.forEach((f, i) => {
      const pcm = new Float32Array(readFileSync(join(work, `${i}.f32`)).buffer.slice(0));
      for (let n = 0; n < pcm.length; n++) pcm[n] *= gain;
      f.path = `samples/${String(i).padStart(3, '0')}.m4a`;
      encode(pcm, plan.channels, kbps, join(out, f.path));
      total += statSync(join(out, f.path)).size;
    });
    const lower = LADDER.filter((k) => k < kbps).at(-1);
    if (total <= downloadBudget || opts.bitrate || lower === undefined) break;
    kbps = lower;
  }
  rmSync(work, { recursive: true, force: true });

  const index = new Map(files.map((f, i) => [f, i]));
  const byKey = new Map(files.map((f) => [f.key, f]));
  const regions = sel.regions.map((r) => {
    const f = byKey.get(`${r.sample}|${r.offset}|${r.end ?? ''}`);
    const loop = settings.dropLoops ? null : loopSeconds(r, f.info.rate);
    const out = { file: index.get(f), lokey: r.lokey, hikey: r.hikey, center: r.pitchKeycenter, lovel: Math.max(1, r.lovel), hivel: Math.min(127, r.hivel) };
    if (r.tune) out.tune = round(r.tune, 2);
    if (r.volume) out.volume = round(r.volume, 2);
    if (r.pan) out.pan = round(r.pan / 100, 3);
    if (loop) { out.loopStart = round(loop.start); out.loopEnd = round(loop.end); }
    const e = r.ampeg;
    if (e.attack) out.attack = round(e.attack);
    if (e.hold) out.hold = round(e.hold);
    if (e.decay) out.decay = round(e.decay);
    if (e.sustain !== 1) out.sustain = round(e.sustain, 3);
    if (e.release) out.release = round(e.release);
    if (r.ampVeltrack !== 1) out.veltrack = round(Math.max(0, r.ampVeltrack), 3);
    if (r.pitchKeytrack === 0) out.keytrack = 0;
    if (r.trigger === 'release') { out.trigger = 'release'; if (r.rtDecay) out.rtDecay = round(r.rtDecay, 2); }
    if (r.filter) out.cutoff = r.filter.cutoff;
    if (r.loopMode === 'one_shot') out.oneShot = true;
    return out;
  });
  const preset = {
    version: 1,
    id: cfg.id,
    name: cfg.name,
    sampleRate: RATE,
    credits: [...cfg.credits, 'Changes: resampled to 44.1 kHz, shortened, lossy-encoded as AAC' + (sel.layers < distinctLayers(parsed.regions.filter((r) => r.trigger === 'attack')).length ? ', fewer velocity layers' : '') + '.'],
    license: cfg.license,
    files: files.map((f) => ({ path: f.path, frames: f.frames, channels: plan.channels })),
    regions: regions.sort((a, b) => (a.trigger === 'release') - (b.trigger === 'release') || a.lovel - b.lovel || a.lokey - b.lokey),
  };
  normalizePreset(JSON.parse(JSON.stringify(preset)));
  writeFileSync(join(out, 'preset.json'), JSON.stringify(preset) + '\n');
  for (const c of cfg.copy ?? []) copyFileSync(join(srcRoot, c.from), join(out, c.to));
  writeFileSync(join(out, 'CREDITS.txt'), `${cfg.name}\n\n${preset.credits.join('\n')}\n\nLicence: ${cfg.license}\nSource: ${cfg.sourceUrl}\nLicence text: LICENSE.txt\n`);

  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
  const downloadBytes = walk(out).reduce((s, p) => s + statSync(p).size, 0);
  const decodedBytes = files.reduce((s, f) => s + f.frames * plan.channels * 4, 0);
  const stats = { id: cfg.id, out, files: files.length, regions: regions.length, layers: sel.layers, channels: plan.channels, tailScale: plan.scale, kbpsPerChannel: kbps, downloadBytes, decodedBytes, gainDb: round(20 * Math.log10(gain), 2), loops: files.filter((f) => f.loop).length, unsupported: parsed.unsupported };
  log(`[${cfg.id}] done: download ${(downloadBytes / 1e6).toFixed(2)} MB, decoded ${(decodedBytes / 1e6).toFixed(1)} MB, ${files.length} files, ${kbps} kbit/s per channel, gain ${stats.gainDb} dB -> ${out}`);
  return stats;
}

function parseArgs(argv) {
  const o = { positional: [] };
  const map = { '--source': 'source', '--out': 'out', '--layers': 'layers', '--key-step': 'keyStep', '--decoded-mb': 'decodedMb', '--download-mb': 'downloadMb', '--bitrate': 'bitrate', '--channels': 'channels' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--bake-loops') o.bakeLoops = true;
    else if (a === '--no-bake-loops') o.bakeLoops = false;
    else if (map[a]) o[map[a]] = ['source', 'out', 'channels'].includes(map[a]) ? argv[++i] : Number(argv[++i]);
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else o.positional.push(a);
  }
  return o;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const ids = args.positional[0] === 'all' ? Object.keys(PACKS).filter((k) => k !== 'mini-piano') : args.positional;
  if (!ids.length) {
    console.log(`Usage: node scripts/instruments/build.mjs <${Object.keys(PACKS).join('|')}|all> [--source DIR] [--out DIR] [--layers N] [--key-step N] [--decoded-mb N] [--download-mb N] [--bitrate KBPS] [--channels auto|mono|stereo] [--bake-loops|--no-bake-loops]`);
    process.exit(1);
  }
  const stats = ids.map((id) => {
    if (!PACKS[id]) throw new Error(`unknown pack ${id}`);
    return buildPack(PACKS[id], args);
  });
  console.log(JSON.stringify(stats.map(({ unsupported, ...s }) => s), null, 1));
}
