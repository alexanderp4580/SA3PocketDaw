import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { noteNumber, parseSfz } from './parser';

describe('noteNumber', () => {
  it('reads numbers and note names (C4 = 60)', () => {
    expect(noteNumber('021')).toBe(21);
    expect(noteNumber('c4')).toBe(60);
    expect(noteNumber('C#4')).toBe(61);
    expect(noteNumber('db4')).toBe(61);
    expect(noteNumber('A0')).toBe(21);
    expect(noteNumber('C-1')).toBe(0);
    expect(noteNumber('-1')).toBe(-1);
    expect(noteNumber('nope')).toBeNull();
  });
});

describe('parseSfz', () => {
  it('resolves global, master, group and region inheritance', () => {
    const r = parseSfz(`
      <global> ampeg_release=0.5 volume=-3
      <master> pan=10
      <group> lovel=1 hivel=60 volume=-6
      <region> sample=a.wav lokey=10 hikey=20 pitch_keycenter=15
      <region> sample=b.wav key=30 volume=-1
      <group> lovel=61 hivel=127
      <region> sample=c.wav lokey=10 hikey=20 pitch_keycenter=15`);
    expect(r.regions.map((x) => x.sample)).toEqual(['a.wav', 'b.wav', 'c.wav']);
    const [a, b, c] = r.regions;
    expect(a).toMatchObject({ lokey: 10, hikey: 20, pitchKeycenter: 15, lovel: 1, hivel: 60, volume: -6, pan: 10 });
    expect(a!.ampeg.release).toBe(0.5);
    expect(b).toMatchObject({ lokey: 30, hikey: 30, pitchKeycenter: 30, volume: -1 });
    expect(c).toMatchObject({ lovel: 61, hivel: 127, volume: -3 });
  });

  it('a new global or master resets the levels below it', () => {
    const r = parseSfz(`<global> volume=-2 <master> pan=5 <group> tune=7 <region> sample=a.wav <master> <region> sample=b.wav <global> <region> sample=c.wav`);
    expect(r.regions[0]).toMatchObject({ volume: -2, pan: 5, tune: 7 });
    expect(r.regions[1]).toMatchObject({ volume: -2, pan: 0, tune: 0 });
    expect(r.regions[2]).toMatchObject({ volume: 0 });
  });

  it('applies default_path and keeps spaces inside sample names', () => {
    const r = parseSfz(`<control> default_path=Samples/ <region> sample=Piano C3.flac lokey=1 hikey=2`);
    expect(r.regions[0]!.sample).toBe('Samples/Piano C3.flac');
    expect(r.regions[0]!.hikey).toBe(2);
  });

  it('expands #define variables, also glued to text and redefined later', () => {
    const r = parseSfz(`#define $EXT flac
      #define $VEL v1
      <region> sample=A0$VEL.$EXT key=21
      #define $VEL v2
      <region> sample=A0$VEL.$EXT key=21`);
    expect(r.regions.map((x) => x.sample)).toEqual(['A0v1.flac', 'A0v2.flac']);
  });

  it('includes files through the injected reader, also in the middle of a line', () => {
    const files: Record<string, string> = {
      'Data/vel.txt': '#define $VEL v9\n#define $N 5',
      'Data/reg.txt': '<region> sample=C$VEL.flac key=$N',
    };
    const read = (p: string) => {
      if (!(p in files)) throw new Error('missing ' + p);
      return files[p]!;
    };
    const r = parseSfz(`<group> #include "Data/vel.txt" lovel=3 hivel=9 #include "Data/reg.txt"`, { readFile: read });
    expect(r.regions).toHaveLength(1);
    expect(r.regions[0]).toMatchObject({ sample: 'Cv9.flac', lokey: 5, lovel: 3, hivel: 9 });
  });

  it('fails on an include without a reader', () => {
    expect(() => parseSfz('#include "x.sfz"')).toThrow(/x\.sfz/);
  });

  it('ignores line and block comments', () => {
    const r = parseSfz(`// header\n<region> /* hidden sample=no.wav */ sample=yes.wav // sample=no2.wav\n key=40`);
    expect(r.regions.map((x) => x.sample)).toEqual(['yes.wav']);
    expect(r.regions[0]!.lokey).toBe(40);
  });

  it('reads tune, transpose, loops, offsets and envelopes', () => {
    const r = parseSfz(`<region> sample=a.wav tune=-5 transpose=1 loop_mode=loop_continuous loop_start=100 loop_end=900 offset=7 end=5000
      ampeg_attack=0.01 ampeg_hold=1 ampeg_decay=2 ampeg_sustain=50 ampeg_release=0.3 amp_veltrack=40 pitch_keytrack=0 rt_decay=2.5 trigger=release group=3 off_by=4`);
    const x = r.regions[0]!;
    expect(x.tune).toBe(95);
    expect(x).toMatchObject({ loopMode: 'loop_continuous', loopStart: 100, loopEnd: 900, offset: 7, end: 5000, ampVeltrack: 0.4, pitchKeytrack: 0, rtDecay: 2.5, trigger: 'release', group: 3, offBy: 4 });
    expect(x.ampeg).toEqual({ attack: 0.01, hold: 1, decay: 2, sustain: 0.5, release: 0.3 });
  });

  it('defaults: full velocity range, centre 60, veltrack 100 %, sustain 100 %, attack trigger', () => {
    const x = parseSfz('<region> sample=a.wav').regions[0]!;
    expect(x).toMatchObject({ lokey: 0, hikey: 127, lovel: 0, hivel: 127, pitchKeycenter: 60, ampVeltrack: 1, pitchKeytrack: 100, trigger: 'attack', loopMode: 'no_loop' });
    expect(x.ampeg).toEqual({ attack: 0, hold: 0, decay: 0, sustain: 1, release: 0 });
  });

  it('maps lowpass filters', () => {
    const x = parseSfz('<region> sample=a.wav fil_type=lpf_2p cutoff=2500').regions[0]!;
    expect(x.filter).toEqual({ cutoff: 2500 });
  });

  it('applies CC modulation at the default controller values', () => {
    const r = parseSfz(`<control> set_hdcc72=0.5 set_hdcc99=0.73 set_cc7=127
      <global> ampeg_release_oncc72=2 amp_veltrack=100 amp_veltrack_oncc99=-100 amp_veltrack_curvecc99=2
      <region> sample=a.wav ampeg_release=1
      <region> sample=b.wav`);
    expect(r.regions[0]!.ampeg.release).toBeCloseTo(2);
    expect(r.regions[1]!.ampeg.release).toBeCloseTo(1);
    expect(r.regions[0]!.ampVeltrack).toBeCloseTo(0.73);
  });

  it('modulation by an unset controller adds nothing', () => {
    const r = parseSfz('<region> sample=a.wav ampeg_hold=10 ampeg_holdcc133=-9');
    expect(r.regions[0]!.ampeg.hold).toBe(10);
    expect(r.unsupported).toEqual({});
  });

  it('drops regions outside the default controller conditions or without a note range', () => {
    const r = parseSfz(`<control> set_hdcc20=0.5 set_hdcc22=0
      <region> sample=on.wav key=40 locc20=1
      <region> sample=off.wav key=41 locc22=1
      <region> sample=pedal.wav lokey=-1 hikey=-1`);
    expect(r.regions.map((x) => x.sample)).toEqual(['on.wav']);
    expect(r.skipped.map((s) => s.reason).sort()).toEqual(['controller condition', 'no note range']);
  });

  it('keeps only the default keyswitch regions', () => {
    const r = parseSfz(`<global> sw_lokey=c0 sw_hikey=c#0 sw_default=c0
      <master> sw_last=c0 <region> sample=nat.wav key=40
      <master> sw_last=c#0 <region> sample=ret.wav key=40`);
    expect(r.regions.map((x) => x.sample)).toEqual(['nat.wav']);
  });

  it('lists unsupported opcodes with their counts and merges controller numbers', () => {
    const r = parseSfz(`<global> amplitude_oncc7=100 pan_oncc10=100 note_polyphony=1 off_time=0.5 region_label=x
      <region> sample=a.wav key=1 lfo01_freq=2 <region> sample=b.wav key=2 amplitude_oncc9=5`);
    expect(r.unsupported).toEqual({ 'amplitude_oncc#': 3, 'pan_oncc#': 2, note_polyphony: 2, off_time: 2, lfo01_freq: 1 });
  });

  it('skips regions without a plain sample file', () => {
    const r = parseSfz('<region> sample=*sine key=1 <region> key=2');
    expect(r.regions).toHaveLength(0);
    expect(r.skipped).toEqual([{ reason: 'no sample file', count: 2 }]);
  });
});

const upright = join(homedir(), 'Music/sfz/UprightPianoKW-SFZ+FLAC-20220221/UprightPianoKW-20220221.sfz');
describe.skipIf(!existsSync(upright))('real Upright Piano KW .sfz', () => {
  it('parses all 66 regions with two velocity layers and loops', () => {
    const r = parseSfz(readFileSync(upright, 'utf8'));
    expect(r.regions.length).toBe(66);
    const layers = new Set(r.regions.map((x) => `${x.lovel}-${x.hivel}`));
    expect([...layers].sort()).toEqual(['0-80', '81-127']);
    const first = r.regions[0]!;
    expect(first).toMatchObject({ lokey: 21, hikey: 22, pitchKeycenter: 21, loopMode: 'loop_continuous', loopStart: 244730, loopEnd: 333808, sample: 'samples/A0vL.flac' });
    expect(first.ampeg.release).toBe(0.6);
    expect(r.regions.some((x) => x.loopMode === 'no_loop')).toBe(true);
    expect(Object.keys(r.unsupported)).toEqual(['width']);
  });
});
