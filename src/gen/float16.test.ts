import { describe, expect, it } from 'vitest';
import { float32ToFloat16Bits, float32ToFloat16BitsManual } from './float16';

const bits = (...v: number[]) => Array.from(float32ToFloat16BitsManual(Float32Array.from(v)));

describe('float32ToFloat16BitsManual', () => {
  it('encodes known values', () => {
    expect(bits(0, 1, -1, 0.5, 2, 65504, -2)).toEqual([0x0000, 0x3c00, 0xbc00, 0x3800, 0x4000, 0x7bff, 0xc000]);
  });
  it('encodes signed zero, infinities and NaN', () => {
    expect(bits(-0)).toEqual([0x8000]);
    expect(bits(Infinity, -Infinity)).toEqual([0x7c00, 0xfc00]);
    const nan = bits(NaN)[0]!;
    expect(nan & 0x7c00).toBe(0x7c00);
    expect(nan & 0x3ff).not.toBe(0);
  });
  it('overflows to infinity', () => {
    expect(bits(70000, -70000)).toEqual([0x7c00, 0xfc00]);
  });
  it('encodes subnormals and underflows to zero', () => {
    expect(bits(2 ** -24)).toEqual([0x0001]);
    expect(bits(2 ** -14)).toEqual([0x0400]);
    expect(bits(2 ** -26)).toEqual([0x0000]);
  });
  it('rounds to nearest even', () => {
    expect(bits(1 + 2 ** -11)).toEqual([0x3c00]); // tie rounds to even (down)
    expect(bits(1 + 3 * 2 ** -11)).toEqual([0x3c02]); // tie rounds to even (up)
    expect(bits(1 + 2 ** -11 + 2 ** -20)).toEqual([0x3c01]);
  });
  it('matches the native Float16Array when the runtime has one', () => {
    const F16 = (globalThis as any).Float16Array;
    if (!F16) return;
    const values = new Float32Array(5000);
    let s = 1;
    for (let i = 0; i < values.length; i++) {
      s = (s * 1103515245 + 12345) >>> 0;
      values[i] = ((s / 2 ** 32) - 0.5) * 2 ** ((i % 40) - 20);
    }
    expect(Array.from(float32ToFloat16BitsManual(values))).toEqual(Array.from(new Uint16Array(F16.from(values).buffer)));
  });
});

describe('float32ToFloat16Bits', () => {
  it('returns the 16-bit patterns', () => {
    expect(Array.from(float32ToFloat16Bits(Float32Array.of(1, -2)))).toEqual([0x3c00, 0xc000]);
  });
});
