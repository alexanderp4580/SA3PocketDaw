import { log } from '../../log';
import { normalizePreset, type Preset } from '../sfz/format';
import { isBuiltinPreset, packIdOf } from './catalog';

const scope = log.scope('audio.preset.host');

/** Where preset files come from. */
export interface PresetHost {
  /** The preset, or null when it is not installed. */
  load(presetId: string): Promise<Preset | null>;
  /** Encoded bytes of one file of an installed preset. */
  read(presetId: string, path: string): Promise<ArrayBuffer>;
  /** Forget what was loaded (after an install or delete). */
  invalidate(presetId?: string): void;
}

export interface PresetHostOptions {
  /** Absolute URL of the app, ending in a slash; bundled presets live under `instruments/`. */
  appBase: string;
  fetch?: typeof fetch;
  /** Opens a downloaded pack file (Cache Storage); rejects when it is not installed. */
  openPackFile: (path: string) => Promise<Response>;
}

export function createPresetHost(o: PresetHostOptions): PresetHost {
  const doFetch: typeof fetch = o.fetch ?? ((...a) => globalThis.fetch(...a));
  const loaded = new Map<string, Promise<Preset | null>>();

  async function open(presetId: string, path: string): Promise<Response> {
    if (isBuiltinPreset(presetId)) {
      const res = await doFetch(`${o.appBase}instruments/${presetId}/${path}`);
      if (!res.ok) throw new Error(`Preset file ${presetId}/${path} failed: HTTP ${res.status}`);
      return res;
    }
    return o.openPackFile(`${packIdOf(presetId)}/${path}`);
  }

  return {
    load(presetId) {
      let p = loaded.get(presetId);
      if (!p) {
        p = open(presetId, 'preset.json').then(
          async (res) => normalizePreset(await res.json()),
          (e) => {
            scope.debug('preset is not available', { presetId, error: String(e) });
            return null;
          },
        ).catch((e) => {
          scope.error('preset file is invalid', { presetId, error: String(e) });
          return null;
        });
        loaded.set(presetId, p);
      }
      return p;
    },
    async read(presetId, path) {
      return (await open(presetId, path)).arrayBuffer();
    },
    invalidate(presetId) {
      if (presetId) loaded.delete(presetId);
      else loaded.clear();
    },
  };
}
