/** Minimal protobuf wire reader/writer for the few ONNX messages the CPU encoder rewrite touches. */

export interface ProtoField {
  num: number;
  wire: number;
  /** Offset of the tag byte(s). */
  start: number;
  /** Offset just past the field. */
  end: number;
  /** Payload range for length-delimited fields; for varints `vStart..vEnd` is the varint itself. */
  vStart: number;
  vEnd: number;
  /** Decoded value for varint fields. */
  value: number;
}

function readVarint(b: Uint8Array, p: number): [number, number] {
  let result = 0;
  let mul = 1;
  for (;;) {
    if (p >= b.length) throw new Error('Truncated protobuf varint');
    const c = b[p++]!;
    result += (c & 0x7f) * mul;
    if (!(c & 0x80)) return [result, p];
    mul *= 128;
  }
}

/** Splits a message payload `b[start..end)` into its top-level fields. */
export function readFields(b: Uint8Array, start = 0, end = b.length): ProtoField[] {
  const out: ProtoField[] = [];
  let p = start;
  while (p < end) {
    const fieldStart = p;
    let tag: number;
    [tag, p] = readVarint(b, p);
    const num = Math.floor(tag / 8);
    const wire = tag & 7;
    let vStart = p;
    let vEnd = p;
    let value = 0;
    if (wire === 0) {
      [value, p] = readVarint(b, p);
      vEnd = p;
    } else if (wire === 2) {
      let len: number;
      [len, p] = readVarint(b, p);
      vStart = p;
      vEnd = p + len;
      p = vEnd;
    } else if (wire === 1) {
      vEnd = p += 8;
    } else if (wire === 5) {
      vEnd = p += 4;
    } else throw new Error(`Unsupported protobuf wire type ${wire}`);
    if (p > end) throw new Error('Truncated protobuf field');
    out.push({ num, wire, start: fieldStart, end: p, vStart, vEnd, value });
  }
  return out;
}

export function varintBytes(v: number): number[] {
  const out: number[] = [];
  let n = v;
  while (n >= 128) {
    out.push((n % 128) | 0x80);
    n = Math.floor(n / 128);
  }
  out.push(n);
  return out;
}

export function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const fVarint = (num: number, v: number): Uint8Array => Uint8Array.from([...varintBytes(num * 8), ...varintBytes(v)]);
export const fBytes = (num: number, payload: Uint8Array): Uint8Array =>
  concat([Uint8Array.from([...varintBytes(num * 8 + 2), ...varintBytes(payload.length)]), payload]);
export const fString = (num: number, s: string): Uint8Array => fBytes(num, encoder.encode(s));
export const text = (b: Uint8Array, f: ProtoField): string => decoder.decode(b.subarray(f.vStart, f.vEnd));
