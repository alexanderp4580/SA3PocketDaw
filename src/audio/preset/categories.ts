import type { Preset } from '../sfz/format';

/** Musical families used by the instrument browser; unknown packs remain visible. */
export const PRESET_CATEGORIES = [
  { id: 'leads', label: 'Leads' },
  { id: 'pads', label: 'Pads' },
  { id: 'bass', label: 'Bass' },
  { id: 'plucks', label: 'Plucks' },
  { id: 'mallets', label: 'Bells & mallets' },
  { id: 'keys', label: 'Keys' },
  { id: 'strings', label: 'Strings' },
  { id: 'winds', label: 'Winds & brass' },
  { id: 'textures', label: 'Textures & effects' },
  { id: 'drums', label: 'Drum kits' },
  { id: 'other', label: 'Other' },
] as const;
export type PresetCategory = typeof PRESET_CATEGORIES[number]['id'];
const LEGACY_KEYS = new Set(['mini-piano', 'grand', 'upright', 'ep-cp80', 'ep-pianet', 'ep-wurlitzer']);
export function categoryOf(value?: string, id?: string): PresetCategory {
  return PRESET_CATEGORIES.find(c => c.id === value)?.id ?? (id && LEGACY_KEYS.has(id) ? 'keys' : 'other');
}
export interface PreviewNote { midi: number; offset: number; duration: number }
/** Short musical auditions in the register and articulation of each family. */
export function previewNotes(category: PresetCategory): PreviewNote[] {
  if (category === 'drums') return [36, 42, 38, 42, 36, 46, 38, 49].map((midi, i) => ({ midi, offset: i * .22, duration: .15 }));
  if (category === 'bass') return [36, 36, 43, 39].map((midi, i) => ({ midi, offset: i * .4, duration: .32 }));
  if (category === 'pads' || category === 'textures') return [60, 64, 67].map((midi, i) => ({ midi, offset: i * .1, duration: 3.5 }));
  if (category === 'mallets') return [72, 76, 79, 84].map((midi, i) => ({ midi, offset: i * .25, duration: 1.4 }));
  return [60, 64, 67, 72].map((midi, i) => ({ midi, offset: i * .16, duration: 1.4 }));
}

/** Keep auditions inside the recorded range, including sparse or velocity-limited maps. */
export function presetPreview(preset: Pick<Preset, 'id' | 'category' | 'regions'>): PreviewNote[] {
  const keys = Array.from({ length: 128 }, (_, midi) => midi).filter(midi => preset.regions.some(r => r.trigger !== 'release' && midi >= r.lokey && midi <= r.hikey && r.lovel <= 100 && r.hivel >= 100));
  if (!keys.length) return [];
  return previewNotes(categoryOf(preset.category, preset.id)).map(n => ({
    ...n,
    midi: keys.reduce((best, midi) => Math.abs(midi - n.midi) < Math.abs(best - n.midi) ? midi : best),
  }));
}
