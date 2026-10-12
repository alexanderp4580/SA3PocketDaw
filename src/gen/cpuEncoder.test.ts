import { describe, expect, it } from 'vitest';
import { graphOpTypes, rewriteGatherBlockQuantized } from './cpuEncoder';
import { concat, fBytes, fString, fVarint } from './onnxProto';

const VOCAB = 6;
const DIM = 32;
const BLOCK = 16;

interface Built {
  bytes: Uint8Array;
  weights: Uint8Array;
  scales: Float32Array;
}

function valueInfo(name: string, elem: number, dims: Array<number | string>): Uint8Array {
  const shape = concat(dims.map((d) => fBytes(1, typeof d === 'number' ? fVarint(1, d) : fString(2, d))));
  return concat([fString(1, name), fBytes(2, fBytes(1, concat([fVarint(1, elem), fBytes(2, shape)])))]);
}

/** ModelProto: ids -> GatherBlockQuantized(weight [VOCAB, DIM] of `dataType`, scales) -> Identity -> out. */
function buildModel(opts: { dataType: number; extraAttrs?: Uint8Array[]; withScalesOnly?: boolean; bits?: number } = { dataType: 22 }): Built {
  const rng = (() => { let s = 12345; return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648; })();
  const weights = Uint8Array.from({ length: VOCAB * DIM / 2 }, () => Math.floor(rng() * 256));
  const scales = Float32Array.from({ length: VOCAB * DIM / BLOCK }, () => 0.05 + rng());
  const weight = concat([
    fVarint(1, VOCAB), fVarint(1, DIM), fVarint(2, opts.dataType), fString(8, 'W_Q4'), fBytes(9, weights),
    fBytes(13, concat([fString(1, 'note'), fString(2, 'kept')])),
  ]);
  const scalesT = concat([fVarint(1, VOCAB), fVarint(1, DIM / BLOCK), fVarint(2, 1), fString(8, 'W_scales'), fBytes(9, new Uint8Array(scales.buffer))]);
  const attr = (n: string, v: number) => fBytes(5, concat([fString(1, n), fVarint(3, v), fVarint(20, 2)]));
  const gbq = concat([
    fString(1, 'W_Q4'), fString(1, 'ids'), fString(1, 'W_scales'), fString(2, 'embedding'), fString(3, 'gbq'), fString(4, 'GatherBlockQuantized'),
    attr('block_size', BLOCK), attr('gather_axis', 0), attr('quantize_axis', 1), ...(opts.bits ? [attr('bits', opts.bits)] : []), fString(7, 'com.microsoft'),
  ]);
  const abs = concat([fString(1, 'embedding'), fString(2, 'out'), fString(3, 'id'), fString(4, 'Identity')]);
  const graph = concat([
    fBytes(1, gbq), fBytes(1, abs), fString(2, 'g'), fBytes(5, weight), fBytes(5, scalesT),
    fBytes(11, valueInfo('ids', 7, [1, 'n'])), fBytes(12, valueInfo('out', 1, [1, 'n', DIM])),
  ]);
  const bytes = concat([
    fVarint(1, 10), fBytes(8, concat([fString(1, ''), fVarint(2, 21)])), fBytes(8, concat([fString(1, 'com.microsoft'), fVarint(2, 1)])), fBytes(7, graph),
  ]);
  return { bytes, weights, scales };
}

function reference(b: Built, ids: number[], signed: boolean): Float32Array {
  const out = new Float32Array(ids.length * DIM);
  ids.forEach((id, r) => {
    for (let c = 0; c < DIM; c += 1) {
      const byte = b.weights[(id * DIM + c) >> 1]!;
      const n = c % 2 === 0 ? byte & 15 : byte >> 4;
      const v = signed ? (n >= 8 ? n - 16 : n) : n - 8;
      out[r * DIM + c] = v * b.scales[id * (DIM / BLOCK) + Math.floor(c / BLOCK)]!;
    }
  });
  return out;
}

describe('rewriteGatherBlockQuantized', () => {
  it('replaces the node with standard ops and keeps the surrounding graph', () => {
    const m = buildModel({ dataType: 22 });
    const r = rewriteGatherBlockQuantized(m.bytes);
    expect(r.rewritten).toBe(true);
    const ops = graphOpTypes(r.bytes);
    expect(ops).not.toContain('GatherBlockQuantized');
    expect(ops[ops.length - 1]).toBe('Identity');
    for (const op of ['Gather', 'BitwiseXor', 'BitwiseAnd', 'BitShift', 'Cast', 'Concat', 'Reshape', 'Sub', 'Mul']) expect(ops).toContain(op);
    expect(ops.filter((o) => o === 'Gather')).toHaveLength(2);
  });

  it('skips the sign flip for unsigned 4-bit weights', () => {
    const r = rewriteGatherBlockQuantized(buildModel({ dataType: 21 }).bytes);
    expect(r.rewritten).toBe(true);
    expect(graphOpTypes(r.bytes)).not.toContain('BitwiseXor');
  });

  it('returns the input untouched when there is nothing supported to rewrite', () => {
    const none = rewriteGatherBlockQuantized(Uint8Array.of(8, 10));
    expect(none.rewritten).toBe(false);
    const eight = buildModel({ dataType: 22, bits: 8 });
    const r = rewriteGatherBlockQuantized(eight.bytes);
    expect(r.rewritten).toBe(false);
    expect(r.bytes).toBe(eight.bytes);
  });

  it('is deterministic and does not change the bytes of unrelated fields', () => {
    const m = buildModel({ dataType: 22 });
    const a = rewriteGatherBlockQuantized(m.bytes).bytes;
    const b = rewriteGatherBlockQuantized(m.bytes).bytes;
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(a.length).toBeGreaterThan(m.bytes.length);
  });
});

describe('rewritten graph numerics (onnxruntime-node CPU)', () => {
  const ids = [3, 0, 5, 3, 1];
  const run = async (bytes: Uint8Array) => {
    const ort = await import('onnxruntime-node');
    const session = await ort.InferenceSession.create(bytes, { executionProviders: ['cpu'], graphOptimizationLevel: 'disabled' });
    const out = await session.run({ ids: new ort.Tensor('int64', BigInt64Array.from(ids, BigInt), [1, ids.length]) });
    return Float32Array.from(out.out!.data as Float32Array);
  };

  it.each([[22, true], [21, false]])('dequantizes data type %i like the reference', async (dataType, signed) => {
    const m = buildModel({ dataType });
    const got = await run(rewriteGatherBlockQuantized(m.bytes).bytes);
    const want = reference(m, ids, signed);
    expect(got.length).toBe(want.length);
    for (let i = 0; i < want.length; i += 1) expect(got[i]).toBeCloseTo(want[i]!, 6);
  });
});
