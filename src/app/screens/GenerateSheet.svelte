<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { ui, notify, setPeaks } from '../appState.svelte';
  import { engine, generation, models, projectStore } from '../services';
  import { MODEL_LABELS, buildPrompt, randomSeed } from '../../gen/prompt';
  import { MODEL_IDS, type GenerateParams, type ModelId } from '../../gen/protocol';
  import { MAX_STEPS } from '../../gen/protocol';
  import { INSTRUMENTS,CHARACTERS,ATTACKS,BEHAVIORS,instrumentDefaults,instrumentDescription,instrumentPrompt,type InstrumentId } from '../../gen/instrumentSelections';
  import { generationPresets,generationHint,lengthHint,loadModeSettings,saveModeSettings,type GenerationMode } from '../../gen/mode';
  import type { GenerationOutput } from '../../gen/client';
  import { MAX_SECONDS, MIN_SECONDS, clampSeconds, parseSeconds, stepSeconds } from '../../gen/length';
  import { midiToName } from '../../audio/pitch';
  import { formatBytes, formatElapsed, modelCards, modelHint, peaksOf, type ModelCard } from '../format';
  import { prepareGeneration, useGeneration, tweakDraft, type GeneratedDraft } from '../generate';
  import { copyReport } from '../report';
  import Sheet from '../Sheet.svelte';
  import InstrumentControlsPanel from '../InstrumentControlsPanel.svelte';
  import {resolveControls,type InstrumentControls} from '../../audio/instrument/controls';
  import Waveform from '../Waveform.svelte';

  let { trackId, onclose, onuse }: { trackId: string|null; onclose: () => void;onuse?:(id:string)=>void } = $props();

  type Phase = 'form' | 'running' | 'done' | 'error';
  let phase = $state<Phase>('form');
  let prompt = $state('');
  let model = $state<ModelId>('small-music');
  let mode=$state<GenerationMode>('sample');
  let instrument=$state(instrumentDefaults('synth'));
  const finalInstrumentPrompt=$derived(instrumentPrompt(instrument,model));
  const store = typeof localStorage === 'undefined' ? null : localStorage;
  let seconds = $state(loadModeSettings(store,'sample').seconds);
  let secondsText = $state(String(loadModeSettings(store,'sample').seconds));
  const LONG_SECONDS = 5;
  let steps = $state(loadModeSettings(store,'sample').steps);
  let rejectedOutput=$state<GenerationOutput|null>(null);
  let rejectedParams:GenerateParams|null=null;
  let rejectedPrompt='';
  let seed = $state(randomSeed());
  let cards = $state<ModelCard[]>(modelCards(null, {}));
  let stage = $state('');
  let fraction = $state(0);
  let message = $state('');
  let startedAt = $state(0);
  let elapsed = $state(0);
  let errorText = $state('');
  let result = $state.raw<GeneratedDraft | null>(null);
  let saving=$state(false);
  let controller: AbortController | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;

  const track = $derived(ui.project?.tracks.find((t) => t.id === trackId) ?? null);
  const selected = $derived(cards.find((c) => c.id === model)!);
  const usable = $derived(selected.available && selected.status === 'installed');
  const canGenerate = $derived(usable && (mode==='instrument'||prompt.trim().length>0));
  const draftControls=$derived(resolveControls(result?.instrumentControls,result?.record.instrument?.dynamics??'sustain'));
  const peaks = $derived(result ? peaksOf(result.pcm, 96) : undefined);

  async function refreshCards() {
    try {
      cards = modelCards(models.getManifest(), await models.packStates());
      const first = cards.find((c) => c.available && c.status === 'installed');
      if (first && !cards.find((c) => c.id === model && c.status === 'installed')) model = first.id;
    } catch {
      cards = modelCards(models.getManifest(), {});
    }
  }
  onMount(() => void refreshCards());
  onDestroy(() => {clearInterval(timer);engine.stopPreview();});

  function pickModel(id: ModelId) {
    model = id;
    setSeconds(seconds);
  }

  function setSeconds(v: number) {
    seconds = clampSeconds(v, model);
    secondsText = String(seconds);
    saveModeSettings(store,mode,{seconds,steps});
  }
  function pickMode(next:GenerationMode){saveModeSettings(store,mode,{seconds,steps});mode=next;const saved=loadModeSettings(store,next);steps=saved.steps;setSeconds(saved.seconds);}
  function pickInstrument(id:InstrumentId){instrument=instrumentDefaults(id);}
  function commitSecondsText() {
    const v = parseSeconds(secondsText);
    setSeconds(v === null ? seconds : v);
  }

  async function run() {
    if (!canGenerate || (trackId!==null&&!track)) return;
    commitSecondsText();
    saveModeSettings(store,mode,{seconds,steps});
    const raw=mode==='instrument'?instrumentDescription(instrument):prompt.trim();
    const dynamics=instrument.behavior;
    const params: GenerateParams = { mode,model, prompt: mode==='instrument'?finalInstrumentPrompt:buildPrompt(raw,model,mode), seconds, steps, seed };
    rejectedOutput=null;rejectedParams=null;
    engine.stopPreview();result=null;
    phase = 'running';
    stage = 'Starting';
    fraction = 0;
    message = '';
    startedAt = performance.now();
    elapsed = 0;
    clearInterval(timer);
    timer = setInterval(() => (elapsed = performance.now() - startedAt), 100);
    controller = new AbortController();
    try {
      await engine.unlock();
      const out = await generation.generate(params, {
        signal: controller.signal,
        onProgress: (p) => {
          stage = p.stage;
          fraction = p.fraction;
          message = p.message;
        },
      });
      try{result = await prepareGeneration(params,raw,out,{signal:controller.signal,dynamics,onAnalysis:f=>{stage='Creating instrument';fraction=f;message='Measuring the note and extracting its evolving tone.';} });}catch(e){if(mode==='instrument'&&!controller.signal.aborted){rejectedOutput=out;rejectedParams=params;rejectedPrompt=raw;}throw e;}
      phase = 'done';
    } catch (e) {
      const err = e as { code?: string; message?: string };
      if (err.code === 'cancelled') {
        phase = 'form';
        notify('Generation cancelled');
      } else {
        errorText = err.message ?? String(e);
        phase = 'error';
      }
    } finally {
      clearInterval(timer);
      elapsed = performance.now() - startedAt;
      controller = null;
    }
  }

  function regenerate() {
    seed = randomSeed();
    void run();
  }
  async function useAsSample(){if(!rejectedOutput||!rejectedParams)return;try{result=await prepareGeneration({...rejectedParams,mode:'sample'},rejectedPrompt,rejectedOutput);rejectedOutput=null;phase='done';}catch(e){errorText=String(e);}}
  function shift(d:number){if(result)result={...result,rootMidi:Math.max(0,Math.min(127,result.rootMidi+d))};}
  function tweak(patch:Partial<InstrumentControls>){if(!result||saving)return;result=tweakDraft(result,patch);engine.setPreviewControls(draftControls);}
  function resetTweaks(){if(result?.record.instrument)tweak(resolveControls(undefined,result.record.instrument.dynamics));}
  async function preview(){if(!result)return;try{if(result.record.instrument)await engine.previewInstrument(result.record.instrument,57,result.instrumentControls);else await engine.previewSource(result.pcm,result.sampleRate);}catch(e){notify(String(e));}}
  async function use(){if(!result||saving)return;saving=true;try{engine.stopPreview();const used=await useGeneration({store:projectStore,engine},trackId,result);setPeaks(used.sampleId,used.pcm);onclose();onuse?.(used.trackId);}catch(e){notify(String(e));}finally{saving=false;}}
  async function copy() {
    notify((await copyReport()) ? 'Report copied' : 'Copy failed');
  }
</script>

<Sheet title="✦ Generate" sub={track ? `For ${track.name}` : 'New track · created when you choose Use'} tall onclose={onclose} closable={phase !== 'running'&&!saving}>
  {#if phase === 'form' || phase === 'error'}
    {#if phase === 'error'}
      <div class="card bad" role="alert">
        <div class="row"><b class="bad">Generation failed</b></div>
        <div class="note">{errorText}</div>
        <div class="btnrow"><button class="btn" onclick={copy}>Copy report</button></div>
        {#if rejectedOutput}<div class="note">Your previous sound is still on the track.</div><div class="btnrow"><button class="btn" onclick={useAsSample}>Preview as sample</button></div>{/if}
      </div>
    {/if}
    <div class="st">Sound type</div>
    <div class="seg"><button class="sg" class:sa3on={mode==='sample'} aria-pressed={mode==='sample'} onclick={()=>pickMode('sample')}>Sample</button><button class="sg" class:sa3on={mode==='instrument'} aria-pressed={mode==='instrument'} onclick={()=>pickMode('instrument')}>Instrument</button></div>
    <div class="note">{mode==='sample'?'One-shot sounds such as kicks, snares and effects.':'A tuned, playable instrument made from one SA3 note.'}</div>
    {#if mode==='sample'}
      <div class="st">Prompt</div>
      <input class="field" aria-label="Prompt" placeholder="e.g. deep punchy kick drum" bind:value={prompt} />
      <div class="chips" style="margin-top:6px">
        {#each generationPresets('sample') as q (q.id)}
          <button class="chip" class:on={prompt===q.prompt} onclick={()=>{prompt=q.prompt;setSeconds(q.seconds);}}>{q.label}</button>
        {/each}
      </div>
      <div class="note" style="margin-top:6px">{generationHint('sample')}</div>
    {:else}
      <div class="note" style="margin-top:8px">Choose the source sound SA3 will create. After generation, tweak playback and preview it before choosing Use.</div>
      <fieldset class="choices"><legend>Source instrument</legend><div class="options">
        {#each INSTRUMENTS as q (q.id)}<label class:on={instrument.instrument===q.id}><input type="radio" name="source-instrument" value={q.id} checked={instrument.instrument===q.id} onchange={()=>pickInstrument(q.id)} />{q.label}</label>{/each}
      </div></fieldset>
      <fieldset class="choices"><legend>Character</legend><div class="options">
        {#each CHARACTERS as q (q.id)}<label class:on={instrument.character===q.id}><input type="radio" name="source-character" value={q.id} bind:group={instrument.character} />{q.label}</label>{/each}
      </div></fieldset>
      <fieldset class="choices"><legend>Source attack</legend><div class="options">
        {#each ATTACKS as q (q.id)}<label class:on={instrument.attack===q.id}><input type="radio" name="source-attack" value={q.id} bind:group={instrument.attack} />{q.label}</label>{/each}
      </div></fieldset>
      <fieldset class="choices"><legend>Source note behavior</legend><div class="options">
        {#each BEHAVIORS as q (q.id)}<label class:on={instrument.behavior===q.id}><input type="radio" name="source-behavior" value={q.id} bind:group={instrument.behavior} />{q.label}</label>{/each}
      </div></fieldset>
      <div class="note">Natural decay suits piano, guitar and bells. Hold tone suits synths and pads. The selected behavior also sets the instrument's initial playback behavior.</div>
    {/if}

    <div class="st">Model</div>
    <div class="seg">
      {#each MODEL_IDS as id (id)}
        <button class="sg" class:sa3on={model === id} aria-pressed={model === id} onclick={() => pickModel(id)}>{MODEL_LABELS[id]}</button>
      {/each}
    </div>
    <div class="modelline">
      {#each [selected] as c (c.id)}
        <span>{c.available ? (c.status === 'installed' ? 'installed' : c.status === 'partial' ? 'partly downloaded' : 'not installed') : 'not available'}{c.available ? ` · ${formatBytes(c.bytes)}` : ''}</span>
      {/each}
      {#if modelHint(selected)}<span class="warn">{selected.available ? modelHint(selected) : 'not available in this build'}</span>{/if}
    </div>
    {#if model === 'medium'}
      <div class="note warn" style="margin-top:6px">Medium may be slow or fail on phones.</div>
    {/if}
    {#if mode==='instrument'&&model==='small-sfx'}<div class="note warn">Small Music or Medium is better suited to single instrument notes.</div>{/if}

    <div class="st">Length</div>
    <div class="stepper">
      <button class="btn fit" aria-label="Shorter by 0.25 seconds" disabled={seconds <= MIN_SECONDS} onclick={() => setSeconds(stepSeconds(seconds, -1, model))}>−</button>
      <span class="secfield">
        <input class="field" aria-label="Length in seconds" type="text" inputmode="decimal" bind:value={secondsText} onblur={commitSecondsText} onkeydown={(e) => e.key === 'Enter' && commitSecondsText()} />
        <em>s</em>
      </span>
      <button class="btn fit" aria-label="Longer by 0.25 seconds" disabled={seconds >= MAX_SECONDS[model]} onclick={() => setSeconds(stepSeconds(seconds, 1, model))}>+</button>
    </div>
    <div class="note">{MIN_SECONDS} to {MAX_SECONDS[model]} s in 0.25 s steps; type any value such as 1.25. {MAX_SECONDS[model]} s is the longest tested here (the model conditioner itself accepts up to 384 s).</div>
    <div class="note">{lengthHint(mode)}</div>
    {#if seconds > LONG_SECONDS}
      <div class="note warn" role="note">Long clips take much longer and use more memory on phones. User-reported on a Pixel: Small 2 s about 180 s, 10 s about 400 s.</div>
    {/if}

    <div class="st">Steps</div>
    <div class="stepper">
      <button class="btn fit" aria-label="Fewer steps" disabled={steps <= 4} onclick={() => (steps = Math.max(4, steps - 1))}>−</button>
      <b>{steps}</b>
      <button class="btn fit" aria-label="More steps" disabled={steps >= Math.min(16, MAX_STEPS)} onclick={() => (steps = Math.min(16, steps + 1))}>+</button>
    </div>

    <div class="st">Seed</div>
    <div class="row">
      <input class="field grow" aria-label="Seed" type="number" inputmode="numeric" bind:value={seed} />
      <button class="btn fit" onclick={() => (seed = randomSeed())}>Randomize</button>
    </div>

    {#if mode==='instrument'}<details class="prompt-preview"><summary>Generated prompt</summary><p class="note">{finalInstrumentPrompt}</p></details>{/if}
    <div class="btnrow"><button class="btn sa3" disabled={!canGenerate} onclick={run}>✦ Generate</button></div>
  {:else if phase === 'running'}
    <div class="card">
      <div class="row"><b class="grow">{stage}</b><span class="note">{formatElapsed(elapsed)}</span></div>
      <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(fraction * 100)}><i style="width:{Math.round(fraction * 100)}%"></i></div>
      <div class="note">{message}</div>
      {#if model === 'medium'}<div class="note warn">Medium may be slow or fail on phones.</div>{/if}
      <div class="btnrow"><button class="btn danger" onclick={() => controller?.abort()}>Cancel</button></div>
      <div class="note" style="margin-top:8px">A model call that is already running finishes its current step before generation stops.</div>
    </div>
  {:else if result}
    <div class="card">
      <div class="resultwave"><Waveform {peaks} /></div>
      <div class="row" style="margin-top:10px">
        {#if result.mode==='instrument'}<span class="st grow" style="margin:0">Instrument ready</span><b class="rootname">Automatically tuned</b>{:else}
        <span class="st grow" style="margin:0">Detected root</span>
        <button class="btn fit rootbtn" aria-label="Root down one semitone" onclick={() => shift(-1)}>−1</button>
        <b class="rootname">{midiToName(result.rootMidi)}</b>
        <button class="btn fit rootbtn" aria-label="Root up one semitone" onclick={() => shift(1)}>+1</button>
        {/if}
      </div>
      {#if result.lowConfidence}
        <div class="note warn" style="margin-top:6px">Low confidence. Defaulted to C4. Adjust the root with the buttons.</div>
      {/if}
      <div class="note" style="margin-top:6px">Generated in {formatElapsed(elapsed)}.</div>
      {#if result.record.instrument}<div class="st">Tweak instrument</div><div class="note">Press Preview to hear your settings. Use sound keeps them on the track.</div><InstrumentControlsPanel controls={draftControls} onchange={tweak} behaviorName="draft-behavior" disabled={saving} /><div class="btnrow"><button class="btn" disabled={saving} onclick={resetTweaks}>Reset controls</button></div>{/if}
      {#if result.mode==='instrument'}<div class="btnrow"><button class="btn" onclick={()=>result&&void engine.previewSource(result.pcm,result.sampleRate)}>Play source note</button></div>{/if}
      <p class="note">Preview this sound. Choose Use to replace the sound on this track.</p>
      <div class="btnrow"><button class="btn" disabled={saving} onclick={regenerate}>Regenerate</button><button class="btn" disabled={saving} onclick={onclose}>Discard</button></div>
    </div>
    <div class="draft-accept"><button class="btn" disabled={saving} onclick={preview}>▶ Preview {result.mode==='instrument'?'A3':''}</button><button class="btn pri" disabled={saving} onclick={use}>{saving?'Saving…':'Use sound'}</button></div>
  {/if}
</Sheet>

<style>
  .draft-accept{display:flex;gap:8px;position:sticky;bottom:0;padding:10px 0 0;background:var(--panel);z-index:1;}.draft-accept .btn{min-width:0;flex:1;}.draft-accept .btn.pri{flex:1.3;}
  .choices {border:0;margin:14px 0 0;padding:0;min-width:0;}
  .choices legend {font-size:12px;font-weight:700;color:var(--dim);margin-bottom:6px;}
  .options {display:flex;flex-wrap:wrap;gap:6px;}
  .options label {display:flex;align-items:center;gap:6px;min-height:44px;padding:8px 12px;border-radius:10px;background:var(--panel2);border:1px solid transparent;font-size:13px;cursor:pointer;}
  .options label.on {background:var(--sa3bg);color:var(--sa3);border-color:var(--sa3);}
  .options input {accent-color:var(--sa3);margin:0;}
  .options label:focus-within {outline:2px solid var(--sa3);outline-offset:2px;}
  .prompt-preview {margin-top:14px;}
  .prompt-preview summary {cursor:pointer;min-height:44px;display:list-item;align-content:center;}
  .prompt-preview p {overflow-wrap:anywhere;}
  .stepper { display: flex; align-items: center; gap: 10px; }
  .stepper b { flex: 1; text-align: center; font-size: 20px; }
  .stepper .btn { width: 56px; }
  .secfield { flex: 1; position: relative; }
  .secfield .field { text-align: center; font-size: 20px; font-weight: 700; padding-right: 28px; }
  .secfield em { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); font-style: normal; color: var(--dim); }
  .resultwave { height: 72px; background: #0e1014; border-radius: 8px; padding: 4px; }
  .rootname { min-width: 3.2rem; text-align: center; font-size: 22px; color: var(--sa3); }
  .rootbtn { width: 56px; }
</style>
