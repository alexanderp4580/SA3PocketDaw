import { describe, expect, it } from 'vitest';
import type { Manifest } from '../store/modelManager';
import { addTrack, createProject } from '../store/projectModel';
import { applyPreset, presetAvailability, presetCards, presetLabel } from './presets';

const manifest: Manifest = {
  version: 1,
  packs: [
    { id: 'encoder', label: 'Text encoder', requires: [], files: [], totalBytes: 5 },
    { id: 'inst-grand', label: 'Grand piano', requires: [], files: [{ path: 'inst-grand/preset.json', bytes: 3 }, { path: 'inst-grand/s.m4a', bytes: 7 }], totalBytes: 10, credits: ['Alexander Holm'], license: 'CC BY 3.0' },
    { id: 'inst-upright', label: 'Upright piano', requires: [], files: [{ path: 'inst-upright/preset.json', bytes: 3 }], totalBytes: 3 },
  ],
};

describe('presetCards', () => {
  it('lists the bundled preset, then the instrument packs with their state', () => {
    const cards = presetCards(manifest, { 'inst-grand': { status: 'installed', presentFiles: 2, totalFiles: 2 }, 'inst-upright': { status: 'partial', presentFiles: 1, totalFiles: 2 } });
    expect(cards.map((c) => [c.id, c.builtin, c.status])).toEqual([['mini-piano', true, 'installed'], ['grand', false, 'installed'], ['upright', false, 'partial']]);
    expect(cards[1]).toMatchObject({ name: 'Grand piano', bytes: 10, credits: ['Alexander Holm'], license: 'CC BY 3.0' });
    expect(cards[0]!.credits.length).toBeGreaterThan(0);
  });
  it('without a manifest only the bundled preset is listed; unknown pack state means missing', () => {
    expect(presetCards(null, {}).map((c) => c.id)).toEqual(['mini-piano']);
    expect(presetCards(manifest, {}).find((c) => c.id === 'grand')!.status).toBe('missing');
  });
});

describe('track preset labels', () => {
  const cards = presetCards(manifest, { 'inst-grand': { status: 'installed', presentFiles: 2, totalFiles: 2 } });
  it('names installed presets, flags missing ones and tolerates unknown ids', () => {
    expect(presetLabel('grand', cards)).toBe('Grand piano');
    expect(presetLabel('upright', cards)).toBe('Preset not installed');
    expect(presetLabel('mini-piano', cards)).toBe('Mini piano');
    expect(presetLabel('gone', cards)).toBe('gone');
    expect([presetAvailability('grand', cards), presetAvailability('upright', cards), presetAvailability('gone', cards)]).toEqual(['installed', 'not-installed', 'unknown']);
  });
});

describe('applyPreset', () => {
  it('sets the preset on an existing track', () => {
    const p = addTrack(createProject(), 'A', 't1');
    const r = applyPreset(p, 't1', { id: 'grand', name: 'Grand piano' });
    expect(r.trackId).toBe('t1');
    expect(r.project.tracks[0]).toMatchObject({ soundType: 'preset', presetId: 'grand' });
  });
  it('appends a new named track with the preset', () => {
    const p = addTrack(createProject(), 'A', 't1');
    const r = applyPreset(p, null, { id: 'grand', name: 'Grand piano' }, () => 't9');
    expect(r.trackId).toBe('t9');
    expect(r.project.tracks.map((t) => t.id)).toEqual(['t1', 't9']);
    expect(r.project.tracks[1]).toMatchObject({ name: 'Grand piano 2', soundType: 'preset', presetId: 'grand', notes: [] });
  });
});

describe('instrument categories', () => {
  it('preserves known categories, groups legacy pianos, and keeps unknown categories discoverable', () => {
    const m = { version: 1, packs: [
      ...manifest.packs,
      { id: 'inst-pad', label: 'Choir', requires: [], files: [], totalBytes: 10, category: 'pads' },
      { id: 'inst-custom', label: 'Custom', requires: [], files: [], totalBytes: 10, category: 'future' },
    ] };
    const cards = presetCards(m, {});
    expect(cards.find(c => c.id === 'mini-piano')?.category).toBe('keys');
    expect(cards.find(c => c.id === 'grand')?.category).toBe('keys');
    expect(cards.find(c => c.id === 'pad')?.category).toBe('pads');
    expect(cards.find(c => c.id === 'custom')?.category).toBe('other');
  });
});
