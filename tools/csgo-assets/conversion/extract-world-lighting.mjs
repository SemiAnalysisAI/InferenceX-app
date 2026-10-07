import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function extractLighting(bsp) {
  if (bsp.toString('ascii', 0, 4) !== 'VBSP' || bsp.readInt32LE(4) !== 20)
    throw new Error('Expected Source BSP version 20');
  const lump = (id) => {
    const offset = bsp.readInt32LE(8 + id * 16),
      length = bsp.readInt32LE(12 + id * 16);
    if (offset < 0 || length < 0 || offset + length > bsp.length)
      throw new Error('Invalid BSP lump');
    const bytes = bsp.subarray(offset, offset + length);
    if (bytes.toString('ascii', 0, 4) === 'LZMA')
      throw new Error('Compressed BSP lumps are unsupported');
    return bytes;
  };
  const faces = lump(7),
    lighting = lump(8),
    texInfo = lump(6),
    texData = lump(2);
  const vertices = lump(3),
    edges = lump(12),
    surfEdges = lump(13),
    models = lump(14);
  const names = lump(43),
    nameOffsets = lump(44);
  const first = models.readInt32LE(40),
    count = models.readInt32LE(44);
  const surfaces = [];
  for (let id = first; id < first + count; id++) {
    const f = id * 56,
      t = faces.readInt16LE(f + 10);
    if (faces.readInt16LE(f + 12) >= 0 || t < 0) continue;
    const ti = t * 72,
      td = texInfo.readInt32LE(ti + 68) * 32;
    const nameIndex = texData.readInt32LE(td + 12),
      nameAt = nameOffsets.readInt32LE(nameIndex * 4);
    const name = names.toString('utf8', nameAt, names.indexOf(0, nameAt));
    if (/tools|trigger|clip|skybox|nodraw|hint|areaportal/i.test(name)) continue;
    const lightAt = faces.readInt32LE(f + 20),
      width = lightAt < 0 ? 1 : faces.readInt32LE(f + 36) + 1,
      height = lightAt < 0 ? 1 : faces.readInt32LE(f + 40) + 1;
    if (width < 1 || height < 1 || width > 1024 || height > 1024)
      throw new Error('Invalid world-face lightmap dimensions');
    if (lightAt >= 0 && lightAt + width * height * 4 > lighting.length)
      throw new Error('Lightmap samples exceed lump');
    const vectors = Array.from({ length: 4 }, (_, row) =>
      Array.from({ length: 4 }, (_value, col) => texInfo.readFloatLE(ti + row * 16 + col * 4)),
    );
    const faceVertices = [];
    const edgeAt = faces.readInt32LE(f + 4),
      edgeCount = faces.readInt16LE(f + 8);
    for (let e = edgeAt; e < edgeAt + edgeCount; e++) {
      const edge = surfEdges.readInt32LE(e * 4),
        vertex = edges.readUInt16LE(Math.abs(edge) * 4 + (edge < 0 ? 2 : 0));
      faceVertices.push([0, 1, 2].map((axis) => vertices.readFloatLE(vertex * 12 + axis * 4)));
    }
    if (faceVertices.length < 3) continue;
    surfaces.push({
      id,
      material: name.split('/').at(-1).toUpperCase(),
      width,
      height,
      lightAt,
      vectors,
      textureWidth: texData.readInt32LE(td + 16) || 512,
      textureHeight: texData.readInt32LE(td + 20) || 512,
      minU: faces.readInt32LE(f + 28),
      minV: faces.readInt32LE(f + 32),
      vertices: faceVertices.toReversed(),
    });
  }
  // Two replicated border luxels keep bilinear filtering inside each face.
  const atlasWidth = 2048;
  let x = 0,
    y = 0,
    rowHeight = 0;
  for (const face of [...surfaces].sort((a, b) => b.height - a.height)) {
    if (x + face.width + 2 > atlasWidth) {
      x = 0;
      y += rowHeight;
      rowHeight = 0;
    }
    face.x = x + 1;
    face.y = y + 1;
    x += face.width + 2;
    rowHeight = Math.max(rowHeight, face.height + 2);
  }
  const atlasHeight = 2 ** Math.ceil(Math.log2(y + rowHeight));
  if (!Number.isFinite(atlasHeight) || atlasHeight > 4096)
    throw new Error('Invalid lighting atlas');
  const atlas = Buffer.alloc(atlasWidth * atlasHeight * 4);
  const grouped = new Map();
  for (const face of surfaces) {
    for (let v = -1; v <= face.height; v++)
      for (let u = -1; u <= face.width; u++) {
        const src =
          face.lightAt +
          (Math.min(face.height - 1, Math.max(0, v)) * face.width +
            Math.min(face.width - 1, Math.max(0, u))) *
            4;
        const dest = ((face.y + v) * atlasWidth + face.x + u) * 4;
        if (face.lightAt < 0) {
          // Retain unlit faces in replaced material groups with a neutral multiplier.
          atlas.set([255, 255, 255, 0], dest);
        } else lighting.copy(atlas, dest, src, src + 4);
      }
    if (!grouped.has(face.material)) grouped.set(face.material, []);
    const data = grouped.get(face.material);
    for (let i = 1; i + 1 < face.vertices.length; i++)
      for (const p of [face.vertices[0], face.vertices[i], face.vertices[i + 1]]) {
        const mapped = face.vectors.map(
          (vector) => vector[0] * p[0] + vector[1] * p[1] + vector[2] * p[2] + vector[3],
        );
        data.push(
          p[0] * 0.01905,
          p[2] * 0.01905,
          -p[1] * 0.01905,
          mapped[0] / face.textureWidth,
          1 - mapped[1] / face.textureHeight,
          (face.x + (face.lightAt < 0 ? 0 : mapped[2] - face.minU) + 0.5) / atlasWidth,
          (face.y + (face.lightAt < 0 ? 0 : mapped[3] - face.minV) + 0.5) / atlasHeight,
        );
      }
  }
  let offset = 0;
  const groups = [],
    values = [];
  for (const [material, data] of grouped) {
    groups.push({ material, offset, count: data.length / 7 });
    offset += data.length / 7;
    values.push(...data);
  }
  const geometry = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => geometry.writeFloatLE(value, index * 4));
  return {
    geometry,
    atlas,
    metadata: {
      version: 1,
      sourceSha256: sha(bsp),
      surfaces: surfaces.filter((face) => face.lightAt >= 0).length,
      unlitSurfaces: surfaces.filter((face) => face.lightAt < 0).length,
      atlasWidth,
      atlasHeight,
      groups,
      vertices: offset,
    },
  };
}
if (process.argv[1] === import.meta.filename) {
  const [source, output] = process.argv.slice(2);
  if (!source || !output) throw new Error('Pass BSP path and output directory');
  const result = extractLighting(await readFile(source));
  await mkdir(output, { recursive: true });
  for (const [name, bytes] of [
    ['world.bin.gz', gzipSync(result.geometry)],
    ['atlas.rgbe.gz', gzipSync(result.atlas)],
  ]) {
    await writeFile(join(output, name), bytes);
    result.metadata[name] = { bytes: bytes.length, sha256: sha(bytes) };
  }
  await writeFile(join(output, 'world.json'), `${JSON.stringify(result.metadata, null, 2)}\n`);
  console.log(result.metadata);
}
