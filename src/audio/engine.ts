import { presetPreview } from './preset/categories';
import {compileSong} from '../song/events';
import {createSongPlayback} from '../song/playback';
import {samplePreviewDuration,type SampleControls} from './sampleControls';
import {createMixer,type MixerController} from './mixer/controller';
import {emptyMeter} from './mixer/meter';
import type {EqBand} from './mixer/model';
import { log } from '../log';
import { velocityGain,loopRange, type Project } from '../store/projectModel';
import { audition as auditionNote, playNote, type AudioContextLike, type BufferLike, type GainLike } from './sampler';
import { createScheduler, type NoteEvent } from './scheduler';
import { createInstrumentPlayer,type InstrumentPlayer } from './instrument/player';
import {resolveControls,type InstrumentControls} from './instrument/controls';
import type { InstrumentProfile } from './instrument/types';
import {applyTrim,trimKey} from './trim';
import {loopHoldSeconds,trimmedLoop,type LoopRegion} from './loopPoints';
import {createPresetLibrary,type DecodedAudio} from './preset/library';
import type {PresetHost} from './preset/host';
import {decodedBudgetBytes} from './preset/catalog';
import type {PresetPlayer} from './preset/player';
import type {PresetContext} from './preset/voice';

const scope = log.scope('audio.engine');
/** A note delivered later than this after its time (main-thread stall) is dropped rather than bunched with the next ones. */
export const STALE_NOTE_SEC = 0.25;
/** A late note keeps its original end; one with less than this left is skipped. */
export const MIN_LATE_NOTE_SEC = 0.03;

export interface EngineBufferLike extends BufferLike {
  copyToChannel?(src: Float32Array, channel: number): void;
  getChannelData?(channel: number): Float32Array;
}

export interface EngineContextLike extends AudioContextLike {
  readonly state?: string;
  resume?(): Promise<void>;
  createBuffer(channels: number, length: number, sampleRate: number): EngineBufferLike;
  createGain(): GainLike;
  decodeAudioData?(data: ArrayBuffer): Promise<DecodedAudio>;
}

export interface EngineOptions {
  createContext?: () => EngineContextLike;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (h: unknown) => void;
  masterGain?: number;
  createMixer?:(ctx:AudioContext,master:GainNode)=>MixerController;
  /** Where sampled-instrument presets are read from; without it preset tracks are silent. */
  presets?: PresetHost;
  /** Decoded-sample memory the presets may hold. */
  presetBudgetBytes?: number;
}

export function createEngine(options: EngineOptions = {}) {
  const makeContext =
    options.createContext ??
    (() => new (globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)() as unknown as EngineContextLike);
  let ctx: EngineContextLike | null = null;
  let master: GainLike | null = null;
  let project: Project | null = null;
  let mixer:MixerController|null=null;
  const sources = new Map<string, { pcm: Float32Array; sampleRate: number; loop?: LoopRegion }>();
  const trimmed = new Map<string, { key: string; buffer: EngineBufferLike }>();
  const instruments=new Map<string,InstrumentProfile>();
  const players=new Map<string,Promise<InstrumentPlayer>>();
  const library=options.presets?createPresetLibrary({host:options.presets,decode:d=>{if(!ctx?.decodeAudioData)throw new Error('This browser cannot decode preset samples');return ctx.decodeAudioData(d);},budgetBytes:options.presetBudgetBytes??decodedBudgetBytes()}):null;
  /** One player per preset track; a preset that is not installed resolves to null and is looked up again on the next note. */
  const presetPlayers=new Map<string,{presetId:string;player:Promise<PresetPlayer|null>}>();
  const missingPresets=new Set<string>();
  let previewPresetPlayer:PresetPlayer|null=null;
  const voices:Array<{endTime:number;stop:(at?:number,fade?:number)=>void;trackId?:string}>=[];
  let playbackMode:'pattern'|'song'='pattern';
  let songKey='';
  let songRepeat=false;
  let epoch=0;
  let previewEpoch=0;
  let previewPlayer:Promise<InstrumentPlayer>|null=null;
  let previewProfile:InstrumentProfile|null=null;
  let previewVoice:{stop:()=>void}|null=null;
  const audible=(p:Project,t:Project['tracks'][number])=>!t.muted&&(!p.tracks.some(x=>x.solo)||t.solo);
  function silence(){flushStale();epoch++;mixer?.clear();mixer?.listen(null);for(const v of voices)v.stop(ctx?.currentTime,.005);voices.length=0;for(const p of players.values())void p.then(v=>v.stop(true)).catch(()=>{});for(const e of presetPlayers.values())void e.player.then(v=>v?.stop(true)).catch(()=>{});}
  function stopPreview(){previewPresetPlayer?.dispose();previewPresetPlayer=null;previewEpoch++;previewVoice?.stop();previewVoice=null;const p=previewPlayer;previewPlayer=null;previewProfile=null;if(p)void p.then(v=>v.dispose()).catch(()=>{});}

  const playerSources=new Map<string,string>();
  const pitchesOf=(t:Project['tracks'][number])=>new Set(t.notes.map(n=>n.midi));
  /** Players keep every pitch their track plays installed; with `prefetch`, missing pitches are prepared in the background. */
  function syncPlayerPitches(prefetch:boolean){
   if(!project)return;
   for(const [id,player] of players){const t=project.tracks.find(x=>x.id===id);if(!t)continue;const set=pitchesOf(t);void player.then(p=>{p.retain(set);if(prefetch)void p.prefetch(set);}).catch(()=>{});}
  }
  const outputFor=(id:string)=>mixer?.input(id)??master;
  const isPreset=(t:Project['tracks'][number]|undefined):t is Project['tracks'][number]&{presetId:string}=>!!t&&t.soundType==='preset'&&!!t.presetId;
  const presetNotes=(t:Project['tracks'][number])=>t.notes.map(n=>({midi:n.midi,velocity:velocityGain(n.velocity)}));
  function presetPlayerFor(track:Project['tracks'][number]&{presetId:string}):Promise<PresetPlayer|null>{
   let e=presetPlayers.get(track.id);
   if(e&&e.presetId!==track.presetId){void e.player.then(p=>p?.dispose()).catch(()=>{});presetPlayers.delete(track.id);e=undefined;}
   if(!e){
    const id=track.presetId,trackId=track.id;
    const player=(async()=>{
     if(!library||!ctx)return null;
     const preset=await library.preset(id);
     if(!preset){if(!missingPresets.has(id)){missingPresets.add(id);scope.warn('preset is not installed',{presetId:id});}return null;}
     missingPresets.delete(id);
     const p=library.player(ctx as unknown as PresetContext,outputFor(trackId),preset,trackId);
     if(project)p.retain(presetNotes(project.tracks.find(t=>t.id===trackId)??track));
     return p;
    })();
    e={presetId:id,player};presetPlayers.set(trackId,e);
    void player.then(p=>{if(!p&&presetPlayers.get(trackId)?.player===player)presetPlayers.delete(trackId);},()=>{if(presetPlayers.get(trackId)?.player===player)presetPlayers.delete(trackId);});
   }
   return e.player;
  }
  function playerFor(trackId:string):Promise<InstrumentPlayer>{let player=players.get(trackId);if(!player){const track=project!.tracks.find(t=>t.id===trackId)!;playerSources.set(trackId,track.sampleId!);player=createInstrumentPlayer(ctx as unknown as AudioContext,outputFor(trackId) as unknown as AudioNode,instruments.get(track.sampleId!)!).then(p=>{p.setControls(project?.tracks.find(t=>t.id===trackId)?.instrumentControls);return p;});players.set(trackId,player);player.catch(()=>players.delete(trackId));}return player;}


  function toBuffer(c: EngineContextLike, pcm: Float32Array, sampleRate: number): EngineBufferLike {
    const b = c.createBuffer(1, Math.max(1, pcm.length), sampleRate);
    if (b.copyToChannel) b.copyToChannel(pcm, 0);
    else b.getChannelData?.(0).set(pcm);
    return b;
  }

  /** The track's buffer: the source cut to the track's trim, rebuilt only when the cut changes. */
  function bufferFor(track: Project['tracks'][number] | undefined): EngineBufferLike | null {
    const sampleId = track?.sampleId;
    const source = sampleId ? sources.get(sampleId) : undefined;
    if (!track || !sampleId || !source || !ctx) return null;
    const key = trimKey(track.trim, source.pcm.length / source.sampleRate);
    const hit = trimmed.get(sampleId);
    if (hit && hit.key === key) return hit.buffer;
    const buffer = toBuffer(ctx, applyTrim(source.pcm, source.sampleRate, track.trim), source.sampleRate);
    trimmed.set(sampleId, { key, buffer });
    return buffer;
  }

  /** The track's loop in the coordinates of its chopped buffer; null for a one-shot sample or when the chop reaches into the loop. */
  function loopFor(track: Project['tracks'][number] | undefined): LoopRegion | null {
    const source = track?.sampleId ? sources.get(track.sampleId) : undefined;
    return source ? trimmedLoop(source.loop, track!.trim, source.pcm.length, source.sampleRate) : null;
  }

  /** Stale-note skips are summed per second of audio time into one warning. */
  let stale: { second: number; count: number; maxLateBy: number } | null = null;
  function flushStale() {
    if (!stale) return;
    scope.warn('skipped stale notes', { count: stale.count, maxLateBy: stale.maxLateBy });
    stale = null;
  }

  function onNote(e: NoteEvent) {
    if (!ctx || !project) return;
    const second = Math.floor(ctx.currentTime);
    if (stale && stale.second !== second) flushStale();
    const lateBy = Math.max(0, ctx.currentTime - e.when);
    if (lateBy > STALE_NOTE_SEC || e.duration - lateBy < MIN_LATE_NOTE_SEC) {
      if (stale) { stale.count++; stale.maxLateBy = Math.max(stale.maxLateBy, lateBy); } else stale = { second, count: 1, maxLateBy: lateBy };
      return;
    }
    if (lateBy > 0) e = { ...e, duration: e.duration - lateBy };
    const track = project.tracks.find((t) => t.id === e.trackId);
    if(track?.sampleId&&instruments.has(track.sampleId)){const token=epoch;void playerFor(track.id).then(p=>{if(token===epoch&&project&&project.tracks.some(t=>t.id===e.trackId&&audible(project!,t)))return p.note(e.midi,e.when,e.duration,e.velocity);}).catch(err=>scope.error('instrument playback failed',{error:String(err)}));return;}
    if(isPreset(track)){const token=epoch;void presetPlayerFor(track).then(p=>{if(p&&token===epoch&&project&&project.tracks.some(t=>t.id===e.trackId&&audible(project!,t)))return p.note(e.midi,e.when,e.duration,e.velocity);}).catch(err=>scope.error('preset playback failed',{error:String(err)}));return;}
    const buffer = bufferFor(track);
    if (!track || !buffer) return;
    for(let i=voices.length-1;i>=0;i--)if(voices[i]!.endTime<ctx.currentTime)voices.splice(i,1);
    voices.push({...playNote(ctx, { buffer, root: track.rootMidi, note: e.midi, when: e.when, duration: e.duration, velocity: e.velocity, output: outputFor(track.id),controls:track.sampleControls,loop:loopFor(track) }),trackId:track.id});
  }

  const scheduler = createScheduler({
    now: () => ctx?.currentTime ?? 0,
    setTimer: options.setTimer ?? ((fn, ms) => globalThis.setTimeout(fn, ms)),
    clearTimer: options.clearTimer ?? ((h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>)),
    onNote,
  });

  const songPlayback=createSongPlayback({
    now:()=>ctx?.currentTime??0,
    setTimer:options.setTimer??((fn,ms)=>globalThis.setTimeout(fn,ms)),
    clearTimer:options.clearTimer??(h=>globalThis.clearTimeout(h as ReturnType<typeof setTimeout>)),
    onNote,
  });
  const transport=()=>playbackMode==='song'?songPlayback:scheduler;

  async function unlock(): Promise<void> {
    if (!ctx) {
      ctx = makeContext();
      master = ctx.createGain();
      master.gain.value = options.masterGain ?? 0.8;
      master.connect(ctx.destination);
      if(options.createMixer||(ctx as unknown as AudioContext).audioWorklet){mixer=(options.createMixer??createMixer)(ctx as unknown as AudioContext,master as unknown as GainNode);if(project)mixer.sync(project);}
      scope.info('context created', { sampleRate: (ctx as { sampleRate?: number }).sampleRate });
    }
    if (ctx.state === 'suspended' && ctx.resume) {
      await ctx.resume();
      scope.info('context resumed');
    }
  }

  return {
    unlock,
    setPlaybackMode(mode:'pattern'|'song'){if(mode===playbackMode)return;silence();stopPreview();scheduler.stop();songPlayback.stop();playbackMode=mode;},
    setSongRepeat(value:boolean){songRepeat=value;songPlayback.setRepeat(value);},
    get songRepeat(){return songRepeat;},
    get playbackMode(){return playbackMode;},
    setProject(p: Project) {
      const key=JSON.stringify([p.bpm,p.bars,p.arrangement,p.tracks.map(t=>[t.id,t.bars,t.notes,t.sampleId,t.muted,t.solo])]);
      if(key!==songKey){if(playbackMode==='song'){silence();stopPreview();}songPlayback.setSong(compileSong(p),p.bpm);songKey=key;}

      if(project){const old=loopRange(project),next=loopRange(p);if(old.startBar!==next.startBar||old.endBar!==next.endBar)silence();else {
       for(const v of voices)if(v.trackId&&!p.tracks.some(t=>t.id===v.trackId&&audible(p,t)))v.stop();
       for(const [id,player] of players)if(!p.tracks.some(t=>t.id===id&&audible(p,t)))void player.then(v=>v.stop()).catch(()=>{});
      }}
      for(const [id,e] of presetPlayers){const t=p.tracks.find(x=>x.id===id);if(!isPreset(t)||t.presetId!==e.presetId){void e.player.then(v=>v?.dispose()).catch(()=>{});presetPlayers.delete(id);}else if(!audible(p,t))void e.player.then(v=>v?.stop()).catch(()=>{});}
      const keep=new Set(p.tracks.map(t=>t.sampleId));for(const [id,player] of players)if(!p.tracks.some(t=>t.id===id&&t.sampleId===playerSources.get(id))){void player.then(v=>v.dispose()).catch(()=>{});players.delete(id);}for(const id of instruments.keys())if(!keep.has(id))instruments.delete(id);
      project = p;
      syncPlayerPitches(transport().isPlaying);
      for(const t of p.tracks)if(isPreset(t)&&presetPlayers.has(t.id))void presetPlayers.get(t.id)!.player.then(v=>v?.retain(presetNotes(t))).catch(()=>{});
      mixer?.sync(p);
      for(const [id,player] of players){const t=p.tracks.find(t=>t.id===id);if(t)void player.then(v=>v.setControls(t.instrumentControls)).catch(e=>scope.error('instrument controls failed',{error:String(e)}));}
      scheduler.setBpm(p.bpm);
      scheduler.setPattern(p);
    },
    setSample(sampleId: string, pcm: Float32Array, sampleRate: number, loop?: LoopRegion) {
      instruments.delete(sampleId);
      trimmed.delete(sampleId);
      sources.set(sampleId, { pcm, sampleRate, ...(loop ? { loop } : {}) });
      scope.debug('sample set', { sampleId, samples: pcm.length, sampleRate, loop });
    },
    hasSample(sampleId: string) {
      return sources.has(sampleId) || instruments.has(sampleId);
    },
    setInstrument(sampleId:string,profile:InstrumentProfile){trimmed.delete(sampleId);sources.delete(sampleId);if(instruments.get(sampleId)!==profile)for(const [id,player] of players)if(playerSources.get(id)===sampleId){void player.then(v=>v.dispose()).catch(()=>{});players.delete(id);}instruments.set(sampleId,profile);scope.info('instrument set',{sampleId,hz:profile.hz,dynamics:profile.dynamics});},
    stopPreview,
    /** Auditions a preset in its musical register; false when unavailable or cancelled. */
    async previewPreset(presetId:string,midis?:number[]){
     stopPreview();const token=previewEpoch;await unlock();
     const preset=library?await library.preset(presetId):null;
     if(!preset||!ctx||!library||token!==previewEpoch)return false;
     const p=library.player(ctx as unknown as PresetContext,master,preset,'preview');previewPresetPlayer=p;
     const notes=midis?midis.map((midi,i)=>({midi,offset:i*.16,duration:1.4})):presetPreview(preset);
     if(!notes.length)return false;
     const needed=notes.map(n=>({midi:n.midi,velocity:velocityGain(100)}));p.retain(needed);await p.prepare(needed);
     if(token!==previewEpoch)return false;
     const t0=ctx.currentTime+.02;await Promise.all(notes.map(n=>p.note(n.midi,t0+n.offset,n.duration,velocityGain(100))));return true;
    },
    /** Makes `presetId` the preset of a track (the project keeps `track.presetId`; this prepares the player) and reports whether it is installed. */
    async setPreset(trackId:string,presetId:string):Promise<boolean>{
     const track=project?.tracks.find(t=>t.id===trackId);if(!track)return false;
     await unlock();const p=await presetPlayerFor({...track,soundType:'preset',presetId});return !!p;
    },
    /** Call after a preset pack was installed or deleted. */
    refreshPresets(){library?.invalidate();missingPresets.clear();for(const e of presetPlayers.values())void e.player.then(v=>v?.dispose()).catch(()=>{});presetPlayers.clear();},
    async previewSource(pcm:Float32Array,sampleRate:number,controls?:Partial<SampleControls>,loop?:LoopRegion|null){stopPreview();const token=previewEpoch;await unlock();if(ctx&&token===previewEpoch){previewVoice=playNote(ctx,{buffer:toBuffer(ctx,pcm,sampleRate),root:60,note:60,when:ctx.currentTime,duration:loop?loopHoldSeconds(loop):controls?samplePreviewDuration(pcm.length/sampleRate,controls):pcm.length/sampleRate,velocity:1,output:master,controls,loop});}},
    setPreviewControls(controls:Partial<InstrumentControls>){const pending=previewPlayer;if(pending)void pending.then(p=>{if(pending===previewPlayer)p.setControls(controls);}).catch(err=>scope.error('preview controls failed',{error:String(err)}));},
    async previewInstrument(profile:InstrumentProfile,midi=57,controls?:Partial<InstrumentControls>){const token=previewEpoch;await unlock();if(token!==previewEpoch)return;if(previewProfile!==profile){stopPreview();previewProfile=profile;previewPlayer=createInstrumentPlayer(ctx as unknown as AudioContext,master as unknown as AudioNode,profile);}const pending=previewPlayer!,p=await pending;if(pending!==previewPlayer)return;const settings=resolveControls(controls,profile.dynamics);p.setControls(settings);await p.note(midi,ctx!.currentTime,Math.max(1.2,settings.attack+1),velocityGain(96));},
    async play() {
      const token=epoch;await unlock();if(token!==epoch)return;
      await Promise.all((project?.tracks??[]).filter(t=>t.sampleId&&instruments.has(t.sampleId)).map(async t=>{const p=await playerFor(t.id),set=pitchesOf(t);p.retain(set);await Promise.all([...set].map(m=>p.prepare(m)));}));await Promise.all((project?.tracks??[]).filter(isPreset).map(async t=>{const p=await presetPlayerFor(t);if(!p)return;const notes=presetNotes(t);p.retain(notes);await p.prepare(notes);}));if(token!==epoch)return;
      transport().play();
    },
    pause(){silence();stopPreview();transport().pause();},
    stop() {
      silence();stopPreview();
      scheduler.stop();songPlayback.stop();
    },
    async audition(trackId: string, midi: number, velocity?: number,duration=.6) {
      await unlock();
      const track = project?.tracks.find((t) => t.id === trackId);
      if(ctx&&track?.sampleId&&instruments.has(track.sampleId)){const token=epoch,p=await playerFor(track.id);if(token===epoch)await p.note(midi,ctx.currentTime,duration,velocityGain(velocity));return;}
      if(ctx&&isPreset(track)){const token=epoch,p=await presetPlayerFor(track);if(p&&token===epoch)await p.note(midi,ctx.currentTime,duration,velocityGain(velocity));return;}
      const buffer = bufferFor(track);
      if (!ctx || !track || !buffer) {
        scope.warn('audition without sample', { trackId });
        return;
      }
      voices.push({...auditionNote(ctx, { buffer, root: track.rootMidi, note: midi, duration,velocity: velocityGain(velocity), output: outputFor(track.id),controls:track.sampleControls,loop:loopFor(track) }),trackId:track.id});
    },
    /** A read-only source snapshot; excludes names, note contents and credentials. */
    diagnostics() {
      return {
        audioState: ctx?.state ?? 'not-created',
        playing: transport().isPlaying,
        mode: playbackMode,
        presetCacheBytes: library?.cacheBytes() ?? 0,
        tracks: (project?.tracks ?? []).map(track => {
          const pitches = track.notes.map(note => note.midi);
          const source = isPreset(track)
            ? missingPresets.has(track.presetId) ? 'preset-missing' : presetPlayers.has(track.id) ? 'preset-player' : 'preset-not-loaded'
            : track.sampleId
              ? instruments.has(track.sampleId) ? 'cached-instrument' : sources.has(track.sampleId) ? 'cached-sample' : 'missing-sample'
              : 'none';
          return {
            id: track.id,
            soundType: track.soundType ?? 'sample',
            sampleId: track.sampleId,
            presetId: track.presetId,
            source,
            muted: !!track.muted,
            solo: !!track.solo,
            noteCount: pitches.length,
            midiMin: pitches.length ? Math.min(...pitches) : null,
            midiMax: pitches.length ? Math.max(...pitches) : null,
            effectError: mixer?.error(track.id) ?? null,
          };
        }),
      };
    },
    meter:(id?:string)=>mixer?.meter(id)??emptyMeter(),
    spectrum:(id:string,pluginId:string,post=true)=>mixer?.spectrum(id,pluginId,post)??null,
    listenRange:(id:string|null,pluginId?:string,band?:EqBand)=>mixer?.listen(id,pluginId,band),
    pluginReduction:(id:string,pluginId:string)=>mixer?.reduction(id,pluginId)??null,
    mixerError:(id:string)=>mixer?.error(id)??null,
    retryMixer:(id:string)=>mixer?.retry(id),
    sampleRate:()=>mixer?.sampleRate??44100,
    get isPlaying() {
      return transport().isPlaying;
    },
    playhead(): number {
      return transport().position();
    },
  };
}

export type Engine = ReturnType<typeof createEngine>;
