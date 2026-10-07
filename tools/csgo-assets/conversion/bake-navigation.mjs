import fs from 'node:fs';
import * as THREE from 'three';
import { MeshBVH, acceleratedRaycast, SAH } from 'three-mesh-bvh';
import { Navigation } from '../navigation.mjs';
THREE.Mesh.prototype.raycast = acceleratedRaycast;
const input = process.argv[2],
  out = process.argv[3];
const file = fs.readFileSync(input),
  jsonSize = file.readUInt32LE(12),
  j = JSON.parse(file.subarray(20, 20 + jsonSize).toString()),
  bin = file.subarray(28 + jsonSize);
function accessor(i) {
  const a = j.accessors[i],
    v = j.bufferViews[a.bufferView],
    size = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type],
    types = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array },
    Type = types[a.componentType];
  return new Type(
    bin.buffer,
    bin.byteOffset + (v.byteOffset || 0) + (a.byteOffset || 0),
    a.count * size,
  );
}
const positions = [],
  v = new THREE.Vector3();
let removed = 0,
  triangles = 0;
function visit(i, parent) {
  const n = j.nodes[i],
    matrix = new THREE.Matrix4();
  if (n.matrix) matrix.fromArray(n.matrix);
  else
    matrix.compose(
      new THREE.Vector3().fromArray(n.translation || [0, 0, 0]),
      new THREE.Quaternion().fromArray(n.rotation || [0, 0, 0, 1]),
      new THREE.Vector3().fromArray(n.scale || [1, 1, 1]),
    );
  matrix.premultiply(parent);
  if (n.mesh !== undefined)
    for (const p of j.meshes[n.mesh].primitives) {
      if (
        /tools|trigger|clip|skybox|nodraw|hint|areaportal/i.test(
          j.materials[p.material]?.name || '',
        )
      )
        continue;
      const a = accessor(p.attributes.POSITION),
        indices =
          p.indices === undefined
            ? Array.from({ length: a.length / 3 }, (_, k) => k)
            : accessor(p.indices);
      for (let k = 0; k < indices.length; k += 3) {
        const tri = [];
        for (let q = 0; q < 3; q++) {
          v.fromArray(a, indices[k + q] * 3).applyMatrix4(matrix);
          tri.push(v.x, v.y, v.z);
        }
        if (tri.some((x) => !Number.isFinite(x) || Math.abs(x) > 500)) {
          removed++;
          continue;
        }
        positions.push(...tri);
        triangles++;
      }
    }
  for (const child of n.children || []) visit(child, matrix);
}
for (const i of j.scenes[j.scene || 0].nodes) visit(i, new THREE.Matrix4());
console.log({ triangles, removed });
const g = new THREE.BufferGeometry();
g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
g.computeBoundingBox();
console.log(g.boundingBox);
g.boundsTree = new MeshBVH(g, { strategy: SAH, maxLeafSize: 12, maxDepth: 64 });
const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })),
  ray = new THREE.Raycaster();
ray.firstHitOnly = true;
const vec = (p, h = 0) => new THREE.Vector3(p.x, p.y + h, p.z);
function hit(a, b) {
  ray.firstHitOnly = true;
  ray.set(a, b.clone().sub(a).normalize());
  ray.far = a.distanceTo(b);
  return ray.intersectObject(mesh, false)[0];
}
const nav = new Navigation(0.85);
for (let ix = -51; ix <= 43; ix++) {
  for (let iz = -77; iz <= 27; iz++) {
    ray.firstHitOnly = false;
    ray.set(new THREE.Vector3(ix * 0.85, 22, iz * 0.85), new THREE.Vector3(0, -1, 0));
    ray.far = 30;
    const hits = ray.intersectObject(mesh, false),
      heights = [];
    for (const h of hits) {
      const y = h.point.y;
      if (
        y > 9 ||
        y < -6 ||
        h.face.normal.y < 0.65 ||
        heights.some((height) => Math.abs(height - y) < 0.1)
      )
        continue;
      const p = { x: ix * 0.85, y, z: iz * 0.85 };
      if (hit(vec(p, 0.15), vec(p, 1.3))) continue;
      if (
        [
          [0.23, 0],
          [-0.23, 0],
          [0, 0.23],
          [0, -0.23],
        ].some(([x, z]) => hit(vec(p, 0.7), new THREE.Vector3(p.x + x, y + 0.7, p.z + z)))
      )
        continue;
      nav.add(ix, iz, y);
      heights.push(y);
    }
  }
  if (ix % 10 === 0) console.log(ix, nav.nodes.length);
}
nav.connect((a, b) => {
  if (hit(vec(a, 0.4), vec(b, 0.4)) || hit(vec(a, 1), vec(b, 1))) return false;
  const dx = b.x - a.x,
    dz = b.z - a.z,
    distance = Math.hypot(dx, dz);
  for (const sign of [-1, 1]) {
    const offset = new THREE.Vector3(
      (-dz / distance) * 0.27 * sign,
      0,
      (dx / distance) * 0.27 * sign,
    );
    if (hit(vec(a, 0.4).add(offset), vec(b, 0.4).add(offset))) return false;
    if (hit(vec(a, 1).add(offset), vec(b, 1).add(offset))) return false;
  }
  return true;
});
// Decoration tops can pass floor probes but are unreachable from the play area.
const seen = new Set(),
  components = [];
for (const n of nav.nodes) {
  if (seen.has(n.id)) continue;
  const queue = [n.id];
  seen.add(n.id);
  for (const current of queue)
    for (const id of nav.nodes[current].edges)
      if (!seen.has(id)) {
        seen.add(id);
        queue.push(id);
      }
  components.push(queue);
}
components.sort((a, b) => b.length - a.length);
const keep = new Set(components[0]),
  remap = new Map(components[0].map((id, i) => [id, i]));
nav.nodes = components[0].map((id) => ({
  ...nav.nodes[id],
  id: remap.get(id),
  edges: nav.nodes[id].edges.filter((e) => keep.has(e)).map((e) => remap.get(e)),
}));
fs.writeFileSync(out, JSON.stringify({ cell: nav.cell, nodes: nav.nodes }));
const floats = g.attributes.position.array;
fs.writeFileSync(out.replace('.json', '.collision.bin'), Buffer.from(floats.buffer));
console.log('BAKED', nav.nodes.length);
