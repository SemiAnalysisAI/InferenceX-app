import fs from 'node:fs';
import path from 'node:path';
const root = process.argv[2] || path.dirname(new URL(import.meta.url).pathname);
function align(buffer, value = 0) {
  const pad = (4 - (buffer.length % 4)) % 4;
  return Buffer.concat([buffer, Buffer.alloc(pad, value)]);
}
const models = process.argv[3] || path.join(root, 'models');
for (const name of fs.readdirSync(models).filter((n) => n.endsWith('.glb'))) {
  const file = path.join(models, name),
    data = fs.readFileSync(file),
    size = data.readUInt32LE(12);
  const j = JSON.parse(data.subarray(20, 20 + size).toString());
  let bin = align(data.subarray(28 + size));
  let changes = 0;
  for (const image of j.images || []) {
    if (!image.name?.startsWith('missing_')) continue;
    const original = image.name.slice(8),
      png = fs.readFileSync(path.join(root, 'repaired-textures', `${original}.png`));
    const view = j.bufferViews[image.bufferView];
    view.byteOffset = bin.length;
    view.byteLength = png.length;
    bin = Buffer.concat([bin, align(png)]);
    image.mimeType = 'image/png';
    image.name = original;
    changes++;
  }
  j.buffers[0].byteLength = bin.length;
  const json = align(Buffer.from(JSON.stringify(j)), 32),
    header = Buffer.alloc(20),
    chunk = Buffer.alloc(8);
  header.write('glTF', 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + json.length + bin.length, 8);
  header.writeUInt32LE(json.length, 12);
  header.write('JSON', 16);
  chunk.writeUInt32LE(bin.length, 0);
  chunk.write('BIN\0', 4);
  fs.writeFileSync(file, Buffer.concat([header, json, chunk, bin]));
  console.log(name, changes);
}
