/** Preset ids and where their files live. */
export const PACK_PREFIX = 'inst-';

export interface BuiltinPreset { id: string; name: string; credits: string[]; license: string }
/** Presets that ship in the app bundle under `instruments/<id>/` (same name, credits and licence as their `preset.json`). */
export const BUILTIN_PRESETS: readonly BuiltinPreset[] = [
  {
    id: 'mini-piano',
    name: 'Mini piano',
    credits: [
      'Mini piano from Upright Piano KW, recorded by Gonzalo and Roberto (FreePats), released under CC0 1.0.',
      'Changes: resampled to 44.1 kHz, shortened, lossy-encoded as AAC, fewer velocity layers.',
    ],
    license: 'CC0 1.0',
  },
];

export const isBuiltinPreset = (id: string): boolean => BUILTIN_PRESETS.some((p) => p.id === id);
export const packIdOf = (presetId: string): string => PACK_PREFIX + presetId;
/** The preset id of an `inst-` pack id; null for any other pack. */
export const presetIdOfPack = (packId: string): string | null => (packId.startsWith(PACK_PREFIX) && packId.length > PACK_PREFIX.length ? packId.slice(PACK_PREFIX.length) : null);

/** Decoded-sample memory the preset players may hold: smaller on devices that report little RAM (`navigator.deviceMemory`, GB). */
export function decodedBudgetBytes(deviceMemoryGb?: number): number {
  const mb = deviceMemoryGb === undefined ? 96 : deviceMemoryGb <= 2 ? 48 : deviceMemoryGb <= 4 ? 64 : 96;
  return mb * 1024 * 1024;
}
