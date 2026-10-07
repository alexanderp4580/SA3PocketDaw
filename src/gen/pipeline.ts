import type { ScopedLogger } from '../log';
import { outputFrames } from './length';
import { float32ToFloat16Bits } from './float16';
import { type AudioStats, type GenerateParams, type ModelId, SAMPLE_RATE, type StageTiming } from './protocol';
import {
  LATENT_CHANNELS,
  buildMediumSchedule,
  buildPingPongSchedule,
  mediumLatentLength,
  pingPongStep,
  randomNormal,
  smallLatentLength,
} from './sampling';
import type { TimingRecorder } from './timing';

export interface TensorSpec {
  type: 'float32' | 'float16' | 'int64' | 'bool';
  data: ArrayBufferView;
  dims: number[];
}
export interface OutTensor {
  data: ArrayLike<number>;
  dims: readonly number[];
}
export interface ModelSession {
  inputNames: readonly string[];
  outputNames: readonly string[];
  run(inputs: Record<string, TensorSpec>): Promise<Record<string, OutTensor>>;
  release(): Promise<void>;
}
export type SessionKind = 'text-encoder' | 'number-conditioner' | 'dit' | 'decoder';
export type Tokenize = (prompt: string) => Promise<{ ids: BigInt64Array; mask: BigInt64Array }>;

/** Everything that needs a browser: GPU check, tokenizer and ONNX sessions. */
export interface Ports {
  probeGpu(): Promise<string>;
  loadTokenizer(model: ModelId): Promise<Tokenize>;
  loadSession(model: ModelId, kind: SessionKind): Promise<ModelSession>;
  /** Drop runtime state that outlives sessions (called by unload). */
  reset?(): Promise<void> | void;
}

export interface PipelineHooks {
  timing: TimingRecorder;
  progress(stage: string, fraction: number, message: string): void;
  isCancelled(): boolean;
}

export interface GenerationResult {
  channels: Float32Array[];
  sampleRate: number;
  stats: AudioStats;
  stages: StageTiming[];
}

export const CANCEL_MESSAGE =
  'Cancelled. A running model call cannot be interrupted, so the stop took effect at the next step or stage boundary.';

export class CancelledError extends Error {
  constructor() {
    super(CANCEL_MESSAGE);
    this.name = 'CancelledError';
  }
}

const TEXT_TOKENS = 256;
const TEXT_DIM = 768;

interface Held {
  model: ModelId;
  tokenize?: Tokenize;
  text?: ModelSession;
  number?: ModelSession;
  dit?: ModelSession;
  decoder?: ModelSession;
}

export function summarizeAudio(data: ArrayLike<number>, dims: readonly number[]): AudioStats {
  let peak = 0;
  let sum = 0;
  let nonFinite = 0;
  for (let i = 0; i < data.length; i += 1) {
    const s = data[i]!;
    if (!Number.isFinite(s)) nonFinite += 1;
    else {
      const a = Math.abs(s);
      if (a > peak) peak = a;
      sum += s * s;
    }
  }
  return { peak, rms: Math.sqrt(sum / Math.max(1, data.length)), nonFinite, dims: [...dims] };
}

export function createPipeline(ports: Ports, log?: ScopedLogger) {
  let held: Held | null = null;
  let gpuChecked = false;

  async function releaseAll(reason: string) {
    if (held) {
      const names = (['text', 'number', 'dit', 'decoder'] as const).filter((k) => held![k]);
      log?.info(`releasing sessions (${reason})`, { model: held.model, sessions: names });
      for (const k of ['text', 'number', 'dit', 'decoder'] as const) {
        const s = held[k];
        if (s) {
          held[k] = undefined;
          await s.release().catch((e) => log?.warn(`release ${k} failed`, String(e)));
        }
      }
      held = null;
    }
  }

  async function release(h: Held, key: 'text' | 'number' | 'dit' | 'decoder') {
    const s = h[key];
    if (!s) return;
    h[key] = undefined;
    await s.release().catch((e) => log?.warn(`release ${key} failed`, String(e)));
    log?.debug(`released ${key}`);
  }

  async function generate(p: GenerateParams, hooks: PipelineHooks): Promise<GenerationResult> {
    const { timing } = hooks;
    const isMedium = p.model === 'medium';
    timing.begin('total');
    try {
      if (held && held.model !== p.model) await releaseAll(`switching ${held.model} to ${p.model}`);
      const h: Held = (held ??= { model: p.model });

      const stage = async <T>(name: string, fraction: number, message: string, fn: () => Promise<T>): Promise<T> => {
        if (hooks.isCancelled()) throw new CancelledError();
        hooks.progress(name, fraction, message);
        return timing.run(name, fn);
      };

      if (!gpuChecked) {
        const info = await stage('gpu-probe', 0.01, 'Checking WebGPU', () => ports.probeGpu());
        log?.info('gpu probe passed', info);
        gpuChecked = true;
      }

      if (!h.text || !h.tokenize || (!isMedium && !h.number)) {
        await stage('load-encoder', 0.03, 'Loading text encoder', async () => {
          h.tokenize ??= await ports.loadTokenizer(p.model);
          h.text ??= await ports.loadSession(p.model, 'text-encoder');
          if (!isMedium) h.number ??= await ports.loadSession(p.model, 'number-conditioner');
        });
      } else log?.debug('encoder sessions resident; reused');

      const tokens = await stage('tokenize', 0.14, 'Tokenizing prompt', () => h.tokenize!(p.prompt));

      let textData!: Float32Array;
      let duration = null as Float32Array | null;
      await stage('encode', 0.18, 'Encoding prompt', async () => {
        const t = h.text!;
        const out = await t.run({
          [t.inputNames[0]!]: { type: 'int64', data: tokens.ids, dims: [1, TEXT_TOKENS] },
          [t.inputNames[1]!]: { type: 'int64', data: tokens.mask, dims: [1, TEXT_TOKENS] },
        });
        textData = Float32Array.from(out[t.outputNames[0]!]!.data);
        if (!isMedium) {
          const n = h.number!;
          const d = await n.run({ seconds: { type: 'float32', data: Float32Array.of(p.seconds), dims: [1] } });
          duration = Float32Array.from(d[n.outputNames[0]!]!.data);
        }
      });
      if (isMedium) {
        await release(h, 'text');
        h.tokenize = undefined;
      }

      if (!h.dit) {
        await stage('load-dit', 0.22, 'Loading diffusion model', async () => {
          h.dit = await ports.loadSession(p.model, 'dit');
        });
      }
      const dit = h.dit!;
      const latentLength = isMedium ? mediumLatentLength(p.seconds) : smallLatentLength(p.seconds);
      const latentDims = [1, LATENT_CHANNELS, latentLength];
      let latent = randomNormal(LATENT_CHANNELS * latentLength, p.seed);
      const times = isMedium ? buildMediumSchedule(p.steps, latentLength) : buildPingPongSchedule(p.steps);

      let cross: Float32Array | null = null;
      if (!isMedium) {
        cross = new Float32Array((TEXT_TOKENS + 1) * TEXT_DIM);
        cross.set(textData.subarray(0, TEXT_TOKENS * TEXT_DIM));
        cross.set(duration!.subarray(0, TEXT_DIM), TEXT_TOKENS * TEXT_DIM);
      }
      const mask = isMedium ? Float32Array.from(tokens.mask, Number) : null;

      for (let step = 0; step < p.steps; step += 1) {
        const current = times[step]!;
        const next = times[step + 1]!;
        const fraction = 0.25 + (step / p.steps) * 0.6;
        await stage(`denoise-step-${step + 1}`, fraction, `Denoising step ${step + 1}/${p.steps}`, async () => {
          const inputs: Record<string, TensorSpec> = isMedium
            ? {
                x: { type: 'float32', data: latent, dims: latentDims },
                t: { type: 'float32', data: Float32Array.of(current), dims: [1] },
                t5_hidden: { type: 'float32', data: textData, dims: [1, TEXT_TOKENS, TEXT_DIM] },
                t5_mask: { type: 'float32', data: mask!, dims: [1, TEXT_TOKENS] },
                seconds_total: { type: 'float32', data: Float32Array.of(p.seconds), dims: [1] },
                local_add_cond: { type: 'float32', data: new Float32Array((TEXT_TOKENS + 1) * latentLength), dims: [1, TEXT_TOKENS + 1, latentLength] },
              }
            : {
                x: { type: 'float32', data: latent, dims: latentDims },
                t: { type: 'float32', data: Float32Array.of(current), dims: [1] },
                cross_attn_cond: { type: 'float32', data: cross!, dims: [1, TEXT_TOKENS + 1, TEXT_DIM] },
                global_embed: { type: 'float32', data: duration!, dims: [1, TEXT_DIM] },
                local_add_cond: { type: 'float32', data: new Float32Array((TEXT_TOKENS + 1) * latentLength), dims: [1, TEXT_TOKENS + 1, latentLength] },
                padding_mask: { type: 'bool', data: new Uint8Array(latentLength).fill(1), dims: [1, latentLength] },
              };
          const result = await dit.run(inputs);
          const velocity = result[dit.outputNames[0]!]!.data;
          if (isMedium) {
            let bad = 0;
            for (let i = 0; i < velocity.length; i += 1) if (!Number.isFinite(velocity[i]!)) bad += 1;
            if (bad) throw new Error(`Medium velocity has ${bad} non-finite values at step ${step + 1}`);
          }
          const noise = next > 0 ? randomNormal(latent.length, p.seed + step + 1) : null;
          latent = pingPongStep(latent, velocity, current, next, noise);
        });
      }
      if (isMedium) await release(h, 'dit');

      if (!h.decoder) {
        await stage('load-decoder', 0.87, 'Loading decoder', async () => {
          h.decoder = await ports.loadSession(p.model, 'decoder');
        });
      }
      const decoder = h.decoder!;
      const audio = await stage('decode', 0.94, 'Decoding audio', async () => {
        const input: TensorSpec = isMedium
          ? { type: 'float16', data: float32ToFloat16Bits(latent), dims: latentDims }
          : { type: 'float32', data: latent, dims: latentDims };
        const out = await decoder.run({ [decoder.inputNames[0]!]: input });
        return out[decoder.outputNames[0]!]!;
      });
      if (isMedium) await release(h, 'decoder');

      const stats = summarizeAudio(audio.data, audio.dims);
      if (stats.nonFinite > 0 || stats.peak === 0) {
        throw new Error(`Generated audio is invalid (peak ${stats.peak}, non-finite samples ${stats.nonFinite})`);
      }
      const perChannel = audio.dims[audio.dims.length - 1]!;
      const channelCount = audio.dims.length >= 2 ? audio.dims[audio.dims.length - 2]! : 1;
      const frames = outputFrames(p.seconds, SAMPLE_RATE, perChannel);
      const channels: Float32Array[] = [];
      for (let c = 0; c < channelCount; c += 1) {
        const ch = new Float32Array(frames);
        for (let i = 0; i < frames; i += 1) ch[i] = audio.data[c * perChannel + i]!;
        channels.push(ch);
      }
      hooks.progress('total', 1, 'Done');
      return { channels, sampleRate: SAMPLE_RATE, stats, stages: [] };
    } catch (e) {
      if (isMedium && held) {
        for (const k of ['text', 'dit', 'decoder'] as const) await release(held, k);
      }
      const msg = e instanceof Error ? e.message : String(e);
      if (!(e instanceof CancelledError) && /lost|out of memory|allocat/i.test(msg)) await releaseAll('fatal GPU or memory error');
      throw e;
    } finally {
      timing.end('total');
    }
  }

  return {
    async generate(p: GenerateParams, hooks: PipelineHooks): Promise<GenerationResult> {
      const result = await generate(p, hooks);
      return { ...result, stages: hooks.timing.stages() };
    },
    async unload() {
      await releaseAll('unload requested');
      gpuChecked = false;
      await ports.reset?.();
      log?.info('all model memory released');
    },
    /** Model whose sessions are held, with the session kinds still resident. */
    resident(): { model: ModelId; sessions: string[] } | null {
      if (!held) return null;
      const sessions = (['text', 'number', 'dit', 'decoder'] as const).filter((k) => held![k]);
      return { model: held.model, sessions };
    },
  };
}
