import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BAY_LANDMARKS, inside, STREETS_SF } from './gta-geography';
import { blocked, BUILDINGS, GARAGE } from './gta-world';
import type { loadArchitecture } from './gta-architecture';
import { addBayLandmarks } from './gta-landmarks';

const material = (color: string, roughness = 0.85) =>
  new T.MeshStandardMaterial({ color, roughness });
function strip(
  a: { x: number; z: number },
  b: { x: number; z: number },
  width: number,
  height: number,
) {
  const length = Math.hypot(b.x - a.x, b.z - a.z),
    angle = -Math.atan2(b.z - a.z, b.x - a.x);
  const geometry = new T.PlaneGeometry(length + 0.5, width);
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++)
    uv.setXY(i, (uv.getX(i) * length) / 3, (uv.getY(i) * width) / 3);
  geometry.rotateX(-Math.PI / 2);
  geometry.rotateY(angle);
  geometry.translate((a.x + b.x) / 2, height, (a.z + b.z) / 2);
  return geometry;
}
export function buildCityscape(
  city: T.Group,
  architecture: Awaited<ReturnType<typeof loadArchitecture>>,
  models: Record<string, T.Group>,
) {
  const stone = material('#c9c0a9'),
    dark = material('#414c4f', 0.3),
    copper = material('#5e7b73');
  const curb = material('#a9a69b'),
    white = material('#d6d3bf'),
    yellow = material('#c2a45f');
  const boxGeometry = new T.BoxGeometry(1, 1, 1);
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
    const mesh = new T.Mesh(boxGeometry, m);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    mesh.rotation.y = angle;
    mesh.castShadow = h > 1;
    mesh.receiveShadow = true;
    city.add(mesh);
    return mesh;
  };
  box(0, -0.25, 200, 1800, 0.5, 2000, curb);
  box(0, -0.4, 1900, 1800, 0.5, 2200, material('#727b60'));
  box(-400, -0.3, -950, 950, 0.5, 400, material('#727b60'));
  const roadGeometries: T.BufferGeometry[] = [],
    shoulderGeometries: T.BufferGeometry[] = [];
  const props: { x: number; z: number; angle: number; model: string }[] = [];
  for (const [index, street] of STREETS_SF.entries()) {
    for (let j = 1; j < street.points.length; j++) {
      const a = street.points[j - 1],
        b = street.points[j],
        length = Math.hypot(b.x - a.x, b.z - a.z);
      if (length < 0.1) continue;
      roadGeometries.push(strip(a, b, street.width, 0.06));
      const nx = (b.z - a.z) / length,
        nz = -(b.x - a.x) / length,
        angle = -Math.atan2(b.z - a.z, b.x - a.x);
      if (length > 22)
        for (const side of [-1, 1]) {
          const offset = side * (street.width / 2 + 1.25),
            trim = 8 / length;
          const start = {
            x: a.x + (b.x - a.x) * trim + nx * offset,
            z: a.z + (b.z - a.z) * trim + nz * offset,
          };
          const end = {
            x: b.x - (b.x - a.x) * trim + nx * offset,
            z: b.z - (b.z - a.z) * trim + nz * offset,
          };
          shoulderGeometries.push(strip(start, end, 2.5, 0.18));
          box(
            (start.x + end.x) / 2,
            0.1,
            (start.z + end.z) / 2,
            Math.max(1, length - 16),
            0.2,
            2.5,
            curb,
            angle,
          );
        }
      if (street.width >= 17)
        for (let distance = 12; distance < length - 10; distance += 14) {
          const t = distance / length;
          box(a.x + (b.x - a.x) * t, 0.08, a.z + (b.z - a.z) * t, 4, 0.015, 0.13, yellow, angle);
        }
      if (j === 1 && index % 4 === 0)
        props.push({
          x: (a.x + b.x) / 2 + nx * (street.width / 2 + 1),
          z: (a.z + b.z) / 2 + nz * (street.width / 2 + 1),
          angle,
          model: 'lamp',
        });
      if (j === 1 && index % 11 === 0)
        props.push({
          x: a.x + nx * (street.width / 2 + 1),
          z: a.z + nz * (street.width / 2 + 1),
          angle,
          model: 'bin',
        });
      if (j === 1 && index % 13 === 0) {
        for (const [model, distance] of [
          ['bench', 14],
          ['hydrant', 6],
          ['signal', 3],
        ] as const) {
          const p = {
            x: a.x + ((b.x - a.x) * distance) / length + nx * (street.width / 2 + 1),
            z: a.z + ((b.z - a.z) * distance) / length + nz * (street.width / 2 + 1),
          };
          if (!blocked(p, 0.5)) props.push({ ...p, angle, model });
        }
      }
      if (j === 1 && index % 7 === 0 && length > 35) {
        for (let offset = -street.width / 2 + 1; offset < street.width / 2; offset += 2)
          box(
            a.x + ((b.x - a.x) * 8) / length + nx * offset,
            0.082,
            a.z + ((b.z - a.z) * 8) / length + nz * offset,
            3,
            0.015,
            0.8,
            white,
            angle,
          );
      }
    }
  }
  for (const [geometries, m] of [
    [shoulderGeometries, curb],
    [roadGeometries, architecture.asphalt],
  ] as const) {
    const merged = mergeGeometries(geometries);
    const mesh = new T.Mesh(merged, m);
    mesh.receiveShadow = true;
    city.add(mesh);
    geometries.forEach((g) => g.dispose());
  }
  // Only two landmarks replace surveyed masses. All other footprints keep their measured outline.
  for (const b of BUILDINGS) {
    if (BAY_LANDMARKS.slice(0, 2).some((p) => inside(p, b.ring))) continue;
    if (b.id.startsWith('nvidia-') || b.id === 'coit-tower' || inside({ x: 290, z: 256 }, b.ring))
      continue;
    architecture.building(b);
  }
  function label(
    text: string,
    x: number,
    y: number,
    z: number,
    width: number,
    angle = 0,
    color = '#214b40',
  ) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1024, 256);
    ctx.fillStyle = '#f0ead8';
    ctx.font = '600 95px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 512, 128, 960);
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    const mesh = new T.Mesh(
      new T.PlaneGeometry(width, width / 4),
      new T.MeshStandardMaterial({ map: texture, roughness: 0.8, side: T.DoubleSide }),
    );
    mesh.position.set(x, y, z);
    mesh.rotation.y = angle;
    city.add(mesh);
  }
  const pyramid = BAY_LANDMARKS[0];
  const shaft = new T.Mesh(new T.ConeGeometry(32, 190, 4, 1), stone);
  shaft.rotation.y = Math.PI / 4;
  shaft.position.set(pyramid.x, 95, pyramid.z);
  shaft.castShadow = true;
  shaft.receiveShadow = true;
  city.add(shaft);
  // Dark horizontal strips, flanking elevator wings and the tapered antenna.
  for (let y = 12; y < 178; y += 3.7) {
    const width = 45 * (1 - y / 190);
    for (const side of [-1, 1]) {
      box(pyramid.x, y, pyramid.z + (side * width) / 2, width, 1.1, 0.2, dark);
      box(pyramid.x + (side * width) / 2, y, pyramid.z, 0.2, 1.1, width, dark);
    }
  }
  box(pyramid.x - 16, 60, pyramid.z, 6, 120, 8, stone);
  box(pyramid.x + 16, 60, pyramid.z, 6, 120, 8, stone);
  const spire = new T.Mesh(new T.ConeGeometry(2, 22, 8), stone);
  spire.position.set(pyramid.x, 200, pyramid.z);
  city.add(spire);
  const ferry = BAY_LANDMARKS[1];
  const ferryStart = city.children.length;
  box(ferry.x, 10, ferry.z, 145, 20, 26, stone);
  box(ferry.x, 22, ferry.z, 150, 5, 30, copper);
  box(ferry.x, 40, ferry.z, 15, 36, 15, stone);
  box(ferry.x, 60, ferry.z, 18, 4, 18, stone);
  const cap = new T.Mesh(new T.ConeGeometry(12, 15, 4), copper);
  cap.rotation.y = Math.PI / 4;
  cap.position.set(ferry.x, 69, ferry.z);
  city.add(cap);
  for (let x = -65; x <= 65; x += 7)
    for (const side of [-1, 1]) {
      box(ferry.x + x, 9, ferry.z + side * 13.1, 4, 11, 0.2, dark);
      const arch = new T.Mesh(new T.TorusGeometry(2, 0.38, 5, 12, Math.PI), stone);
      arch.position.set(ferry.x + x, 14.5, ferry.z + side * 13.3);
      city.add(arch);
    }
  const clockCanvas = document.createElement('canvas');
  clockCanvas.width = 256;
  clockCanvas.height = 256;
  const cc = clockCanvas.getContext('2d')!;
  cc.fillStyle = '#e9dfbd';
  cc.beginPath();
  cc.arc(128, 128, 124, 0, Math.PI * 2);
  cc.fill();
  cc.strokeStyle = '#272c2a';
  cc.lineWidth = 8;
  cc.beginPath();
  cc.moveTo(128, 48);
  cc.lineTo(128, 128);
  cc.lineTo(181, 152);
  cc.stroke();
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    cc.beginPath();
    cc.moveTo(128 + Math.sin(a) * 103, 128 + Math.cos(a) * 103);
    cc.lineTo(128 + Math.sin(a) * 115, 128 + Math.cos(a) * 115);
    cc.stroke();
  }
  const clockTexture = new T.CanvasTexture(clockCanvas);
  clockTexture.colorSpace = T.SRGBColorSpace;
  const clockMaterial = new T.MeshStandardMaterial({ map: clockTexture, roughness: 0.8 });
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const c = new T.Mesh(new T.CircleGeometry(4.6, 32), clockMaterial);
    c.position.set(ferry.x + Math.sin(a) * 7.6, 52, ferry.z + Math.cos(a) * 7.6);
    c.rotation.y = a;
    city.add(c);
  }
  label('FERRY BUILDING', ferry.x, 19, ferry.z + 13.3, 35);
  const ferryGroup = new T.Group();
  const footprint = BUILDINGS.find((b) => inside(ferry, b.ring));
  if (footprint) {
    const edges = footprint.ring
      .map((p, i) => ({ a: p, b: footprint.ring[(i + 1) % footprint.ring.length] }))
      .sort(
        (a, b) =>
          Math.hypot(b.a.x - b.b.x, b.a.z - b.b.z) - Math.hypot(a.a.x - a.b.x, a.a.z - a.b.z),
      );
    ferryGroup.rotation.y = -Math.atan2(edges[0].b.z - edges[0].a.z, edges[0].b.x - edges[0].a.x);
  }
  for (const object of city.children.slice(ferryStart)) {
    object.position.x -= ferry.x;
    object.position.z -= ferry.z;
    ferryGroup.add(object);
  }
  ferryGroup.position.set(ferry.x, 0, ferry.z);
  city.add(ferryGroup);
  const orens = BAY_LANDMARKS[2];
  const front = { x: GARAGE.x, z: GARAGE.z };
  const a = Math.atan2(front.x - orens.x, front.z - orens.z);
  // A shopfront at the requested stop, not a claim to reproduce the restaurant interior.
  const sx = front.x - Math.sin(a) * 8,
    sz = front.z - Math.cos(a) * 8;
  box(sx, 2.5, sz, 12, 5, 1.5, stone, a);
  box(sx + Math.sin(a) * 0.8, 2, sz + Math.cos(a) * 0.8, 10, 3.4, 0.08, dark, a);
  label("OREN'S HUMMUS", sx + Math.sin(a), 4.6, sz + Math.cos(a), 11, a, '#404949');
  const awning = box(
    sx + Math.sin(a) * 2,
    4,
    sz + Math.cos(a) * 2,
    12,
    0.2,
    3,
    material('#696351'),
    a,
  );
  awning.rotation.x = 0.08;
  addBayLandmarks(city, label, architecture.foliage);
  label('AMD', 260, 22, 2173, 60, 0, '#353b41');
  label('SAN JOSE', 500, 7, 2570, 22);
  label('SANTA CLARA', 0, 7, 1600, 24);
  label('SAN PALOMA', GARAGE.x + 12, 4, GARAGE.z - 12, 3);
  for (let z = 1120; z < 2850; z += 70)
    props.push({ x: z < 1900 ? -20 : 525, z, angle: 0, model: 'palm' });
  for (const name of ['lamp', 'bin', 'palm', 'bench', 'hydrant', 'signal']) {
    const points = props.filter((p) => p.model === name),
      source = models[name];
    source.updateMatrixWorld(true);
    source.traverse((n) => {
      const m = n as T.Mesh;
      if (!m.isMesh) return;
      const mesh = new T.InstancedMesh(m.geometry, m.material, points.length);
      points.forEach((p, i) =>
        mesh.setMatrixAt(
          i,
          new T.Matrix4()
            .compose(
              new T.Vector3(p.x, 0.2, p.z),
              new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), p.angle),
              new T.Vector3(1, 1, 1),
            )
            .multiply(m.matrixWorld),
        ),
      );
      mesh.computeBoundingSphere();
      city.add(mesh);
    });
  }
  const batches = new Map<T.Material, T.Mesh[]>();
  for (const child of city.children)
    if (
      child instanceof T.Mesh &&
      child.geometry === boxGeometry &&
      !Array.isArray(child.material)
    ) {
      if (!batches.has(child.material)) batches.set(child.material, []);
      batches.get(child.material)!.push(child);
    }
  for (const [m, meshes] of batches) {
    const instances = new T.InstancedMesh(boxGeometry, m, meshes.length);
    meshes.forEach((mesh, i) => {
      mesh.updateMatrix();
      instances.setMatrixAt(i, mesh.matrix);
      city.remove(mesh);
    });
    instances.castShadow = meshes.some((mesh) => mesh.castShadow);
    instances.receiveShadow = true;
    instances.computeBoundingSphere();
    city.add(instances);
  }
  architecture.finish();
}
