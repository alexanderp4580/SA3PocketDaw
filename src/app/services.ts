import { createEngine } from '../audio/engine';
import { generationClient } from '../gen/client';
import { buildReport, log } from '../log';
import { createProjectStore } from '../store/projectStore';
import { registerKeyClear } from '../store/apiKey';
import { modelManager } from '../store/modelManager';

/** App-wide singletons, created once. */
export const projectStore = createProjectStore();
export const engine = createEngine();
export const generation = generationClient();
export const models = modelManager();
projectStore.registerClear(models.addClearHook);
registerKeyClear(models.addClearHook, typeof localStorage === 'undefined' ? null : localStorage);

export { buildReport, log };
