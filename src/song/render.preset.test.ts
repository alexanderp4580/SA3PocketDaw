import { afterEach, describe, expect, it, vi } from 'vitest';
import { addNote, addTrack, createProject, setTrackPreset, type Project } from '../store/projectModel';
import { placeBlock } from './arrangement';
import { normalizePreset } from '../audio/sfz/format';
import type { PresetHost } from '../audio/preset/host';
import { renderSong } from './render';

const RATE = 44100;
interface Played { rate: number; when: number; duration: number; loop?: boolean; until?: number }

/** Minimal OfflineAudioContext that decodes every file to a one-second buffer and records the buffer sources. */
function stubContext(played: Played[]) {
  const param = () => ({ value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} });
  const node = () => ({ connect() {}, disconnect() {}, gain: param(), pan: param(), playbackRate: param(), frequency: param(), Q: param(), channelCount: 2, channelCountMode: '', addEventListener() {} });
  class Ctx {
    length: number; currentTime = 0; destination = {}; audioWorklet = { addModule: async () => {} };
    constructor(_ch: number, length: number) { this.length = length; }
    createGain = node; createStereoPanner = node; createBiquadFilter = node;
    createBuffer(_c: number, length: number) { return { length, copyToChannel() {} }; }
    async decodeAudioData() { return { duration: 1, length: RATE, numberOfChannels: 1 }; }
    createBufferSource() {
      const src: Record<string, unknown> & ReturnType<typeof node> = { ...node(), buffer: null };
      const rec: Played = { rate: 0, when: -1, duration: 0 };
      return Object.assign(src, { start(w?: number) { Object.assign(rec, { rate: (src.playbackRate as { value: number }).value, when: w ?? 0, duration: (src.buffer as { duration: number }).duration, loop: src.loop as boolean | undefined }); played.push(rec); }, stop(t?: number) { rec.until = t; } });
    }
    suspend() { return Promise.resolve(); }
    resume() { return Promise.resolve(); }
    async startRendering() { return { getChannelData: () => new Float32Array(this.length) }; }
  }
  vi.stubGlobal('OfflineAudioContext', Ctx);
}

const preset = normalizePreset({
  version: 1, id: 'grand', name: 'Grand', sampleRate: RATE, credits: [], license: '',
  files: [{ path: 'a.m4a', frames: RATE, channels: 1 }, { path: 'r.m4a', frames: RATE, channels: 1 }],
  regions: [
    { file: 0, lokey: 0, hikey: 127, center: 60, lovel: 1, hivel: 127, veltrack: 0 },
    { file: 1, lokey: 0, hikey: 127, center: 60, lovel: 1, hivel: 127, trigger: 'release', keytrack: 0 },
  ],
});
const host = (installed = true): PresetHost & { reads: string[] } => {
  const reads: string[] = [];
  return { reads, load: async () => (installed ? preset : null), read: async (_id, path) => { reads.push(path); return new ArrayBuffer(4); }, invalidate: () => {} };
};

function songProject(): Project {
  let p = createProject({ bars: 2, bpm: 120 });
  p = addTrack(p, 'a', 'a');
  p = setTrackPreset(p, 'a', 'grand');
  p = addNote(p, 'a', { midi: 72, start: 0, length: 4 });
  return placeBlock(p, 'a', 1);
}

afterEach(() => vi.unstubAllGlobals());

describe('export render of preset tracks', () => {
  it('plays the note regions at the live rate and the release region at the note end', async () => {
    const played: Played[] = [];
    stubContext(played);
    const h = host();
    await renderSong(songProject(), new Map(), { presets: h });
    expect(played).toHaveLength(2);
    const [note, release] = played;
    expect(note!.rate).toBeCloseTo(2);
    expect(note!.when).toBeCloseTo(0.1);
    expect(release!.rate).toBe(1);
    expect(release!.when).toBeCloseTo(0.1 + 0.5);
    expect(h.reads.sort()).toEqual(['a.m4a', 'r.m4a']);
  });

  it('fails clearly when the preset is not installed', async () => {
    const played: Played[] = [];
    stubContext(played);
    await expect(renderSong(songProject(), new Map(), { presets: host(false) })).rejects.toThrow(/preset is not installed/);
    await expect(renderSong(songProject(), new Map())).rejects.toThrow(/preset is not installed/);
  });
});
