import { createEngine } from '../audio/engine';
import { decodedBudgetBytes } from '../audio/preset/catalog';
import { createPresetHost } from '../audio/preset/host';
import { appBaseUrl } from '../store/modelsBase';
import { generationClient } from '../gen/client';
import { buildReport, log, reporter } from '../log';
import { transcriberClient } from '../transcribe/client';
import { createProjectStore } from '../store/projectStore';
import { registerKeyClear } from '../store/apiKey';
import { modelManager } from '../store/modelManager';

/** App-wide singletons, created once. */
export const projectStore = createProjectStore();
export const models = modelManager();
export const transcriber = transcriberClient();
reporter.setProvider('pianoTranscriber', () => ({ lastRun: transcriber.lastRun(), lastError: transcriber.lastError() }));
/** Bundled presets come from the app, downloaded ones from Cache Storage. */
export const presetHost = createPresetHost({ appBase: appBaseUrl(), openPackFile: (path) => models.openFile(path, true) });
export const engine = createEngine({ presets: presetHost, presetBudgetBytes: decodedBudgetBytes((globalThis.navigator as { deviceMemory?: number } | undefined)?.deviceMemory) });
reporter.setProvider('playback', () => engine.diagnostics());
export const generation = generationClient();
models.onChange(() => {
  presetHost.invalidate();
  engine.refreshPresets();
});

projectStore.registerClear(models.addClearHook);
registerKeyClear(models.addClearHook, typeof localStorage === 'undefined' ? null : localStorage);

export { buildReport, log };
