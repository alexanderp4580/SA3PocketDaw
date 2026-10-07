/** Round-to-nearest-even float32 to IEEE half conversion; returns the raw 16-bit patterns. */
export function float32ToFloat16BitsManual(src: Float32Array): Uint16Array {
  const out = new Uint16Array(src.length);
  const f32 = new Float32Array(1);
  const u32 = new Uint32Array(f32.buffer);
  for (let i = 0; i < src.length; i += 1) {
    f32[0] = src[i]!;
    const x = u32[0]!;
    const sign = (x >>> 16) & 0x8000;
    const exp = (x >>> 23) & 0xff;
    const mant = x & 0x7fffff;
    if (exp === 0xff) {
      out[i] = sign | 0x7c00 | (mant ? 0x200 : 0);
      continue;
    }
    const e = exp - 127 + 15;
    if (e >= 31) {
      out[i] = sign | 0x7c00;
    } else if (e <= 0) {
      if (e < -10) {
        out[i] = sign;
        continue;
      }
      const m = mant | 0x800000;
      const shift = 14 - e;
      let half = m >>> shift;
      const roundBit = (m >>> (shift - 1)) & 1;
      const sticky = m & ((1 << (shift - 1)) - 1);
      if (roundBit && (sticky || half & 1)) half += 1;
      out[i] = sign | half;
    } else {
      let half = (e << 10) | (mant >>> 13);
      const roundBit = (mant >>> 12) & 1;
      const sticky = mant & 0xfff;
      if (roundBit && (sticky || half & 1)) half += 1;
      out[i] = sign | half;
    }
  }
  return out;
}

/** Native Float16Array when the runtime has it, otherwise the manual conversion. */
export function float32ToFloat16Bits(src: Float32Array): Uint16Array {
  const F16 = (globalThis as { Float16Array?: { from(a: ArrayLike<number>): { buffer: ArrayBuffer } } }).Float16Array;
  if (F16) return new Uint16Array(F16.from(src).buffer);
  return float32ToFloat16BitsManual(src);
}
