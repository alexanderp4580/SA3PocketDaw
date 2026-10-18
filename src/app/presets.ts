import { BUILTIN_PRESETS, presetIdOfPack, packIdOf } from '../audio/preset/catalog';
import type { Manifest, PackState, PackStatus } from '../store/modelManager';
import { addTrack, newId, setTrackPreset, type Project } from '../store/projectModel';

export interface PresetCard {
  id: string;
  name: string;
  /** Ships in the app; always installed. */
  builtin: boolean;
  status: PackStatus;
  /** Download size; 0 for bundled presets. */
  bytes: number;
  presentFiles: number;
  totalFiles: number;
  credits: string[];
  license: string;
}

/** Bundled presets first, then every `inst-` pack of the manifest with its stored state. */
export function presetCards(manifest: Manifest | null, states: Record<string, PackState>): PresetCard[] {
  const cards: PresetCard[] = BUILTIN_PRESETS.map((p) => ({ id: p.id, name: p.name, builtin: true, status: 'installed', bytes: 0, presentFiles: 0, totalFiles: 0, credits: p.credits, license: p.license }));
  for (const pack of manifest?.packs ?? []) {
    const id = presetIdOfPack(pack.id);
    if (!id || cards.some((c) => c.id === id)) continue;
    const st = states[pack.id];
    cards.push({ id, name: pack.label, builtin: false, status: st?.status ?? 'missing', bytes: pack.totalBytes, presentFiles: st?.presentFiles ?? 0, totalFiles: st?.totalFiles ?? pack.files.length, credits: pack.credits ?? [], license: pack.license ?? '' });
  }
  return cards;
}

export type PresetAvailability = 'installed' | 'not-installed' | 'unknown';

/** Whether a track's preset can sound; `unknown` while the manifest has not told about a downloadable preset. */
export function presetAvailability(id: string, cards: PresetCard[]): PresetAvailability {
  const c = cards.find((x) => x.id === id);
  return !c ? 'unknown' : c.status === 'installed' ? 'installed' : 'not-installed';
}

/** The label a track shows for its preset. */
export function presetLabel(id: string, cards: PresetCard[]): string {
  const c = cards.find((x) => x.id === id);
  return !c || c.status === 'installed' ? (c?.name ?? id) : 'Preset not installed';
}

/** Gives an existing track the preset, or appends a new track that has it. */
export function applyPreset(p: Project, trackId: string | null, card: Pick<PresetCard, 'id' | 'name'>, makeId: () => string = () => newId('t')): { project: Project; trackId: string } {
  if (trackId !== null) return { project: setTrackPreset(p, trackId, card.id), trackId };
  const id = makeId();
  return { project: setTrackPreset(addTrack(p, `${card.name} ${p.tracks.length + 1}`, id), id, card.id), trackId: id };
}

export { packIdOf };
