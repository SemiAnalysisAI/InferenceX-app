import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
const data = readFileSync(process.argv[2]);
const out = process.argv[3];
mkdirSync(out, { recursive: true });
let p = 0;
const u32 = () => {
  const x = data.readUInt32LE(p);
  p += 4;
  return x;
};
const u64 = () => {
  const x = Number(data.readBigUInt64LE(p));
  p += 8;
  return x;
};
const string = () => {
  const end = data.indexOf(0, p);
  if (end === -1) throw new Error('Missing terminator');
  const x = data.toString('utf8', p, end);
  p = end + 1;
  return x;
};
if (data.toString('ascii', 0, 4) !== 'GMAD') throw new Error('Not GMA');
p = 4;
const version = data[p++];
u64();
u64();
if (version > 1) while (string()) {}
console.log({ name: string(), description: string(), author: string(), version: u32() });
const files = [];
const crcTable = Array.from({ length: 256 }, (_, i) => {
  let c = i;
  for (let n = 0; n < 8; n++) c = c & 1 ? 3988292384 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes) {
  let c = 4294967295;
  for (const b of bytes) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 4294967295) >>> 0;
}
while (u32()) {
  const name = string();
  const size = u64();
  const crc = u32();
  files.push({ name, size, crc });
}
for (const f of files) {
  if (!Number.isSafeInteger(f.size) || p + f.size > data.length)
    throw new Error('Invalid member size');
  if (crc32(data.subarray(p, p + f.size)) !== f.crc) throw new Error(`CRC mismatch: ${f.name}`);
  console.log(f.name, f.size);
  if (process.argv.includes('--all')) {
    if (f.name.startsWith('/') || f.name.includes('..') || f.name.includes('\\'))
      throw new Error('Unsafe member path');
    const target = join(out, f.name);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, data.subarray(p, p + f.size));
  }
  if (f.name.endsWith('.bsp')) {
    const bytes = data.subarray(p, p + f.size);
    const target = join(out, basename(f.name));
    writeFileSync(target, bytes);
    if (bytes.toString('ascii', 0, 4) !== 'VBSP') throw new Error('Not Source BSP');
    const ofs = bytes.readInt32LE(8 + 40 * 16),
      len = bytes.readInt32LE(12 + 40 * 16);
    writeFileSync(join(out, 'pakfile.zip'), bytes.subarray(ofs, ofs + len));
    console.log({ target, bspVersion: bytes.readInt32LE(4), pakfileBytes: len });
  }
  p += f.size;
}
