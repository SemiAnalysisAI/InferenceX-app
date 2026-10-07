import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { NVIDIA_BUILDINGS, STREETS_SF } from './gta-geography';
import { blocked } from './gta-world';

type Label = (
  text: string,
  x: number,
  y: number,
  z: number,
  width: number,
  angle?: number,
  color?: string,
) => void;
/** Original, condensed architectural interpretations, not imported surveyed replicas. */
export function addBayLandmarks(city: T.Group, label: Label, foliage: T.Texture) {
  const group = new T.Group();
  group.name = 'Bay Area landmark architecture';
  city.add(group);
  const white = new T.MeshStandardMaterial({ color: '#dedbd1', roughness: 0.62 });
  const steel = new T.MeshStandardMaterial({ color: '#adb4b6', metalness: 0.65, roughness: 0.35 });
  const glass = new T.MeshStandardMaterial({ color: '#789fa6', metalness: 0.7, roughness: 0.2 });
  const dark = new T.MeshStandardMaterial({ color: '#263739', metalness: 0.35, roughness: 0.55 });
  const leaves = new T.MeshStandardMaterial({
    map: foliage,
    alphaTest: 0.4,
    side: T.DoubleSide,
    roughness: 1,
  });
  const leafPlane = new T.PlaneGeometry(11, 11);
  const red = new T.MeshStandardMaterial({ color: '#aa4931', metalness: 0.25, roughness: 0.6 });
  const boxGeo = new T.BoxGeometry(1, 1, 1);
  const add = (g: T.BufferGeometry, m: T.Material, x: number, y: number, z: number) => {
    const mesh = new T.Mesh(g, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  const box = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    m: T.Material,
    angle = 0,
  ) => {
    const mesh = add(boxGeo, m, x, y, z);
    mesh.scale.set(w, h, d);
    mesh.rotation.y = angle;
    return mesh;
  };
  const beam = (a: T.Vector3, b: T.Vector3, r: number, m: T.Material) => {
    const midpoint = a.clone().add(b).multiplyScalar(0.5);
    const mesh = add(
      new T.CylinderGeometry(r, r, a.distanceTo(b), 6),
      m,
      midpoint.x,
      midpoint.y,
      midpoint.z,
    );
    mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  };
  const tree = (x: number, z: number, size = 1) => {
    for (let i = 0; i < 3; i++) {
      const plane = add(leafPlane, leaves, x, 5.5 * size, z);
      plane.scale.setScalar(size);
      plane.rotation.y = (i * Math.PI) / 3;
    }
  };
  // Selected street trees add depth at eye level without drawing a city-wide forest.
  for (const [i, s] of STREETS_SF.entries()) {
    if (i % 5 !== 0 || s.points.length < 2) continue;
    const a = s.points[0],
      b = s.points[1],
      length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length < 30) continue;
    const x = (a.x + b.x) / 2 + ((b.z - a.z) / length) * (s.width / 2 + 1.5);
    const z = (a.z + b.z) / 2 - ((b.x - a.x) / length) * (s.width / 2 + 1.5);
    if (!blocked({ x, z }, 1.2)) tree(x, z, 0.85 + (i % 3) * 0.12);
  }
  // Two distinct campus volumes, continuous glass walls and folded triangular roofs.
  for (const [index, b] of NVIDIA_BUILDINGS.entries()) {
    const center = new T.Vector3(b.x, b.h + 4, b.z);
    const roofPositions: number[] = [];
    b.ring.forEach((p, i) => {
      const q = b.ring[(i + 1) % b.ring.length],
        length = Math.hypot(q.x - p.x, q.z - p.z);
      const count = Math.ceil(length / 5),
        angle = -Math.atan2(q.z - p.z, q.x - p.x);
      for (let n = 0; n < count; n++) {
        const f = (n + 0.5) / count,
          x = p.x + (q.x - p.x) * f,
          z = p.z + (q.z - p.z) * f;
        box(x, b.h / 2, z, length / count - 0.16, b.h, 0.25, glass, angle);
        box(x, b.h / 2, z, 0.12, b.h, 0.5, white, angle);
      }
      for (let y = 4; y < b.h; y += 4)
        box((p.x + q.x) / 2, y, (p.z + q.z) / 2, length, 0.16, 0.5, steel, angle);
      box((p.x + q.x) / 2, 0.7, (p.z + q.z) / 2, length, 1.4, 0.8, white, angle);
      // Subdivide each fan triangle to create visible folds and narrow skylights.
      for (let n = 0; n < 8; n++) {
        const a = new T.Vector3(
          p.x + ((q.x - p.x) * n) / 8,
          b.h + Math.sin(n * 1.7) * 1.8,
          p.z + ((q.z - p.z) * n) / 8,
        );
        const c = new T.Vector3(
          p.x + ((q.x - p.x) * (n + 1)) / 8,
          b.h + Math.sin((n + 1) * 1.7) * 1.8,
          p.z + ((q.z - p.z) * (n + 1)) / 8,
        );
        const mid = a.clone().add(c).multiplyScalar(0.5).lerp(center, 0.48);
        mid.y += 2;
        for (const tri of [
          [a, c, mid],
          [a, mid, center],
          [mid, c, center],
        ])
          roofPositions.push(...tri.flatMap((v) => v.toArray()));
        beam(a, center, 0.12, steel);
      }
    });
    const roof = new T.BufferGeometry();
    roof.setAttribute('position', new T.Float32BufferAttribute(roofPositions, 3));
    roof.computeVertexNormals();
    const roofMaterial = white.clone();
    roofMaterial.side = T.DoubleSide;
    roofMaterial.flatShading = true;
    add(roof, roofMaterial, 0, 0, 0);
    label(
      index === 0 ? 'NVIDIA · ENDEAVOR' : 'NVIDIA · VOYAGER',
      b.x,
      5,
      index === 0 ? 1891 : 1731,
      40,
      0,
      '#2c3e29',
    );
  }
  // Photovoltaic trellis, column supports, planted plaza and approach.
  box(-90, 0.15, 1735, 115, 0.3, 100, white);
  for (let x = -135; x <= -45; x += 30) {
    box(x, 8, 1725, 0.5, 16, 0.5, steel);
    for (let z = 1705; z <= 1745; z += 10) box(x, 16, z, 28, 0.22, 8, dark);
  }
  for (let z = 1580; z <= 1910; z += 22) {
    tree(-25, z, 1.15);
    box(-25, 0.2, z, 5, 0.4, 5, white);
  }
  for (let x = -320; x < -60; x += 26) tree(x, 1940, 1.2);
  label('NVIDIA HQ', -22, 3, 1860, 18, Math.PI / 2, '#314629');
  label('VISITOR PLAZA', -36, 2, 1790, 12, Math.PI / 2);

  // Salesforce's rounded taper and illuminated crown.
  const sx = 290,
    sz = 256;
  for (let level = 0; level < 20; level++) {
    const r = 22 * (1 - (level / 23) ** 2 * 0.65);
    const section = add(
      new T.CylinderGeometry(r * 0.97, r, 12, 28, 1, true),
      glass,
      sx,
      6 + level * 12,
      sz,
    );
    section.scale.z = 0.85;
    const ring = add(new T.TorusGeometry(r, 0.22, 4, 28), steel, sx, 12 + level * 12, sz);
    ring.rotation.x = Math.PI / 2;
    ring.scale.y = 0.85;
  }
  const crown = new T.MeshStandardMaterial({
    color: '#d1e8e8',
    emissive: '#90b4b9',
    emissiveIntensity: 0.4,
    wireframe: true,
  });
  add(new T.SphereGeometry(10, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), crown, sx, 240, sz);
  label('SALESFORCE TOWER', sx, 4, sz + 23, 22);

  // Coit Tower is moved into the compact northern extension.
  add(new T.CylinderGeometry(9, 10, 4, 32), white, -600, 2, -1060);
  add(new T.CylinderGeometry(6, 7, 46, 32), white, -600, 27, -1060);
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    add(
      new T.CylinderGeometry(0.65, 0.9, 42, 8),
      white,
      -600 + Math.sin(a) * 6.5,
      27,
      -1060 + Math.cos(a) * 6.5,
    );
    box(-600 + Math.sin(a) * 6, 43, -1060 + Math.cos(a) * 6, 2, 6, 0.2, dark, a);
  }
  add(new T.CylinderGeometry(7.5, 7.5, 2, 32), white, -600, 51, -1060);
  label('COIT TOWER', -600, 3, -1048, 16);
  for (let i = 0; i < 10; i++) tree(-580 + i * 7, -1100, 1.2);

  // Compressed Golden Gate panorama beyond the playable lookout.
  const bx = -1150,
    bz = -1350,
    span = 600;
  box(bx, 22, bz, span, 3, 23, dark);
  for (const x of [bx - span * 0.28, bx + span * 0.28]) {
    for (const z of [bz - 12, bz + 12]) box(x, 64, z, 7, 122, 8, red);
    for (let y = 35; y < 120; y += 24) box(x, y, bz, 7, 4, 32, red);
  }
  for (const z of [bz - 12, bz + 12]) {
    let previous: T.Vector3 | null = null;
    for (let i = 0; i <= 60; i++) {
      const x = bx - span / 2 + (i * span) / 60;
      const t = (x - (bx - span * 0.28)) / (span * 0.56);
      const y = t < 0 ? 120 + t * 150 : t > 1 ? 120 - (t - 1) * 150 : 30 + 90 * (2 * t - 1) ** 2;
      const p = new T.Vector3(x, Math.max(25, y), z);
      if (previous) beam(previous, p, 0.65, red);
      beam(new T.Vector3(x, 24, z), p, 0.17, red);
      previous = p;
    }
  }
  label('GOLDEN GATE VISTA', -800, 3, -1043, 20, Math.PI);
  // San Jose: recognizable civic rotunda, tower and palms around a plaza.
  box(590, 40, 2680, 42, 80, 26, glass);
  for (let y = 4; y < 80; y += 4) box(590, y, 2693.5, 43, 0.3, 0.4, white);
  add(new T.CylinderGeometry(17, 17, 17, 32, 1, true), glass, 545, 8.5, 2680);
  const dome = add(
    new T.SphereGeometry(17, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    glass,
    545,
    17,
    2680,
  );
  dome.scale.y = 0.5;
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    box(545 + Math.sin(a) * 17, 8.5, 2680 + Math.cos(a) * 17, 0.22, 17, 0.22, white);
  }
  label('SAN JOSE · CIVIC PLAZA', 545, 3, 2700, 27);
  for (let i = 0; i < 7; i++) tree(535 + i * 13, 2770, 1.2);
  label('101 SOUTH', 0, 10, 1210, 12, Math.PI, '#215d47');
  label('SANTA CLARA / SAN JOSE', 0, 7, 1210, 24, Math.PI, '#215d47');
  box(-15, 5, 1210, 0.4, 10, 0.4, steel);
  box(15, 5, 1210, 0.4, 10, 0.4, steel);
  label('NVIDIA · NEXT LEFT', 0, 6, 1540, 22, Math.PI, '#215d47');

  // Keep hundreds of repeated structural pieces in a few material batches.
  const batches = new Map<T.Material, T.Mesh[]>();
  group.children.forEach((child) => {
    if (child instanceof T.Mesh && !Array.isArray(child.material)) {
      const list = batches.get(child.material) || [];
      list.push(child);
      batches.set(child.material, list);
    }
  });
  const originals = new Set<T.BufferGeometry>();
  for (const [m, meshes] of batches) {
    const geometries = meshes.map((mesh) => {
      mesh.updateMatrix();
      originals.add(mesh.geometry);
      const copy = mesh.geometry.clone().applyMatrix4(mesh.matrix);
      if (!copy.index) return copy;
      const plain = copy.toNonIndexed();
      copy.dispose();
      return plain;
    });
    const merged = mergeGeometries(geometries);
    const mesh = new T.Mesh(merged, m);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    meshes.forEach((original) => group.remove(original));
    geometries.forEach((g) => g.dispose());
  }
  originals.forEach((g) => g.dispose());
}
