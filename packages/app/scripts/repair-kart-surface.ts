import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseSurface, SURFACE } from '../src/components/kart/kart-surface';

// The exported course has baked world-space vertices. polygon8 is MainRoad,
// polygon1 is the curb, and polygon0 in the course (not sky) is ef_dushBoard.
// Restore their drivable triangles instead of treating the bank as a wall.
const directory = new URL('../public/decorative/kart/', import.meta.url);
const gltf = JSON.parse(readFileSync(new URL('luigi-circuit.gltf', directory), 'utf8'));
const buffers = gltf.buffers.map((b: { uri: string }) =>
  Buffer.from(b.uri.split(',')[1], 'base64'),
);
const path = fileURLToPath(new URL('luigi-circuit-surface.bin', directory));
const bytes = readFileSync(path);
const map = parseSurface(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const course = gltf.nodes[gltf.nodes[gltf.scenes[0].nodes[0]].children[0]];
let changed = 0;
for (const [name, type] of [
  ['polygon8', SURFACE.road],
  ['polygon1', SURFACE.curb],
  ['polygon0', SURFACE.boost],
] as const) {
  const node = course.children
    .map((i: number) => gltf.nodes[i])
    .find((n: { name: string }) => n.name === name);
  const primitive = gltf.meshes[node.mesh].primitives[0];
  if (primitive.indices !== undefined) throw new Error('Expected non-indexed course mesh');
  const accessor = gltf.accessors[primitive.attributes.POSITION];
  const view = gltf.bufferViews[accessor.bufferView];
  const data = buffers[view.buffer];
  const vertex = (i: number) =>
    [0, 1, 2].map((axis) =>
      data.readFloatLE(
        (view.byteOffset ?? 0) +
          (accessor.byteOffset ?? 0) +
          i * (view.byteStride ?? 12) +
          axis * 4,
      ),
    );
  for (let t = 0; t < accessor.count; t += 3) {
    const [a, b, c] = [vertex(t), vertex(t + 1), vertex(t + 2)];
    const den = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
    if (Math.abs(den) < 1e-6) continue;
    const gx = ((b[1] - a[1]) * (c[2] - a[2]) - (c[1] - a[1]) * (b[2] - a[2])) / den;
    const gz = ((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / den;
    const slope = Math.hypot(gx, gz);
    if (slope > 1.15) continue; // Keep vertical rails and curb faces blocked.
    const surface = type !== SURFACE.boost && slope > 0.25 ? SURFACE.bank : type;
    const minI = Math.max(0, Math.floor((Math.min(a[0], b[0], c[0]) - map.x0) / map.res));
    const maxI = Math.min(
      map.width - 1,
      Math.ceil((Math.max(a[0], b[0], c[0]) - map.x0) / map.res),
    );
    const minJ = Math.max(0, Math.floor((Math.min(a[2], b[2], c[2]) - map.z0) / map.res));
    const maxJ = Math.min(
      map.height - 1,
      Math.ceil((Math.max(a[2], b[2], c[2]) - map.z0) / map.res),
    );
    for (let j = minJ; j <= maxJ; j++)
      for (let i = minI; i <= maxI; i++) {
        const x = map.x0 + (i + 0.5) * map.res,
          z = map.z0 + (j + 0.5) * map.res;
        const u = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / den;
        const v = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / den;
        if (u < -1e-5 || v < -1e-5 || u + v > 1.00001) continue;
        const y = u * a[1] + v * b[1] + (1 - u - v) * c[1];
        const index = j * map.width + i;
        // Do not punch through a higher structure covering the road.
        if (map.y[index] / 32 > y + 0.5) continue;
        if (type !== SURFACE.boost && map.type[index] === SURFACE.boost) continue;
        if (map.type[index] !== surface || map.y[index] !== Math.round(y * 32)) changed++;
        map.type[index] = surface;
        map.y[index] = Math.round(y * 32);
      }
  }
}
Buffer.from(map.type).copy(bytes, 28);
for (let i = 0; i < map.y.length; i++) bytes.writeInt16LE(map.y[i], 28 + map.type.length + i * 2);
writeFileSync(path, bytes);
console.log(`Updated ${changed} drivable surface samples.`);
