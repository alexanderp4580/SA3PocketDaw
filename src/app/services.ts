import { createEngine } from '../audio/engine';
import { generationClient } from '../gen/client';
import { buildReport, log } from '../log';
import { createProjectStore } from '../store/projectStore';
import { modelManager } from '../store/modelManager';

/** App-wide singletons, created once. */
export const projectStore = createProjectStore();
export const engine = createEngine();
export const generation = generationClient();
export const models = modelManager();
projectStore.registerClear(models.addClearHook);

export { buildReport, log };
