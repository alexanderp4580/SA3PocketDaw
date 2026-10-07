import { mount } from 'svelte';
import App from './App.svelte';
import { buildReport, engine, generation, log, models, projectStore } from './app/services';
import { ui, setPeaks } from './app/appState.svelte';
import { applyGeneration } from './app/generate';
import { buildPrompt } from './gen/prompt';
import type { GenerateParams } from './gen/protocol';
import { installHaptics } from './app/haptics';
import { registerServiceWorker } from './registerSw';
import './styles/theme.css';
import './app/app.css';

log.captureGlobalErrors();
log.scope('app').info('starting');

/** Read-only convenience handle for smoke tests and console inspection. */
Object.defineProperty(window, '__sa3', {
  value: Object.freeze({
    engine,
    projectStore,
    modelManager: models,
    generationClient: generation,
    log,
    buildReport,
    compat: () => ui.compat,
    /** Programmatic generation and acceptance; the Generate sheet previews a draft before Use. */
    async generateAndApply(trackId: string, userPrompt: string, params: Omit<GenerateParams, 'prompt'>) {
      const full: GenerateParams = { ...params, prompt: buildPrompt(userPrompt, params.model,params.mode) };
      const out = await generation.generate(full);
      const res = await applyGeneration({ store: projectStore, engine }, trackId, full, userPrompt, out);
      setPeaks(res.sampleId, res.pcm);
      return { sampleId: res.sampleId, rootMidi: res.rootMidi, lowConfidence: res.lowConfidence, samples: res.pcm.length, sampleRate: res.sampleRate, pcm: res.pcm, timings: out.timings, stats: out.stats };
    },
  }),
  enumerable: false,
});

export default mount(App, { target: document.getElementById('app')! });
const stopHaptics=installHaptics();
if(import.meta.hot)import.meta.hot.dispose(stopHaptics);

void registerServiceWorker({ secure: window.isSecureContext, prod: import.meta.env.PROD, sw: 'serviceWorker' in navigator ? navigator.serviceWorker : undefined });
