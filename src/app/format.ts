import type { LogEntry, LogLevel } from '../log';
import type { CompatResult } from '../compat';
import type { Manifest, PackState, PackStatus } from '../store/modelManager';
import { MODEL_IDS, type ModelId } from '../gen/protocol';
import { MODEL_LABELS } from '../gen/prompt';

export function formatBytes(n: number | undefined | null): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return 'unknown';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`;
}

/** Elapsed time as "12.3 s" under a minute, "m:ss" above. */
export function formatElapsed(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

/** Playhead in 16th steps as bar.beat.sixteenth (all 1-based). */
export function formatPosition(step: number): string {
  const s = Math.max(0, Math.floor(step));
  const bar = Math.floor(s / 16) + 1;
  const beat = Math.floor((s % 16) / 4) + 1;
  const sixteenth = (s % 4) + 1;
  return `${bar}.${beat}.${sixteenth}`;
}

export const NOTE_ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

export function keyLabel(key: string, scale?: string): string {
  return `${key} ${scale === 'minor' ? 'min' : 'maj'}`;
}

/** Parses a typed tempo; null when not a number. Result is clamped by the caller's model helper. */
export function parseBpm(text: string): number | null {
  const v = Number(text.trim());
  return Number.isFinite(v) && v > 0 ? v : null;
}

export interface ModelCard {
  id: ModelId;
  label: string;
  /** False when the manifest lists no pack for this model. */
  available: boolean;
  status: PackStatus;
  /** Bytes for the model pack plus every pack it requires. */
  bytes: number;
  presentFiles: number;
  totalFiles: number;
}

function closureIds(manifest: Manifest, id: string, seen = new Set<string>()): string[] {
  if (seen.has(id)) return [];
  seen.add(id);
  const p = manifest.packs.find((x) => x.id === id);
  if (!p) return [];
  return [...p.requires.flatMap((r) => closureIds(manifest, r, seen)), id];
}

export function modelCards(manifest: Manifest | null, states: Record<string, PackState>): ModelCard[] {
  return MODEL_IDS.map((id) => {
    const label = MODEL_LABELS[id];
    const pack = manifest?.packs.find((p) => p.id === id);
    if (!manifest || !pack) return { id, label, available: false, status: 'missing' as const, bytes: 0, presentFiles: 0, totalFiles: 0 };
    const ids = closureIds(manifest, id);
    let bytes = 0;
    let present = 0;
    let total = 0;
    let allInstalled = true;
    for (const pid of ids) {
      const p = manifest.packs.find((x) => x.id === pid)!;
      const st = states[pid];
      bytes += p.totalBytes;
      total += p.files.length;
      present += st?.presentFiles ?? 0;
      if (st?.status !== 'installed') allInstalled = false;
    }
    const status: PackStatus = allInstalled ? 'installed' : present > 0 ? 'partial' : 'missing';
    return { id, label, available: true, status, bytes, presentFiles: present, totalFiles: total };
  });
}

export const MODEL_NOTES: Record<ModelId, string> = {
  'small-sfx': 'Sound effects and one-shots.',
  'small-music': 'Instrument sounds. Best choice for phones.',
  medium: 'Higher quality. Needs a lot of memory; unverified on phones.',
};

/** Hint shown under the model picker; null when the model can be used. */
export function modelHint(card: ModelCard): string | null {
  if (!card.available) return 'not available';
  if (card.status !== 'installed') return 'Download on Models screen';
  return null;
}

export function peaksOf(pcm: Float32Array, bins: number): Float32Array {
  const out = new Float32Array(bins);
  if (pcm.length === 0 || bins <= 0) return out;
  const per = pcm.length / bins;
  for (let b = 0; b < bins; b++) {
    const from = Math.floor(b * per);
    const to = Math.max(from + 1, Math.floor((b + 1) * per));
    let m = 0;
    for (let i = from; i < to && i < pcm.length; i++) m = Math.max(m, Math.abs(pcm[i]!));
    out[b] = m;
  }
  return out;
}

export function filterLog(entries: LogEntry[], levels: ReadonlySet<LogLevel>, scope: string): LogEntry[] {
  return entries.filter((e) => levels.has(e.level) && (scope === '' || e.scope === scope || e.scope.startsWith(scope + '.')));
}

export function logScopes(entries: LogEntry[]): string[] {
  return [...new Set(entries.map((e) => e.scope.split('.')[0]!))].sort();
}

export function formatLogTime(t: number): string {
  const d = new Date(t);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

export interface TimingRow {
  stage: string;
  ms: number;
}

/** Stage durations of a recorded generation; denoise steps are folded into one row. */
export function timingRows(record: unknown): TimingRow[] {
  const stages = (record as { stages?: Array<{ name: string; startMs: number; endMs: number }> } | null)?.stages;
  if (!Array.isArray(stages)) return [];
  const rows: TimingRow[] = [];
  let steps = 0;
  let stepMs = 0;
  for (const s of stages) {
    const ms = s.endMs - s.startMs;
    if (/^denoise-step-\d+$/.test(s.name)) {
      steps++;
      stepMs += ms;
    } else if (s.name !== 'total') rows.push({ stage: s.name, ms });
  }
  if (steps > 0) rows.push({ stage: `denoise (${steps} steps)`, ms: stepMs });
  const total = stages.find((s) => s.name === 'total');
  if (total) rows.push({ stage: 'total', ms: total.endMs - total.startMs });
  return rows;
}

export function failedReasons(result: CompatResult): string[] {
  return result.checks.filter((c) => c.status === 'fail').map((c) => `${c.label}: ${c.detail}`);
}

export function canContinue(result: CompatResult | null): boolean {
  return !!result && result.verdict !== 'no';
}

export const COMPAT_TEXT = {
  ok: 'This browser can run the app.',
  maybe: 'This browser might run the app. Some checks could not be confirmed.',
  no: 'This app will not run on this browser.',
} as const;

export function reportFileName(iso: string): string {
  return `sa3-report-${iso.replace(/[:.]/g, '-')}.json`;
}

export const QUICK_PROMPTS = ['synth lead', 'warm pad', 'pluck', 'bass', 'bell', 'choir', 'laser zap', 'kick'] as const;
