import { runCompat, type CompatResult } from '../compat';
import { createProject, type Project } from '../store/projectModel';
import { peaksOf } from './format';
import { engine, log, models, projectStore } from './services';

const scope = log.scope('app');

export const WAVE_BINS = 64;

export const ui = $state({
  toast: '',
  loopOpen:false,
  project: null as Project | null,
  peaks: {} as Record<string, Float32Array>,
  playing: false,
  step: 0,
  ready: false,
  compat: null as CompatResult | null,
  compatRunning: true,
  skipCompat: false,
  manifestError: null as string | null,
});

let raf = 0;

function tick() {
  ui.step = engine.playhead();
  raf = ui.playing ? requestAnimationFrame(tick) : 0;
}

export async function play() {
  try {await engine.play();} catch(e){notify(e instanceof Error?e.message:String(e));scope.error('playback failed',{error:String(e)});return;}
  ui.playing = engine.isPlaying;
  if (ui.playing && !raf) raf = requestAnimationFrame(tick);
}

export function pause(){engine.pause();ui.playing=false;ui.step=engine.playhead();if(raf)cancelAnimationFrame(raf);raf=0;}

export function stop() {
  engine.stop();
  ui.playing = false;
  ui.step = engine.playhead();
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
}

export function updateProject(fn: (p: Project) => Project) {
  projectStore.update(fn);
}

export async function cachePeaks(project: Project) {
  for (const t of project.tracks) {
    if (!t.sampleId || ui.peaks[t.sampleId]) continue;
    const s = await projectStore.getSample(t.sampleId);
    if (!s) continue;
    ui.peaks[t.sampleId] = peaksOf(s.pcm, WAVE_BINS);
    if(s.instrument)engine.setInstrument(t.sampleId,s.instrument);else engine.setSample(t.sampleId, s.pcm, s.sampleRate);
  }
}

export function setPeaks(sampleId: string, pcm: Float32Array) {
  ui.peaks[sampleId] = peaksOf(pcm, WAVE_BINS);
}

export function defaultProject(): Project {
  return createProject({ name: 'My song' });
}

/** Loads the saved project (or a default one), starts mirroring it into the engine and loads the model manifest. */
export async function initApp() {
  projectStore.subscribe((p) => {
    if (p === null) {
      if (ui.ready) projectStore.set(defaultProject());
      return;
    }
    ui.project = p;
    engine.setProject(p);
    void cachePeaks(p);
  });
  const saved = await projectStore.load();
  if (!saved) projectStore.set(defaultProject());
  ui.ready = true;
  try {
    await models.loadManifest();
  } catch (e) {
    ui.manifestError = e instanceof Error ? e.message : String(e);
    scope.warn('manifest unavailable', ui.manifestError);
  }
  window.addEventListener('pagehide', () => void projectStore.flush());
}

export async function runCompatCheck() {
  ui.compatRunning = true;
  try {
    ui.compat = (await runCompat()).result;
  } finally {
    ui.compatRunning = false;
  }
}

/** Wipes models, project and samples, then starts again with a default project. */
export async function clearEverything() {
  stop();
  await models.clearAllAppData();
  ui.peaks = {};
  void models.loadManifest().catch(() => {});
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function notify(message: string) {
  ui.toast = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (ui.toast = ''), 2500);
}
