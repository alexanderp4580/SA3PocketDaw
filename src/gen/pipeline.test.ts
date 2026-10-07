import { describe, expect, it } from 'vitest';
import { CancelledError, createPipeline, type ModelSession, type Ports, type SessionKind, type TensorSpec } from './pipeline';
import type { GenerateParams, ModelId } from './protocol';
import { mediumLatentLength, smallLatentLength } from './sampling';
import { createTimingRecorder } from './timing';

interface Fake {
  ports: Ports;
  events: string[];
  runs: Array<{ kind: SessionKind; model: ModelId; inputs: Record<string, TensorSpec> }>;
  decoderOutput: { fill: (i: number) => number; frames: number | null };
}

function fakePorts(): Fake {
  const events: string[] = [];
  const runs: Fake['runs'] = [];
  const decoderOutput: Fake['decoderOutput'] = { fill: (i) => Math.sin(i / 50) * 0.5, frames: null };
  const ports: Ports = {
    async probeGpu() {
      events.push('probe');
      return 'fake gpu';
    },
    async loadTokenizer(model) {
      events.push(`load tokenizer ${model}`);
      return async () => ({ ids: new BigInt64Array(256).fill(1n), mask: new BigInt64Array(256).fill(1n) });
    },
    async loadSession(model, kind) {
      events.push(`load ${kind}`);
      const out = (data: ArrayLike<number>, dims: number[]) => ({ o: { data, dims } });
      const s: ModelSession = {
        inputNames: kind === 'text-encoder' ? ['ids', 'mask'] : ['in'],
        outputNames: ['o'],
        async run(inputs) {
          runs.push({ kind, model, inputs });
          if (kind === 'text-encoder') return out(new Float32Array(256 * 768).fill(0.1), [1, 256, 768]);
          if (kind === 'number-conditioner') return out(new Float32Array(768).fill(0.2), [1, 768]);
          if (kind === 'dit') return out(new Float32Array(inputs.x!.data.byteLength / 4).fill(0.01), inputs.x!.dims);
          const frames = decoderOutput.frames ?? 44100 * 3;
          const d = new Float32Array(2 * frames);
          for (let i = 0; i < d.length; i++) d[i] = decoderOutput.fill(i);
          return out(d, [1, 2, frames]);
        },
        async release() {
          events.push(`release ${kind}`);
        },
      };
      return s;
    },
    reset() {
      events.push('reset');
    },
  };
  return { ports, events, runs, decoderOutput };
}

const params = (over: Partial<GenerateParams> = {}): GenerateParams => ({ model: 'small-music', prompt: 'p', seconds: 2, steps: 3, seed: 7, ...over });

function hooks(isCancelled: () => boolean = () => false) {
  const progress: Array<{ stage: string; fraction: number }> = [];
  const timing = createTimingRecorder();
  return { timing, progress, h: { timing, isCancelled, progress: (stage: string, fraction: number) => progress.push({ stage, fraction }) } };
}

describe('small pipeline', () => {
  it('runs the stages in order and returns stereo audio trimmed to the length', async () => {
    const f = fakePorts();
    const p = createPipeline(f.ports);
    const { h } = hooks();
    const r = await p.generate(params(), h);
    const names = r.stages.map((s) => s.name);
    expect(names.filter((n) => n !== 'total')).toEqual([
      'gpu-probe', 'load-encoder', 'tokenize', 'encode', 'load-dit',
      'denoise-step-1', 'denoise-step-2', 'denoise-step-3', 'load-decoder', 'decode',
    ]);
    expect(names[names.length - 1]).toBe('total');
    expect(r.sampleRate).toBe(44100);
    expect(r.channels).toHaveLength(2);
    expect(r.channels[0]).toHaveLength(2 * 44100);
    expect(r.stats.nonFinite).toBe(0);
    expect(r.stats.peak).toBeGreaterThan(0);
    expect(r.stats.dims).toEqual([1, 2, 44100 * 3]);
  });

  it('feeds the dit the small-model inputs with the expected latent length', async () => {
    const f = fakePorts();
    await createPipeline(f.ports).generate(params(), hooks().h);
    const dit = f.runs.filter((r) => r.kind === 'dit');
    expect(dit).toHaveLength(3);
    const L = smallLatentLength(2);
    expect(dit[0]!.inputs.x!.dims).toEqual([1, 256, L]);
    expect(Object.keys(dit[0]!.inputs).sort()).toEqual(['cross_attn_cond', 'global_embed', 'local_add_cond', 'padding_mask', 't', 'x']);
    expect((dit[0]!.inputs.t!.data as Float32Array)[0]).toBe(1);
  });

  it('keeps sessions resident and reuses them on the next generation', async () => {
    const f = fakePorts();
    const p = createPipeline(f.ports);
    await p.generate(params(), hooks().h);
    expect(p.resident()).toEqual({ model: 'small-music', sessions: ['text', 'number', 'dit', 'decoder'] });
    f.events.length = 0;
    const r = await p.generate(params({ seed: 8 }), hooks().h);
    expect(f.events.filter((e) => e.startsWith('load') || e.startsWith('release') || e === 'probe')).toEqual([]);
    expect(r.stages.map((s) => s.name)).not.toContain('load-dit');
    expect(r.stages.map((s) => s.name)).toContain('denoise-step-1');
  });

  it('releases the previous model before loading a different one', async () => {
    const f = fakePorts();
    const p = createPipeline(f.ports);
    await p.generate(params(), hooks().h);
    f.events.length = 0;
    await p.generate(params({ model: 'small-sfx' }), hooks().h);
    const firstLoad = f.events.findIndex((e) => e.startsWith('load'));
    const lastRelease = f.events.map((e, i) => (e.startsWith('release') ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
    expect(lastRelease).toBeGreaterThanOrEqual(0);
    expect(lastRelease).toBeLessThan(firstLoad);
    expect(f.events.filter((e) => e.startsWith('release'))).toHaveLength(4);
    expect(p.resident()?.model).toBe('small-sfx');
  });

  it('unload releases everything and a later run reloads and probes again', async () => {
    const f = fakePorts();
    const p = createPipeline(f.ports);
    await p.generate(params(), hooks().h);
    f.events.length = 0;
    await p.unload();
    expect(f.events.filter((e) => e.startsWith('release'))).toHaveLength(4);
    expect(f.events).toContain('reset');
    expect(p.resident()).toBeNull();
    f.events.length = 0;
    await p.generate(params(), hooks().h);
    expect(f.events).toContain('probe');
    expect(f.events).toContain('load dit');
  });

  it('reports progress with rising fractions ending at 1', async () => {
    const f = fakePorts();
    const { h, progress } = hooks();
    await createPipeline(f.ports).generate(params(), h);
    const fr = progress.map((x) => x.fraction);
    expect([...fr].sort((a, b) => a - b)).toEqual(fr);
    expect(fr[fr.length - 1]).toBe(1);
    expect(progress.map((x) => x.stage)).toContain('denoise-step-2');
  });
});

describe('cancel', () => {
  it('stops before the denoise step after the cancel flag is set and leaves sessions resident', async () => {
    const f = fakePorts();
    const p = createPipeline(f.ports);
    let cancel = false;
    const { h } = hooks(() => cancel);
    const wrapped = { ...h, progress: (stage: string) => { if (stage === 'denoise-step-2') cancel = true; } };
    await expect(p.generate(params({ steps: 4 }), wrapped)).rejects.toBeInstanceOf(CancelledError);
    expect(f.runs.filter((r) => r.kind === 'dit')).toHaveLength(2);
    expect(f.runs.some((r) => r.kind === 'decoder')).toBe(false);
    expect(p.resident()?.sessions).toContain('dit');
  });
  it('stops before the first stage when already cancelled', async () => {
    const f = fakePorts();
    await expect(createPipeline(f.ports).generate(params(), hooks(() => true).h)).rejects.toThrow(/cannot be interrupted/);
    expect(f.events).toEqual([]);
  });
});

describe('audio validation', () => {
  it('rejects silent audio', async () => {
    const f = fakePorts();
    f.decoderOutput.fill = () => 0;
    await expect(createPipeline(f.ports).generate(params(), hooks().h)).rejects.toThrow(/invalid/);
  });
  it('rejects non-finite audio', async () => {
    const f = fakePorts();
    f.decoderOutput.fill = (i) => (i === 10 ? NaN : 0.1);
    await expect(createPipeline(f.ports).generate(params(), hooks().h)).rejects.toThrow(/non-finite/);
  });
  it('trims to the exact fractional length and feeds it to the conditioners', async () => {
    const f = fakePorts();
    const r = await createPipeline(f.ports).generate(params({ seconds: 1.25 }), hooks().h);
    expect(r.channels[0]).toHaveLength(55125);
    const nc = f.runs.find((x) => x.kind === 'number-conditioner')!;
    expect(Array.from(nc.inputs.seconds!.data as Float32Array)).toEqual([1.25]);
  });
  it('does not grow past the decoder output length', async () => {
    const f = fakePorts();
    f.decoderOutput.frames = 1000;
    const r = await createPipeline(f.ports).generate(params(), hooks().h);
    expect(r.channels[0]).toHaveLength(1000);
  });
});

describe('medium pipeline', () => {
  it('releases the text encoder, dit and decoder as it goes and feeds float16 to the decoder', async () => {
    const f = fakePorts();
    const p = createPipeline(f.ports);
    const r = await p.generate(params({ model: 'medium' }), hooks().h);
    const order = f.events.filter((e) => e.startsWith('load ') || e.startsWith('release'));
    expect(order).toEqual([
      'load tokenizer medium', 'load text-encoder', 'release text-encoder',
      'load dit', 'release dit', 'load decoder', 'release decoder',
    ]);
    expect(p.resident()?.sessions).toEqual([]);
    const dit = f.runs.find((x) => x.kind === 'dit')!;
    expect(Object.keys(dit.inputs).sort()).toEqual(['local_add_cond', 'seconds_total', 't', 't5_hidden', 't5_mask', 'x']);
    expect(dit.inputs.x!.dims).toEqual([1, 256, mediumLatentLength(2)]);
    const dec = f.runs.find((x) => x.kind === 'decoder')!;
    expect(dec.inputs.in!.type).toBe('float16');
    expect(dec.inputs.in!.data).toBeInstanceOf(Uint16Array);
    expect(r.stages.map((s) => s.name)).not.toContain('number-conditioner');
    expect(f.runs.some((x) => x.kind === 'number-conditioner')).toBe(false);
  });

  it('fails on non-finite velocity and still releases transient sessions', async () => {
    const f = fakePorts();
    const orig = f.ports.loadSession;
    f.ports.loadSession = async (m, k) => {
      const s = await orig(m, k);
      if (k !== 'dit') return s;
      return { ...s, run: async () => ({ o: { data: Float32Array.of(NaN), dims: [1] } }) };
    };
    const p = createPipeline(f.ports);
    await expect(p.generate(params({ model: 'medium' }), hooks().h)).rejects.toThrow(/non-finite/);
    expect(f.events).toContain('release dit');
    expect(p.resident()?.sessions).toEqual([]);
  });
});

describe('fatal errors', () => {
  it('release everything after a device-lost error', async () => {
    const f = fakePorts();
    const orig = f.ports.loadSession;
    f.ports.loadSession = async (m, k) => {
      const s = await orig(m, k);
      if (k !== 'decoder') return s;
      return { ...s, run: async () => { throw new Error('GPUDevice was lost'); } };
    };
    const p = createPipeline(f.ports);
    await expect(p.generate(params(), hooks().h)).rejects.toThrow(/lost/);
    expect(p.resident()).toBeNull();
  });
});
