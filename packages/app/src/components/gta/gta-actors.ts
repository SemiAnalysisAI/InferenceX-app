import * as T from 'three';

// Vehicle preparation. GTADevs car exports ship without wheels, so the axle
// positions are measured from the wheel-arch cut-outs in the body and
// procedural tyres and alloy rims are fitted.

export interface WheelSpot {
  x: number;
  y: number;
  z: number;
  r: number;
  w: number;
}
export interface CarTemplate {
  root: T.Group;
  paint: Set<T.Material>;
  wheels: WheelSpot[];
  length: number;
  width: number;
  inner: { position: T.Vector3; rotation: number };
}

const v = new T.Vector3();

function meshes(root: T.Object3D) {
  const out: T.Mesh[] = [];
  root.updateMatrixWorld(true);
  root.traverse((n) => {
    if ((n as T.Mesh).isMesh) out.push(n as T.Mesh);
  });
  return out;
}

function materialsOf(m: T.Mesh) {
  return Array.isArray(m.material) ? m.material : [m.material];
}

/** Wraps a loaded car so it faces -z, sits on y = 0 and has measured wheels. */
export function prepareCar(scene: T.Object3D, match?: CarTemplate): CarTemplate {
  const inner = scene;
  if (match) return matchCar(inner, match);
  const box = new T.Box3().setFromObject(inner);
  const size = box.getSize(new T.Vector3());
  const center = box.getCenter(new T.Vector3());
  // Some exports face along x; rotate so the long axis is z.
  if (size.x > size.z * 1.15) {
    inner.rotation.y += Math.PI / 2;
    inner.updateMatrixWorld(true);
    box.setFromObject(inner);
    box.getSize(size);
    box.getCenter(center);
  }
  inner.position.sub(new T.Vector3(center.x, box.min.y, center.z));
  inner.updateMatrixWorld(true);
  const list = meshes(inner);
  const halfW = size.x / 2,
    halfL = size.z / 2;
  // Profile of the lowest outer-side vertex along the car's length.
  const bins = 120;
  const low = new Float32Array(bins).fill(Infinity);
  for (const m of list) {
    const mat = materialsOf(m)[0] as T.MeshStandardMaterial;
    if (mat.transparent) continue;
    const p = m.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
      if (Math.abs(v.x) < halfW * 0.78) continue;
      const b = Math.floor(((v.z + halfL) / size.z) * bins);
      if (b >= 0 && b < bins) low[b] = Math.min(low[b], v.y);
    }
  }
  const finite = [...low].filter(Number.isFinite);
  const sill = finite.sort((a, b) => a - b)[Math.floor(finite.length * 0.3)] ?? 0.3;
  const arches: { a: number; b: number; top: number }[] = [];
  let start = -1;
  for (let i = 0; i <= bins; i++) {
    const open = i < bins && (!Number.isFinite(low[i]) || low[i] > sill + 0.18);
    if (open && start < 0) start = i;
    if (!open && start >= 0) {
      if (i - start >= 6) {
        let top = 0;
        for (let k = start; k < i; k++) if (Number.isFinite(low[k])) top = Math.max(top, low[k]);
        arches.push({ a: start, b: i, top });
      }
      start = -1;
    }
  }
  const toZ = (b: number) => (b / bins) * size.z - halfL;
  let front: (typeof arches)[number] | undefined = arches
    .filter((a) => toZ((a.a + a.b) / 2) < -halfL * 0.25)
    .sort((a, b) => b.b - b.a - (a.b - a.a))[0];
  let rear: (typeof arches)[number] | undefined = arches
    .filter((a) => toZ((a.a + a.b) / 2) > halfL * 0.25)
    .sort((a, b) => b.b - b.a - (a.b - a.a))[0];
  let r = Math.max(0.33, Math.min(0.48, size.y * 0.24));
  let fz = -halfL * 0.6,
    rz = halfL * 0.58;
  let ok = false;
  if (front && rear) {
    const f = toZ((front.a + front.b) / 2),
      b = toZ((rear.a + rear.b) / 2);
    const base = (b - f) / size.z;
    if (base > 0.5 && base < 0.72) {
      ok = true;
      fz = f;
      rz = b;
      const archW = Math.min(toZ(front.b) - toZ(front.a), toZ(rear.b) - toZ(rear.a));
      r = Math.max(0.33, Math.min(0.48, archW * 0.43));
    }
  }
  if (!ok) {
    front = undefined;
    rear = undefined;
  }
  // Raise the body so the tyres touch the ground under the arches.
  const archTop = front && rear ? Math.min(front.top, rear.top) : sill + r * 1.2;
  const lift = Math.max(0, r * 2 + 0.03 - archTop);
  inner.position.y += lift;
  const w = Math.max(0.2, Math.min(0.32, size.x * 0.12));
  const wx = halfW - w / 2 - 0.04;
  const wheels: WheelSpot[] = [
    { x: wx, y: r, z: fz, r, w },
    { x: -wx, y: r, z: fz, r, w },
    { x: wx, y: r, z: rz, r, w },
    { x: -wx, y: r, z: rz, r, w },
  ];
  // Body paint: the opaque material with the most vertices on the outer skin.
  const tris = new Map<T.Material, number>();
  for (const m of list) {
    m.castShadow = true;
    m.receiveShadow = true;
    const p = m.geometry.attributes.position;
    let outer = 0;
    for (let i = 0; i < p.count; i += 3) {
      v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
      if (Math.abs(v.x) > halfW * 0.82 && v.y > sill + 0.15) outer++;
    }
    for (const mat of materialsOf(m)) {
      const sm = mat as T.MeshStandardMaterial;
      if (mat.transparent || (sm.color && sm.color.getHSL({ h: 0, s: 0, l: 0 }).l < 0.25)) continue;
      tris.set(mat, (tris.get(mat) || 0) + outer);
    }
  }
  const paint = new Set<T.Material>();
  const best = [...tris.entries()].sort((a, b) => b[1] - a[1])[0];
  if (best) paint.add(best[0]);
  for (const m of list)
    for (const mat of materialsOf(m)) {
      const s = mat as T.MeshStandardMaterial;
      if (paint.has(s)) {
        s.metalness = 0.55;
        s.roughness = 0.28;
      }
      if (s.transparent) {
        s.roughness = 0.05;
        s.metalness = 0.2;
        s.depthWrite = false;
      }
    }
  const root = new T.Group();
  root.add(inner);
  return {
    root,
    paint,
    wheels,
    length: size.z,
    width: size.x,
    inner: { position: inner.position.clone(), rotation: inner.rotation.y },
  };
}

/** Apply a full-detail template's placement to its low-poly LOD. */
function matchCar(inner: T.Object3D, match: CarTemplate): CarTemplate {
  inner.position.copy(match.inner.position);
  inner.rotation.y = match.inner.rotation;
  const tris = new Map<T.Material, number>();
  for (const m of meshes(inner)) {
    m.castShadow = false;
    const count = (m.geometry.index ?? m.geometry.attributes.position).count / 3;
    for (const mat of materialsOf(m))
      if (!mat.transparent) tris.set(mat, (tris.get(mat) || 0) + count);
  }
  const paint = new Set<T.Material>();
  const best = [...tris.entries()].sort((a, b) => b[1] - a[1])[0];
  if (best) {
    paint.add(best[0]);
    const s = best[0] as T.MeshStandardMaterial;
    s.metalness = 0.55;
    s.roughness = 0.3;
  }
  const root = new T.Group();
  root.add(inner);
  return { ...match, root, paint };
}

/** Unit wheel (radius 1, width 1) lying on the x axis: tyre and rim geometries. */
export function wheelGeometries() {
  const profile: T.Vector2[] = [];
  const rr = 0.68;
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * Math.PI;
    profile.push(
      new T.Vector2(1 - 0.12 * (1 - Math.sin(a)) - (1 - Math.sin(a)) * 0.05, -0.5 * Math.cos(a)),
    );
  }
  profile.unshift(new T.Vector2(rr, -0.5));
  profile.push(new T.Vector2(rr, 0.5));
  const tyre = new T.LatheGeometry(profile, 28);
  tyre.rotateZ(Math.PI / 2);
  const parts: T.BufferGeometry[] = [];
  const disc = new T.CylinderGeometry(rr, rr, 0.1, 28);
  disc.rotateZ(Math.PI / 2);
  disc.translate(0.42, 0, 0);
  parts.push(disc);
  const hub = new T.CylinderGeometry(0.16, 0.18, 0.2, 12);
  hub.rotateZ(Math.PI / 2);
  hub.translate(0.48, 0, 0);
  parts.push(hub);
  for (let i = 0; i < 5; i++) {
    const spoke = new T.BoxGeometry(0.1, 0.16, rr * 0.9);
    spoke.translate(0.5, 0, rr * 0.45);
    spoke.rotateX((i / 5) * Math.PI * 2);
    parts.push(spoke);
  }
  const rim = mergeSimple(parts);
  return { tyre, rim };
}

export function mergeSimple(parts: T.BufferGeometry[]) {
  const pos: number[] = [],
    nor: number[] = [],
    idx: number[] = [];
  for (const p0 of parts) {
    const p = p0.index ? p0 : p0;
    const base = pos.length / 3;
    const P = p.attributes.position,
      N = p.attributes.normal;
    for (let i = 0; i < P.count; i++) {
      pos.push(P.getX(i), P.getY(i), P.getZ(i));
      nor.push(N.getX(i), N.getY(i), N.getZ(i));
    }
    if (p.index) for (let i = 0; i < p.index.count; i++) idx.push(base + p.index.getX(i));
    else for (let i = 0; i < P.count; i++) idx.push(base + i);
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

export const TYRE_MAT = new T.MeshStandardMaterial({ color: '#161616', roughness: 0.92 });
export const RIM_MAT = new T.MeshStandardMaterial({
  color: '#b9bec4',
  roughness: 0.28,
  metalness: 0.95,
});

const WHEELS = wheelGeometries();

/** A drivable or traffic car instance with its own paint and spinning wheels. */
export function instantiateCar(t: CarTemplate, paint?: T.Color) {
  const root = t.root.clone(true);
  if (paint) {
    const replaced = new Map<T.Material, T.Material>();
    root.traverse((n) => {
      const m = n as T.Mesh;
      if (!m.isMesh) return;
      const swap = (mat: T.Material) => {
        if (!t.paint.has(mat)) return mat;
        let c = replaced.get(mat);
        if (!c) {
          c = mat.clone();
          (c as T.MeshStandardMaterial).color.copy(paint);
          replaced.set(mat, c);
        }
        return c;
      };
      m.material = Array.isArray(m.material) ? m.material.map(swap) : swap(m.material);
    });
  }
  const wheels: T.Group[] = [];
  for (const w of t.wheels) {
    const pivot = new T.Group();
    pivot.position.set(w.x, w.y, w.z);
    const spin = new T.Group();
    const tyre = new T.Mesh(WHEELS.tyre, TYRE_MAT);
    const rim = new T.Mesh(WHEELS.rim, RIM_MAT);
    const side = w.x > 0 ? 1 : -1;
    spin.scale.set(w.w * side, w.r, w.r);
    tyre.castShadow = true;
    spin.add(tyre, rim);
    pivot.add(spin);
    root.add(pivot);
    wheels.push(pivot);
  }
  return {
    root,
    update(spinAngle: number, steer: number) {
      wheels.forEach((p, i) => {
        p.rotation.y = i < 2 ? steer : 0;
        p.children[0].rotation.x = -spinAngle;
      });
    },
  };
}

interface Part {
  geometry: T.BufferGeometry;
  material: T.Material | T.Material[];
  local: T.Matrix4;
  paint: boolean;
}

/** Instanced copies of a template (parked cars, props, trees) with an optional paint colour. */
export class InstancedSet {
  readonly meshes: T.InstancedMesh[] = [];
  private readonly parts: Part[] = [];
  private readonly m = new T.Matrix4();
  count = 0;
  readonly capacity: number;
  constructor(
    template: T.Object3D,
    capacity: number,
    paint = new Set<T.Material>(),
    wheels: WheelSpot[] = [],
    shadows = true,
  ) {
    this.capacity = capacity;
    template.updateMatrixWorld(true);
    const inv = new T.Matrix4().copy(template.matrixWorld).invert();
    template.traverse((n) => {
      const mesh = n as T.Mesh;
      if (!mesh.isMesh) return;
      const mats = materialsOf(mesh);
      this.parts.push({
        geometry: mesh.geometry,
        material: mesh.material,
        local: new T.Matrix4().multiplyMatrices(inv, mesh.matrixWorld),
        paint: mats.some((x) => paint.has(x)),
      });
    });
    for (const w of wheels) {
      const local = new T.Matrix4().compose(
        new T.Vector3(w.x, w.y, w.z),
        new T.Quaternion(),
        new T.Vector3(w.w * (w.x > 0 ? 1 : -1), w.r, w.r),
      );
      this.parts.push(
        { geometry: WHEELS.tyre, material: TYRE_MAT, local, paint: false },
        { geometry: WHEELS.rim, material: RIM_MAT, local, paint: false },
      );
    }
    for (const p of this.parts) {
      const im = new T.InstancedMesh(p.geometry, p.material, capacity);
      im.count = 0;
      im.castShadow = shadows;
      im.receiveShadow = true;
      im.frustumCulled = false;
      if (p.paint)
        im.instanceColor = new T.InstancedBufferAttribute(
          new Float32Array(capacity * 3).fill(1),
          3,
        );
      this.meshes.push(im);
    }
  }
  begin() {
    this.count = 0;
  }
  add(matrix: T.Matrix4, color?: T.Color) {
    if (this.count >= this.capacity) return;
    const i = this.count++;
    this.parts.forEach((p, k) => {
      this.m.multiplyMatrices(matrix, p.local);
      const im = this.meshes[k];
      im.setMatrixAt(i, this.m);
      if (color && im.instanceColor) im.setColorAt(i, color);
    });
  }
  end() {
    for (const im of this.meshes) {
      im.count = this.count;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }
}
