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

const scope = log.scope('audio.engine');

export interface EngineBufferLike extends BufferLike {
  copyToChannel?(src: Float32Array, channel: number): void;
  getChannelData?(channel: number): Float32Array;
}

export interface EngineContextLike extends AudioContextLike {
  readonly state?: string;
  resume?(): Promise<void>;
  createBuffer(channels: number, length: number, sampleRate: number): EngineBufferLike;
  createGain(): GainLike;
}

export interface EngineOptions {
  createContext?: () => EngineContextLike;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (h: unknown) => void;
  masterGain?: number;
  createMixer?:(ctx:AudioContext,master:GainNode)=>MixerController;
}

export function createEngine(options: EngineOptions = {}) {
  const makeContext =
    options.createContext ??
    (() => new (globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)() as unknown as EngineContextLike);
  let ctx: EngineContextLike | null = null;
  let master: GainLike | null = null;
  let project: Project | null = null;
  let mixer:MixerController|null=null;
  const buffers = new Map<string, EngineBufferLike>();
  const pending = new Map<string, { pcm: Float32Array; sampleRate: number }>();
  const instruments=new Map<string,InstrumentProfile>();
  const players=new Map<string,Promise<InstrumentPlayer>>();
  const voices:Array<{endTime:number;stop:(at?:number,fade?:number)=>void;trackId?:string}>=[];
  let epoch=0;
  let previewEpoch=0;
  let previewPlayer:Promise<InstrumentPlayer>|null=null;
  let previewProfile:InstrumentProfile|null=null;
  let previewVoice:{stop:()=>void}|null=null;
  const audible=(p:Project,t:Project['tracks'][number])=>!t.muted&&(!p.tracks.some(x=>x.solo)||t.solo);
  function silence(){epoch++;mixer?.clear();mixer?.listen(null);for(const v of voices)v.stop(ctx?.currentTime,.005);voices.length=0;for(const p of players.values())void p.then(v=>v.stop(true)).catch(()=>{});}
  function stopPreview(){previewEpoch++;previewVoice?.stop();previewVoice=null;const p=previewPlayer;previewPlayer=null;previewProfile=null;if(p)void p.then(v=>v.dispose()).catch(()=>{});}

  const playerSources=new Map<string,string>();
  const outputFor=(id:string)=>mixer?.input(id)??master;
  function playerFor(trackId:string):Promise<InstrumentPlayer>{let player=players.get(trackId);if(!player){const track=project!.tracks.find(t=>t.id===trackId)!;playerSources.set(trackId,track.sampleId!);player=createInstrumentPlayer(ctx as unknown as AudioContext,outputFor(trackId) as unknown as AudioNode,instruments.get(track.sampleId!)!).then(p=>{p.setControls(project?.tracks.find(t=>t.id===trackId)?.instrumentControls);return p;});players.set(trackId,player);player.catch(()=>players.delete(trackId));}return player;}


  function toBuffer(c: EngineContextLike, pcm: Float32Array, sampleRate: number): EngineBufferLike {
    const b = c.createBuffer(1, Math.max(1, pcm.length), sampleRate);
    if (b.copyToChannel) b.copyToChannel(pcm, 0);
    else b.getChannelData?.(0).set(pcm);
    return b;
  }

  function bufferFor(sampleId: string | null): EngineBufferLike | null {
    if (!sampleId) return null;
    const hit = buffers.get(sampleId);
    if (hit) return hit;
    const p = pending.get(sampleId);
    if (p && ctx) {
      const b = toBuffer(ctx, p.pcm, p.sampleRate);
      buffers.set(sampleId, b);
      pending.delete(sampleId);
      return b;
    }
    return null;
  }

  function onNote(e: NoteEvent) {
    if (!ctx || !project) return;
    const track = project.tracks.find((t) => t.id === e.trackId);
    if(track?.sampleId&&instruments.has(track.sampleId)){const token=epoch;void playerFor(track.id).then(p=>{if(token===epoch&&project&&project.tracks.some(t=>t.id===e.trackId&&audible(project!,t)))return p.note(e.midi,e.when,e.duration,e.velocity);}).catch(err=>scope.error('instrument playback failed',{error:String(err)}));return;}
    const buffer = bufferFor(track?.sampleId ?? null);
    if (!track || !buffer) return;
    for(let i=voices.length-1;i>=0;i--)if(voices[i]!.endTime<ctx.currentTime)voices.splice(i,1);
    voices.push({...playNote(ctx, { buffer, root: track.rootMidi, note: e.midi, when: e.when, duration: e.duration, velocity: e.velocity, output: outputFor(track.id) }),trackId:track.id});
  }

  const scheduler = createScheduler({
    now: () => ctx?.currentTime ?? 0,
    setTimer: options.setTimer ?? ((fn, ms) => globalThis.setTimeout(fn, ms)),
    clearTimer: options.clearTimer ?? ((h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>)),
    onNote,
  });

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
    setProject(p: Project) {
      if(project){const old=loopRange(project),next=loopRange(p);if(old.startBar!==next.startBar||old.endBar!==next.endBar)silence();else {
       for(const v of voices)if(v.trackId&&!p.tracks.some(t=>t.id===v.trackId&&audible(p,t)))v.stop();
       for(const [id,player] of players)if(!p.tracks.some(t=>t.id===id&&audible(p,t)))void player.then(v=>v.stop()).catch(()=>{});
      }}
      const keep=new Set(p.tracks.map(t=>t.sampleId));for(const [id,player] of players)if(!p.tracks.some(t=>t.id===id&&t.sampleId===playerSources.get(id))){void player.then(v=>v.dispose()).catch(()=>{});players.delete(id);}for(const id of instruments.keys())if(!keep.has(id))instruments.delete(id);
      project = p;
      mixer?.sync(p);
      for(const [id,player] of players){const t=p.tracks.find(t=>t.id===id);if(t)void player.then(v=>v.setControls(t.instrumentControls)).catch(e=>scope.error('instrument controls failed',{error:String(e)}));}
      scheduler.setBpm(p.bpm);
      scheduler.setPattern(p);
    },
    setSample(sampleId: string, pcm: Float32Array, sampleRate: number) {
      instruments.delete(sampleId);
      buffers.delete(sampleId);
      pending.set(sampleId, { pcm, sampleRate });
      scope.debug('sample set', { sampleId, samples: pcm.length, sampleRate });
    },
    hasSample(sampleId: string) {
      return buffers.has(sampleId) || pending.has(sampleId) || instruments.has(sampleId);
    },
    setInstrument(sampleId:string,profile:InstrumentProfile){buffers.delete(sampleId);pending.delete(sampleId);instruments.set(sampleId,profile);scope.info('instrument set',{sampleId,hz:profile.hz,dynamics:profile.dynamics});},
    stopPreview,
    async previewSource(pcm:Float32Array,sampleRate:number){stopPreview();const token=previewEpoch;await unlock();if(ctx&&token===previewEpoch){previewVoice=playNote(ctx,{buffer:toBuffer(ctx,pcm,sampleRate),root:60,note:60,when:ctx.currentTime,duration:pcm.length/sampleRate,velocity:1,output:master});}},
    setPreviewControls(controls:Partial<InstrumentControls>){const pending=previewPlayer;if(pending)void pending.then(p=>{if(pending===previewPlayer)p.setControls(controls);}).catch(err=>scope.error('preview controls failed',{error:String(err)}));},
    async previewInstrument(profile:InstrumentProfile,midi=57,controls?:Partial<InstrumentControls>){const token=previewEpoch;await unlock();if(token!==previewEpoch)return;if(previewProfile!==profile){stopPreview();previewProfile=profile;previewPlayer=createInstrumentPlayer(ctx as unknown as AudioContext,master as unknown as AudioNode,profile);}const pending=previewPlayer!,p=await pending;if(pending!==previewPlayer)return;const settings=resolveControls(controls,profile.dynamics);p.setControls(settings);await p.note(midi,ctx!.currentTime,Math.max(1.2,settings.attack+1),velocityGain(96));},
    async play() {
      await unlock();
      const token=epoch;await Promise.all((project?.tracks??[]).filter(t=>t.sampleId&&instruments.has(t.sampleId)).map(async t=>{const p=await playerFor(t.id);await Promise.all([...new Set(t.notes.map(n=>n.midi))].map(m=>p.prepare(m)));}));if(token!==epoch)return;
      scheduler.play();
    },
    pause(){silence();stopPreview();scheduler.pause();},
    stop() {
      silence();stopPreview();
      scheduler.stop();
    },
    async audition(trackId: string, midi: number, velocity?: number,duration=.6) {
      await unlock();
      const track = project?.tracks.find((t) => t.id === trackId);
      if(ctx&&track?.sampleId&&instruments.has(track.sampleId)){const token=epoch,p=await playerFor(track.id);if(token===epoch)await p.note(midi,ctx.currentTime,duration,velocityGain(velocity));return;}
      const buffer = bufferFor(track?.sampleId ?? null);
      if (!ctx || !track || !buffer) {
        scope.warn('audition without sample', { trackId });
        return;
      }
      voices.push({...auditionNote(ctx, { buffer, root: track.rootMidi, note: midi, velocity: velocityGain(velocity), output: outputFor(track.id) }),trackId:track.id});
    },
    meter:(id?:string)=>mixer?.meter(id)??emptyMeter(),
    spectrum:(id:string,pluginId:string,post=true)=>mixer?.spectrum(id,pluginId,post)??null,
    listenRange:(id:string|null,pluginId?:string,band?:EqBand)=>mixer?.listen(id,pluginId,band),
    mixerError:(id:string)=>mixer?.error(id)??null,
    retryMixer:(id:string)=>mixer?.retry(id),
    sampleRate:()=>mixer?.sampleRate??44100,
    get isPlaying() {
      return scheduler.isPlaying;
    },
    playhead(): number {
      return scheduler.position();
    },
  };
}

export type Engine = ReturnType<typeof createEngine>;
