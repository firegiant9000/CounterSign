// Dev-only: generate the paper-grain tile used behind the desk colour.
// Usage: jiti tools/grain/make-grain.ts   (writes public/theme/grain.png)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (const v of bytes) {
    a = (a + v) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

// A zlib stream made of stored (uncompressed) deflate blocks, so the bytes do
// not depend on the zlib build inside the running Node.
function zlibStored(data: Uint8Array): Uint8Array {
  const MAX = 65535;
  const blocks = Math.max(1, Math.ceil(data.length / MAX));
  const out = new Uint8Array(2 + blocks * 5 + data.length + 4);
  const view = new DataView(out.buffer);
  out[0] = 0x78;
  out[1] = 0x01;
  let pos = 2;
  for (let i = 0; i < blocks; i++) {
    const part = data.subarray(i * MAX, (i + 1) * MAX);
    out[pos++] = i === blocks - 1 ? 1 : 0; // BFINAL, BTYPE=00
    view.setUint16(pos, part.length, true);
    view.setUint16(pos + 2, ~part.length & 0xffff, true);
    pos += 4;
    out.set(part, pos);
    pos += part.length;
  }
  view.setUint32(pos, adler32(data));
  return out;
}

/** PNG bytes of a size x size greyscale (8-bit) noise tile, mid-grey 128 +/- 40. */
export function makeGrain(size = 128, seed = 1): Uint8Array {
  const rand = mulberry32(seed);
  const raw = new Uint8Array(size * (size + 1));
  for (let y = 0; y < size; y++) {
    const row = y * (size + 1);
    raw[row] = 0; // filter type: none
    for (let x = 0; x < size; x++) {
      raw[row + 1 + x] = 128 + Math.round((rand() * 2 - 1) * 40);
    }
  }
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, size);
  view.setUint32(4, size);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // colour type: greyscale
  const parts = [
    Uint8Array.from(PNG_SIGNATURE),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlibStored(raw)),
    chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

const here = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === here) {
  const target = resolve(dirname(here), '../../public/theme/grain.png');
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, makeGrain());
  console.log(`wrote ${target}`);
}
