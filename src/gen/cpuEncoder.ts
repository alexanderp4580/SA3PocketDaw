import { concat, fBytes, fString, fVarint, readFields, text, type ProtoField } from './onnxProto';

/**
 * ONNX Runtime Web has no WASM kernel for the `com.microsoft` GatherBlockQuantized op the text encoder uses to
 * embed tokens. `rewriteGatherBlockQuantized` replaces that node, inside the graph bytes, with standard ops that
 * have WASM kernels: it gathers the packed 4-bit rows and the block scales for the token ids first, then unpacks
 * and scales only those rows, so the [vocab, dim] float table is never built. The weight initializer keeps its
 * external data and is retyped from INT4/UINT4 to UINT8 with half the columns.
 */

// ONNX TensorProto.DataType values.
const FLOAT = 1;
const UINT8 = 2;
const INT64 = 7;
const UINT4 = 21;
const INT4 = 22;
// AttributeProto.AttributeType values.
const ATTR_INT = 2;
const ATTR_STRING = 3;

// ModelProto / GraphProto / NodeProto / TensorProto / AttributeProto field numbers.
const MODEL_GRAPH = 7;
const GRAPH_NODE = 1;
const GRAPH_INITIALIZER = 5;
const NODE = { input: 1, output: 2, name: 3, opType: 4, attribute: 5, domain: 7 } as const;
const TENSOR = { dims: 1, dataType: 2, name: 8, rawData: 9, externalData: 13 } as const;
const ATTR = { name: 1, i: 3, s: 4, type: 20 } as const;

const OP = 'GatherBlockQuantized';
const PREFIX = '__cpu_enc_';

export interface RewriteResult {
  bytes: Uint8Array;
  /** False when the graph has no supported GatherBlockQuantized node; `bytes` is then the input unchanged. */
  rewritten: boolean;
  reason?: string;
}

interface NodeInfo {
  field: ProtoField;
  inputs: string[];
  outputs: string[];
  opType: string;
  attrs: Map<string, number>;
}

function readNode(b: Uint8Array, f: ProtoField): NodeInfo {
  const info: NodeInfo = { field: f, inputs: [], outputs: [], opType: '', attrs: new Map() };
  for (const x of readFields(b, f.vStart, f.vEnd)) {
    if (x.num === NODE.input) info.inputs.push(text(b, x));
    else if (x.num === NODE.output) info.outputs.push(text(b, x));
    else if (x.num === NODE.opType) info.opType = text(b, x);
    else if (x.num === NODE.attribute) {
      let name = '';
      let value = 0;
      for (const a of readFields(b, x.vStart, x.vEnd)) {
        if (a.num === ATTR.name) name = text(b, a);
        else if (a.num === ATTR.i) value = a.value;
      }
      info.attrs.set(name, value);
    }
  }
  return info;
}

function tensor(name: string, dataType: number, dims: number[], raw: Uint8Array): Uint8Array {
  return concat([
    ...dims.map((d) => fVarint(TENSOR.dims, d)),
    fVarint(TENSOR.dataType, dataType),
    fString(TENSOR.name, name),
    fBytes(TENSOR.rawData, raw),
  ]);
}

const u8 = (v: number) => Uint8Array.of(v);
const f32 = (v: number) => new Uint8Array(Float32Array.of(v).buffer);
const i64s = (vs: number[]) => new Uint8Array(BigInt64Array.from(vs, BigInt).buffer);

function node(opType: string, inputs: string[], output: string, attrs: Uint8Array[] = []): Uint8Array {
  return concat([
    ...inputs.map((i) => fString(NODE.input, i)),
    fString(NODE.output, output),
    fString(NODE.name, output),
    fString(NODE.opType, opType),
    ...attrs.map((a) => fBytes(NODE.attribute, a)),
  ]);
}
const attrInt = (name: string, v: number) => concat([fString(ATTR.name, name), fVarint(ATTR.i, v), fVarint(ATTR.type, ATTR_INT)]);
const attrString = (name: string, v: string) => concat([fString(ATTR.name, name), fString(ATTR.s, v), fVarint(ATTR.type, ATTR_STRING)]);

/** Re-encodes a weight initializer as UINT8 [rows, cols / 2] and fixes an external-data `length`. */
function retypeWeight(b: Uint8Array, f: ProtoField, rows: number, packedCols: number): Uint8Array {
  const parts: Uint8Array[] = [];
  parts.push(fVarint(TENSOR.dims, rows), fVarint(TENSOR.dims, packedCols), fVarint(TENSOR.dataType, UINT8));
  for (const x of readFields(b, f.vStart, f.vEnd)) {
    if (x.num === TENSOR.dims || x.num === TENSOR.dataType) continue;
    if (x.num === TENSOR.externalData) {
      const entry = readFields(b, x.vStart, x.vEnd);
      const key = text(b, entry.find((e) => e.num === 1)!);
      if (key === 'length') {
        parts.push(fBytes(TENSOR.externalData, concat([fString(1, 'length'), fString(2, String(rows * packedCols))])));
        continue;
      }
    }
    parts.push(b.subarray(x.start, x.end));
  }
  return concat(parts);
}

interface TensorInfo {
  field: ProtoField;
  dataType: number;
  dims: number[];
}

function readTensor(b: Uint8Array, f: ProtoField): { name: string; info: TensorInfo } {
  let name = '';
  let dataType = 0;
  const dims: number[] = [];
  for (const x of readFields(b, f.vStart, f.vEnd)) {
    if (x.num === TENSOR.name) name = text(b, x);
    else if (x.num === TENSOR.dataType) dataType = x.value;
    else if (x.num === TENSOR.dims) dims.push(x.value);
  }
  return { name, info: { field: f, dataType, dims } };
}

/** Replaces the GatherBlockQuantized token-embedding node with Gather/unpack/scale ops (see file header). */
export function rewriteGatherBlockQuantized(model: Uint8Array): RewriteResult {
  const none = (reason?: string): RewriteResult => ({ bytes: model, rewritten: false, reason });
  const top = readFields(model);
  const graphField = top.find((f) => f.num === MODEL_GRAPH);
  if (!graphField) return none('no graph');
  const graph = readFields(model, graphField.vStart, graphField.vEnd);

  const target = graph.filter((f) => f.num === GRAPH_NODE).map((f) => readNode(model, f)).find((n) => n.opType === OP);
  if (!target) return none('no GatherBlockQuantized node');
  const [dataName, idsName, scalesName, zeroPoints] = target.inputs;
  const bits = target.attrs.get('bits') ?? 4;
  const blockSize = target.attrs.get('block_size') ?? 0;
  const gatherAxis = target.attrs.get('gather_axis') ?? 0;
  const quantizeAxis = target.attrs.get('quantize_axis') ?? 1;
  if (bits !== 4 || gatherAxis !== 0 || quantizeAxis !== 1 || blockSize < 2 || blockSize % 2 !== 0 || !!zeroPoints || target.inputs.length !== 3) {
    return none('unsupported GatherBlockQuantized configuration');
  }

  const tensors = new Map<string, TensorInfo>();
  for (const f of graph) if (f.num === GRAPH_INITIALIZER) {
    const t = readTensor(model, f);
    tensors.set(t.name, t.info);
  }
  const data = tensors.get(dataName!);
  const scales = tensors.get(scalesName!);
  if (!data || !scales) return none('weight or scales are not initializers');
  if (data.dataType !== INT4 && data.dataType !== UINT4) return none('weight is not a 4-bit tensor');
  if (scales.dataType !== FLOAT) return none('scales are not float32');
  if (data.dims.length !== 2) return none('weight is not 2-D');
  const [rows, cols] = data.dims as [number, number];
  const blocks = cols / blockSize;
  if (!Number.isInteger(blocks) || scales.dims[0] !== rows || scales.dims[1] !== blocks) return none('scales do not match the weight blocks');
  const packedCols = cols / 2;
  const half = blockSize / 2;
  const signed = data.dataType === INT4;
  const out = target.outputs[0]!;
  const p = (s: string) => PREFIX + s;

  const consts: Uint8Array[] = [
    tensor(p('mask'), UINT8, [], u8(0x0f)),
    tensor(p('shift'), UINT8, [], u8(4)),
    tensor(p('eight'), FLOAT, [], f32(8)),
    tensor(p('shape_pairs'), INT64, [5], i64s([0, 0, blocks, half, 1])),
    tensor(p('shape_block'), INT64, [4], i64s([0, 0, blocks, blockSize])),
    tensor(p('shape_scale'), INT64, [4], i64s([0, 0, blocks, 1])),
    tensor(p('shape_row'), INT64, [3], i64s([0, 0, cols])),
  ];
  if (signed) consts.push(tensor(p('flip'), UINT8, [], u8(0x88)));

  const nodes: Uint8Array[] = [];
  nodes.push(node('Gather', [dataName!, idsName!], p('packed')));
  nodes.push(node('Gather', [scalesName!, idsName!], p('scales')));
  // INT4 nibbles are two's complement; flipping each nibble's sign bit turns (n ^ 8) - 8 into the signed value.
  const packed = signed ? p('flipped') : p('packed');
  if (signed) nodes.push(node('BitwiseXor', [p('packed'), p('flip')], p('flipped')));
  nodes.push(node('BitwiseAnd', [packed, p('mask')], p('lo_u8')));
  nodes.push(node('BitShift', [packed, p('shift')], p('hi_u8'), [attrString('direction', 'RIGHT')]));
  nodes.push(node('Cast', [p('lo_u8')], p('lo_f'), [attrInt('to', FLOAT)]));
  nodes.push(node('Cast', [p('hi_u8')], p('hi_f'), [attrInt('to', FLOAT)]));
  nodes.push(node('Reshape', [p('lo_f'), p('shape_pairs')], p('lo_r')));
  nodes.push(node('Reshape', [p('hi_f'), p('shape_pairs')], p('hi_r')));
  nodes.push(node('Concat', [p('lo_r'), p('hi_r')], p('pairs'), [attrInt('axis', 4)]));
  nodes.push(node('Reshape', [p('pairs'), p('shape_block')], p('blocks')));
  nodes.push(node('Sub', [p('blocks'), p('eight')], p('centered')));
  nodes.push(node('Reshape', [p('scales'), p('shape_scale')], p('scales_r')));
  nodes.push(node('Mul', [p('centered'), p('scales_r')], p('scaled')));
  nodes.push(node('Reshape', [p('scaled'), p('shape_row')], out));

  const parts: Uint8Array[] = [];
  for (const f of graph) {
    if (f === target.field) {
      for (const n of nodes) parts.push(fBytes(GRAPH_NODE, n));
    } else if (f === data.field) {
      parts.push(fBytes(GRAPH_INITIALIZER, retypeWeight(model, f, rows, packedCols)));
      for (const c of consts) parts.push(fBytes(GRAPH_INITIALIZER, c));
    } else {
      parts.push(model.subarray(f.start, f.end));
    }
  }
  const newGraph = fBytes(MODEL_GRAPH, concat(parts));
  const result: Uint8Array[] = [];
  for (const f of top) result.push(f === graphField ? newGraph : model.subarray(f.start, f.end));
  return { bytes: concat(result), rewritten: true };
}

/** Op types of the main graph, for tests and logs. */
export function graphOpTypes(model: Uint8Array): string[] {
  const g = readFields(model).find((f) => f.num === MODEL_GRAPH);
  if (!g) return [];
  return readFields(model, g.vStart, g.vEnd).filter((f) => f.num === GRAPH_NODE).map((f) => readNode(model, f).opType);
}
