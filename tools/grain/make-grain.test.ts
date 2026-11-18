import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { makeGrain } from './make-grain';

const committed = resolve(__dirname, '../../public/theme/grain.png');

describe('makeGrain', () => {
  it('starts with the PNG signature', () => {
    expect(Array.from(makeGrain().subarray(0, 8))).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
  });

  it('writes a 128x128, 8-bit greyscale IHDR', () => {
    const png = makeGrain();
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    expect(String.fromCharCode(...png.subarray(12, 16))).toBe('IHDR');
    expect(view.getUint32(16)).toBe(128);
    expect(view.getUint32(20)).toBe(128);
    expect(png[24]).toBe(8);
    expect(png[25]).toBe(0);
  });

  it('gives identical bytes for the same seed', () => {
    expect(makeGrain(128, 7)).toEqual(makeGrain(128, 7));
    expect(makeGrain(128, 7)).not.toEqual(makeGrain(128, 8));
  });

  it('the committed file is reproducible', () => {
    expect(Buffer.from(makeGrain()).equals(readFileSync(committed))).toBe(true);
  });

  it('has a valid zlib IDAT holding 128 unfiltered scanlines', () => {
    const png = makeGrain();
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    const len = view.getUint32(33);
    expect(String.fromCharCode(...png.subarray(37, 41))).toBe('IDAT');
    const raw = inflateSync(png.subarray(41, 41 + len));
    expect(raw.length).toBe(128 * 129);
    for (let y = 0; y < 128; y++) expect(raw[y * 129]).toBe(0);
  });

  it('is under 20 KB', () => {
    expect(readFileSync(committed).length).toBeLessThan(20 * 1024);
  });
});
