/**
 * SFZ subset parser. Self-contained (no imports) so Node can run it directly from the pack builder.
 * Output regions are fully resolved: inheritance, #define/#include, default_path and the default controller state are applied.
 */

export type LoopMode = 'no_loop' | 'one_shot' | 'loop_continuous' | 'loop_sustain';
export type Trigger = 'attack' | 'release' | 'first' | 'legato';

export interface SfzRegion {
  /** Path relative to the .sfz root, default_path applied. */
  sample: string;
  lokey: number;
  hikey: number;
  pitchKeycenter: number;
  /** Cents per key; 0 plays every key at the original pitch. */
  pitchKeytrack: number;
  lovel: number;
  hivel: number;
  /** Cents, `tune` plus `transpose` * 100. */
  tune: number;
  /** dB, `volume` plus `group_volume`. */
  volume: number;
  /** -100..100 */
  pan: number;
  loopMode: LoopMode;
  /** Frames of the source file; inclusive end as in SFZ. */
  loopStart?: number;
  loopEnd?: number;
  /** Frames. */
  offset: number;
  end?: number;
  /** Seconds, sustain 0..1. */
  ampeg: { attack: number; hold: number; decay: number; sustain: number; release: number };
  /** 0..1 */
  ampVeltrack: number;
  trigger: Trigger;
  group?: number;
  offBy?: number;
  /** dB per second the key was held, for release triggers. */
  rtDecay: number;
  filter?: { cutoff: number };
}

export interface SfzParseResult {
  regions: SfzRegion[];
  /** Opcode (controller numbers folded to `#`) -> number of regions that carry it. */
  unsupported: Record<string, number>;
  skipped: Array<{ reason: string; count: number }>;
}

export interface SfzParseOptions {
  /** Returns the text of an #include path (as written in the file); throws when it cannot. */
  readFile?: (path: string) => string;
}

const NOTE_BASE: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

/** MIDI number from `60`, `021`, `-1` or a note name (C4 = 60); null when it is neither. */
export function noteNumber(value: string): number | null {
  const v = value.trim();
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  const m = /^([a-gA-G])([#b]?)(-?\d+)$/.exec(v);
  if (!m) return null;
  const semis = NOTE_BASE[m[1]!.toLowerCase()]! + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return (parseInt(m[3]!, 10) + 1) * 12 + semis;
}

function stripLineComment(line: string): string {
  const i = line.indexOf('//');
  return i < 0 ? line : line.slice(0, i);
}

function substitute(text: string, defines: Map<string, string>): string {
  if (!text.includes('$') || defines.size === 0) return text;
  const names = [...defines.keys()].sort((a, b) => b.length - a.length);
  let out = '';
  for (let i = 0; i < text.length; ) {
    if (text[i] === '$') {
      const name = names.find((n) => text.startsWith(n, i));
      if (name) {
        out += defines.get(name);
        i += name.length;
        continue;
      }
    }
    out += text[i++];
  }
  return out;
}

function expand(text: string, defines: Map<string, string>, readFile: SfzParseOptions['readFile'], depth: number): string {
  if (depth > 16) throw new Error('#include nesting is too deep');
  let out = '';
  for (const raw of text.replace(/\/\*[\s\S]*?\*\//g, ' ').split(/\r?\n/)) {
    const line = stripLineComment(raw);
    let buf = '';
    for (let i = 0; i < line.length; ) {
      if (line.startsWith('#define', i)) {
        const m = /^#define\s+(\$[A-Za-z0-9_]+)\s*(.*)$/.exec(line.slice(i));
        if (m) defines.set(m[1]!, substitute(m[2]!.trim(), defines));
        break;
      }
      if (line.startsWith('#include', i)) {
        const m = /^#include\s+"([^"]*)"/.exec(line.slice(i));
        if (!m) {
          i += 8;
          continue;
        }
        out += substitute(buf, defines) + ' ';
        buf = '';
        if (!readFile) throw new Error(`#include "${m[1]}" needs a file reader`);
        out += expand(readFile(m[1]!), defines, readFile, depth + 1) + ' ';
        i += m[0].length;
        continue;
      }
      buf += line[i++];
    }
    out += substitute(buf, defines) + '\n';
  }
  return out;
}

type Ops = Record<string, string>;
type Token = { header: string } | { op: string; value: string };

function tokenize(text: string): Token[] {
  const re = /<([A-Za-z_]+)>|(?<![A-Za-z0-9_$])([A-Za-z_][A-Za-z0-9_$]*)=/g;
  const marks: Array<{ at: number; end: number; header?: string; op?: string }> = [];
  for (let m = re.exec(text); m; m = re.exec(text)) marks.push({ at: m.index, end: re.lastIndex, ...(m[1] ? { header: m[1] } : { op: m[2]! }) });
  const out: Token[] = [];
  marks.forEach((m, i) => {
    if (m.header) return void out.push({ header: m.header });
    const raw = text.slice(m.end, marks[i + 1]?.at ?? text.length).trim();
    const free = m.op === 'sample' || m.op === 'default_path';
    out.push({ op: m.op!, value: free ? raw : (raw.split(/\s+/)[0] ?? '') });
  });
  return out;
}

const CC_RE = /^(.*?)_?(?:on)?cc(\d+)$/;
/** Opcodes that take a controller modulation at the default controller value. */
const MODULATED = new Set(['ampeg_attack', 'ampeg_hold', 'ampeg_decay', 'ampeg_release', 'amp_veltrack']);
/** Understood opcodes (plus their cc forms) that the player does not act on and that are not worth a warning. */
const QUIET = new Set(['region_label', 'group_label', 'master_label', 'sw_label', 'default_path', 'octave_offset', 'note_offset', 'sw_lokey', 'sw_hikey', 'sw_default', 'sw_last', 'locc', 'hicc']);
const KNOWN = new Set([
  'sample', 'lokey', 'hikey', 'key', 'pitch_keycenter', 'pitch_keytrack', 'lovel', 'hivel', 'tune', 'transpose', 'volume', 'group_volume', 'pan',
  'loop_mode', 'loopmode', 'loop_start', 'loopstart', 'loop_end', 'loopend', 'offset', 'end', 'ampeg_attack', 'ampeg_hold', 'ampeg_decay', 'ampeg_sustain', 'ampeg_release',
  'amp_veltrack', 'trigger', 'group', 'off_by', 'rt_decay', 'fil_type', 'cutoff', 'curve_index',
]);

const normalizeName = (op: string) => op.replace(/cc\d+$/, 'cc#');

function num(ops: Ops, name: string, fallback: number): number {
  const v = ops[name];
  if (v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function curve(index: number, x: number): number {
  switch (index) {
    case 1: return 2 * x - 1;
    case 2: return 1 - x;
    case 3: return 1 - 2 * x;
    default: return x;
  }
}

export function parseSfz(text: string, options: SfzParseOptions = {}): SfzParseResult {
  const tokens = tokenize(expand(text, new Map(), options.readFile, 0));
  let section = '';
  const control: Ops = {};
  let global: Ops = {}, master: Ops = {}, group: Ops = {};
  let region: Ops | null = null;
  const raw: Ops[] = [];
  const flush = () => {
    if (region) raw.push({ ...global, ...master, ...group, ...region });
    region = null;
  };
  for (const t of tokens) {
    if ('header' in t) {
      flush();
      section = t.header;
      if (section === 'global') global = {}, master = {}, group = {};
      else if (section === 'master') master = {}, group = {};
      else if (section === 'group') group = {};
      else if (section === 'region') region = {};
      continue;
    }
    if (section === 'control') control[t.op] = t.value;
    else if (section === 'global') global[t.op] = t.value;
    else if (section === 'master') master[t.op] = t.value;
    else if (section === 'group') group[t.op] = t.value;
    else if (section === 'region' && region) region[t.op] = t.value;
  }
  flush();

  const cc = (n: number): number => {
    if (control[`set_hdcc${n}`] !== undefined) return Number(control[`set_hdcc${n}`]);
    if (control[`set_cc${n}`] !== undefined) return Number(control[`set_cc${n}`]) / 127;
    return 0;
  };
  const defaultPath = (control['default_path'] ?? '').replace(/\\/g, '/');

  const regions: SfzRegion[] = [];
  const unsupported: Record<string, number> = {};
  const skipped = new Map<string, number>();
  const skip = (reason: string) => skipped.set(reason, (skipped.get(reason) ?? 0) + 1);

  for (const ops of raw) {
    const sample = (ops['sample'] ?? '').trim();
    if (!sample || sample.startsWith('*')) { skip('no sample file'); continue; }
    const key = ops['key'] !== undefined ? noteNumber(ops['key']) : null;
    const lokey = key ?? noteNumber(ops['lokey'] ?? '0') ?? 0;
    const hikey = key ?? noteNumber(ops['hikey'] ?? '127') ?? 127;
    if (lokey < 0 || hikey < 0 || lokey > hikey) { skip('no note range'); continue; }
    let inactive = false;
    for (const k of Object.keys(ops)) {
      const m = /^(lo|hi)cc(\d+)$/.exec(k);
      if (!m) continue;
      const v = cc(Number(m[2])) * 127;
      if (m[1] === 'lo' ? v < Number(ops[k]) : v > Number(ops[k])) inactive = true;
    }
    if (inactive) { skip('controller condition'); continue; }
    const swDefault = ops['sw_default'] !== undefined ? noteNumber(ops['sw_default']) : null;
    if (ops['sw_last'] !== undefined && noteNumber(ops['sw_last']) !== swDefault) { skip('keyswitch'); continue; }

    const mod = (name: string, base: number, scale: number): number => {
      let v = base;
      for (const k of Object.keys(ops)) {
        const m = CC_RE.exec(k);
        if (!m || m[1] !== name || k.includes('curve') || k.startsWith('lo') || k.startsWith('hi')) continue;
        const curveIndex = num(ops, `${name}_curvecc${m[2]}`, 0);
        v += (Number(ops[k]) / scale) * curve(curveIndex, cc(Number(m[2])));
      }
      return v;
    };

    for (const k of Object.keys(ops)) {
      if (KNOWN.has(k) || QUIET.has(k) || /^(lo|hi)cc\d+$/.test(k)) continue;
      const m = CC_RE.exec(k);
      if (m && (MODULATED.has(m[1]!) || (/_?curve$/.test(m[1]!) && MODULATED.has(m[1]!.replace(/_?curve$/, ''))))) continue;
      const name = normalizeName(k);
      unsupported[name] = (unsupported[name] ?? 0) + 1;
    }

    const loopMode = (ops['loop_mode'] ?? ops['loopmode'] ?? 'no_loop') as LoopMode;
    const loopStart = ops['loop_start'] ?? ops['loopstart'];
    const loopEnd = ops['loop_end'] ?? ops['loopend'];
    const end = num(ops, 'end', -2);
    const filType = ops['fil_type'];
    const out: SfzRegion = {
      sample: (defaultPath + sample).replace(/\\/g, '/'),
      lokey, hikey,
      pitchKeycenter: noteNumber(ops['pitch_keycenter'] ?? String(key ?? 60)) ?? 60,
      pitchKeytrack: num(ops, 'pitch_keytrack', 100),
      lovel: num(ops, 'lovel', 0),
      hivel: num(ops, 'hivel', 127),
      tune: num(ops, 'tune', 0) + num(ops, 'transpose', 0) * 100,
      volume: num(ops, 'volume', 0) + num(ops, 'group_volume', 0),
      pan: num(ops, 'pan', 0),
      loopMode,
      ...(loopStart !== undefined && Number.isFinite(Number(loopStart)) ? { loopStart: Number(loopStart) } : {}),
      ...(loopEnd !== undefined && Number.isFinite(Number(loopEnd)) ? { loopEnd: Number(loopEnd) } : {}),
      offset: Math.max(0, num(ops, 'offset', 0)),
      ...(end >= 0 ? { end } : {}),
      ampeg: {
        attack: Math.max(0, mod('ampeg_attack', num(ops, 'ampeg_attack', 0), 1)),
        hold: Math.max(0, mod('ampeg_hold', num(ops, 'ampeg_hold', 0), 1)),
        decay: Math.max(0, mod('ampeg_decay', num(ops, 'ampeg_decay', 0), 1)),
        sustain: Math.min(1, Math.max(0, num(ops, 'ampeg_sustain', 100) / 100)),
        release: Math.max(0, mod('ampeg_release', num(ops, 'ampeg_release', 0), 1)),
      },
      ampVeltrack: Math.min(1, Math.max(-1, mod('amp_veltrack', num(ops, 'amp_veltrack', 100), 1) / 100)),
      trigger: (ops['trigger'] ?? 'attack') as Trigger,
      ...(ops['group'] !== undefined ? { group: num(ops, 'group', 0) } : {}),
      ...(ops['off_by'] !== undefined ? { offBy: num(ops, 'off_by', 0) } : {}),
      rtDecay: num(ops, 'rt_decay', 0),
      ...(filType && /^lpf_[12]p$/.test(filType) && ops['cutoff'] !== undefined ? { filter: { cutoff: num(ops, 'cutoff', 20000) } } : {}),
    };
    if (filType && !/^lpf_[12]p$/.test(filType)) unsupported[`fil_type=${filType}`] = (unsupported[`fil_type=${filType}`] ?? 0) + 1;
    regions.push(out);
  }
  return { regions, unsupported, skipped: [...skipped].map(([reason, count]) => ({ reason, count })) };
}
