/** Pure planning helpers of the pack builder (no file or process access). */

const center = (l) => (l.lovel + l.hivel) / 2;

/** Distinct velocity ranges of a region list, sorted by their centre. */
export function distinctLayers(regions) {
  const seen = new Map();
  for (const r of regions) seen.set(`${r.lovel}-${r.hivel}`, { lovel: r.lovel, hivel: r.hivel });
  return [...seen.values()].sort((a, b) => center(a) - center(b));
}

/**
 * `count` layers spread across the velocity range: each wanted velocity (the middle of an equal band) takes the nearest
 * unused original layer. Returns all layers when there are at most `count`.
 */
export function chooseLayers(layers, count) {
  if (!(count >= 1) || layers.length <= count) return layers.slice();
  const taken = new Set();
  const out = [];
  for (let i = 0; i < count; i++) {
    const want = ((i + 0.5) * 127) / count;
    let best = -1;
    layers.forEach((l, j) => {
      if (!taken.has(j) && (best < 0 || Math.abs(center(l) - want) < Math.abs(center(layers[best]) - want))) best = j;
    });
    taken.add(best);
    out.push(layers[best]);
  }
  return out.sort((a, b) => center(a) - center(b));
}

/** Contiguous velocity ranges 1..127 for the chosen layers, split halfway between their centres. Keys are `lovel-hivel` of the original. */
export function respanLayers(chosen) {
  const sorted = chosen.slice().sort((a, b) => center(a) - center(b));
  const map = new Map();
  sorted.forEach((l, i) => {
    const lovel = i === 0 ? 1 : Math.floor((center(sorted[i - 1]) + center(l)) / 2) + 1;
    const hivel = i === sorted.length - 1 ? 127 : Math.floor((center(l) + center(sorted[i + 1])) / 2);
    map.set(`${l.lovel}-${l.hivel}`, { lovel, hivel });
  });
  return map;
}

/** Contiguous key ranges for regions of one layer, split halfway between their centres; the outer ends keep their original reach. */
export function respanKeys(regions) {
  const sorted = regions.slice().sort((a, b) => a.pitchKeycenter - b.pitchKeycenter);
  const lo = Math.min(...sorted.map((r) => r.lokey));
  const hi = Math.max(...sorted.map((r) => r.hikey));
  return sorted.map((r, i) => ({
    ...r,
    lokey: i === 0 ? lo : Math.floor((sorted[i - 1].pitchKeycenter + r.pitchKeycenter) / 2) + 1,
    hikey: i === sorted.length - 1 ? hi : Math.floor((r.pitchKeycenter + sorted[i + 1].pitchKeycenter) / 2),
  }));
}

/** Keeps every `step`-th region (by centre) of each layer, always the first and last, and respans the key ranges. */
export function thinKeys(regions, step) {
  if (!(step > 1)) return regions;
  const byLayer = new Map();
  for (const r of regions) {
    const k = `${r.lovel}-${r.hivel}`;
    if (!byLayer.has(k)) byLayer.set(k, []);
    byLayer.get(k).push(r);
  }
  const out = [];
  for (const list of byLayer.values()) {
    const sorted = list.slice().sort((a, b) => a.pitchKeycenter - b.pitchKeycenter);
    const kept = sorted.filter((_, i) => i % step === 0 || i === sorted.length - 1);
    out.push(...respanKeys(kept));
  }
  return out;
}

/** Longest tail in seconds for a centre key: the first schedule entry whose `upTo` covers it, times `scale`. */
export function tailSeconds(key, schedule, scale = 1) {
  const e = schedule.find((s) => key <= s.upTo) ?? schedule[schedule.length - 1];
  return e.sec * scale;
}

/** Loop points in seconds of the trimmed file; SFZ `loop_end` is inclusive. */
export function loopSeconds(region, sourceRate) {
  if (region.loopStart === undefined || region.loopEnd === undefined || !/^loop_(continuous|sustain)$/.test(region.loopMode)) return null;
  return { start: (region.loopStart - region.offset) / sourceRate, end: (region.loopEnd + 1 - region.offset) / sourceRate };
}

/** Highest ladder entry (kbit/s per channel) whose estimated size fits `budgetBytes`; the lowest entry when none does. */
export function pickBitrate(channelSeconds, budgetBytes, ladder) {
  const sorted = ladder.slice().sort((a, b) => b - a);
  return sorted.find((kbps) => (channelSeconds * kbps * 1000) / 8 <= budgetBytes) ?? sorted[sorted.length - 1];
}

/**
 * Seconds kept for a file. A looped file ends with its loop; other files keep their length, cut at the register's tail limit.
 * Returns {seconds, truncated}.
 */
export function keptSeconds({ available, loopEnd, tail }) {
  if (loopEnd != null) return { seconds: Math.min(available, loopEnd), truncated: false };
  return tail < available ? { seconds: tail, truncated: true } : { seconds: available, truncated: false };
}

/** Equal-power crossfade of the last `fade` frames of the loop with the material just before the loop start (in place). */
export function bakeCrossfade(pcm, loopStart, loopEnd, fade) {
  const n = Math.min(fade, loopStart, Math.floor((loopEnd - loopStart) / 3));
  for (let i = 0; i < n; i++) {
    const t = (i + 1) / (n + 1);
    const a = Math.cos((t * Math.PI) / 2);
    const b = Math.sin((t * Math.PI) / 2);
    const at = loopEnd - n + i;
    pcm[at] = pcm[at] * a + pcm[loopStart - n + i] * b;
  }
  return n;
}
