import { packIdOf } from '../audio/preset/catalog';
import type { DownloadProgress } from '../store/modelManager';
import { notify, refreshModelCards } from './appState.svelte';
import { models } from './services';

/** The one instrument download in flight, shared by the Models screen, the picker and the track bar. */
export const presetDownload = $state({ id: null as string | null, progress: null as DownloadProgress | null, error: '' });
let controller: AbortController | null = null;

export const presetDownloadPercent = (): number => (presetDownload.progress && presetDownload.progress.packTotal > 0 ? Math.round((presetDownload.progress.packBytes / presetDownload.progress.packTotal) * 100) : 0);

export async function downloadPreset(id: string, label: string): Promise<boolean> {
  if (controller) return false;
  controller = new AbortController();
  presetDownload.id = id;
  presetDownload.progress = null;
  presetDownload.error = '';
  try {
    if (!models.getManifest()) await refreshModelCards();
    await models.download(packIdOf(id), { signal: controller.signal, onProgress: (p) => { presetDownload.progress = p; } });
    notify(`${label} installed`);
    presetDownload.id = null;
    return true;
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      presetDownload.id = null;
      notify('Download cancelled. Tap Download to resume.');
    } else presetDownload.error = e instanceof Error ? e.message : String(e);
    return false;
  } finally {
    controller = null;
    void refreshModelCards();
  }
}

export function cancelPresetDownload() {
  controller?.abort();
}

export function dismissPresetDownloadError() {
  if (!controller) {
    presetDownload.id = null;
    presetDownload.error = '';
  }
}
