import type { BufferLike } from '../sampler';
import type { Preset } from '../sfz/format';
import { createSampleCache } from './cache';
import type { PresetHost } from './host';
import { cacheKey, createPresetPlayer, type PresetPlayer } from './player';
import type { PresetContext } from './voice';

export interface DecodedAudio extends BufferLike { length: number; numberOfChannels: number }

export interface PresetLibraryOptions {
  host: PresetHost;
  decode: (data: ArrayBuffer) => Promise<DecodedAudio>;
  /** Decoded float32 bytes all players may hold together. */
  budgetBytes: number;
}

/** Loads presets, decodes their files lazily into one budgeted cache and builds players over it. */
export function createPresetLibrary(o: PresetLibraryOptions) {
  const cache = createSampleCache<BufferLike>({
    budgetBytes: o.budgetBytes,
    load: async (key) => {
      const slash = key.indexOf('/');
      return o.decode(await o.host.read(key.slice(0, slash), key.slice(slash + 1)));
    },
    bytesOf: (b) => ((b as Partial<DecodedAudio>).length ?? 0) * ((b as Partial<DecodedAudio>).numberOfChannels ?? 1) * 4,
  });
  const retained = new Map<string, Set<string>>();
  const syncRetain = () => cache.retain(new Set([...retained.values()].flatMap((s) => [...s])));

  return {
    preset: (id: string) => o.host.load(id),
    player(ctx: PresetContext, output: unknown, preset: Preset, ownerId: string): PresetPlayer {
      return createPresetPlayer({
        ctx, output, preset, cache,
        onRetain: (keys) => {
          if (keys.size) retained.set(ownerId, keys); else retained.delete(ownerId);
          syncRetain();
        },
      });
    },
    /** Forgets the cached files of a preset (it was deleted or reinstalled). */
    invalidate(presetId?: string) {
      o.host.invalidate(presetId);
      cache.clear();
    },
    cacheBytes: () => cache.bytes(),
    cacheKey,
  };
}
export type PresetLibrary = ReturnType<typeof createPresetLibrary>;
