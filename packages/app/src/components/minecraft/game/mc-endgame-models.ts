import * as THREE from 'three';
import { boxGeometry } from './mc-models';

export type EndgameModel = 'dragon' | 'crystal' | 'blaze' | 'enderman';

/** Pixel-space cuboids with Java texture UVs; animation pivots stay in world units. */
export function buildEndgameModel(kind: EndgameModel, texture: THREE.Texture) {
  const object = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    alphaTest: 0.1,
    side: THREE.DoubleSide,
  });
  const materials: THREE.Material[] = [material];
  const geometries: THREE.BufferGeometry[] = [];
  const box = (
    parent: THREE.Object3D,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    u = 0,
    v = 0,
  ) => {
    const image = texture.image as { width: number; height: number };
    const geometry = boxGeometry([{ x, y, z, w, h, d, u, v }], image.width, image.height);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.scale.setScalar(1 / 16);
    parent.add(mesh);
    geometries.push(geometry);
    return mesh;
  };
  if (kind === 'enderman') {
    box(object, -4, 38, -4, 8, 8, 8, 0, 0);
    box(object, -4, 26, -2, 8, 12, 4, 32, 16);
    for (const side of [-1, 1]) {
      const leg = box(object, side < 0 ? -3 : 1, 0, -1, 2, 26, 2, 0, 16);
      leg.name = `leg${side}`;
      box(object, side < 0 ? -6 : 4, 10, -1, 2, 28, 2, 56, 0);
    }
  } else if (kind === 'blaze') {
    box(object, -4, 18, -4, 8, 8, 8);
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 2;
      const rod = box(object, Math.cos(a) * 8, (i % 3) * 7, Math.sin(a) * 8, 2, 8, 2, 0, 16);
      rod.name = `rod${i}`;
    }
  } else if (kind === 'crystal') {
    box(object, -8, 0, -8, 16, 4, 16, 0, 16);
    const core = new THREE.Group();
    core.name = 'core';
    core.position.y = 1;
    object.add(core);
    box(core, -4, -4, -4, 8, 8, 8, 32, 0);
    const wire = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.3, 1.3, 1.3)),
      new THREE.LineBasicMaterial({ color: '#ffaaff' }),
    );
    core.add(wire);
    geometries.push(wire.geometry);
    materials.push(wire.material);
    const beamGeometry = new THREE.CylinderGeometry(0.035, 0.035, 1, 4);
    const beamMaterial = new THREE.MeshBasicMaterial({
      color: '#dc8dff',
      transparent: true,
      opacity: 0.65,
    });
    const beam = new THREE.Mesh(beamGeometry, beamMaterial);
    beam.name = 'beam';
    object.add(beam);
    geometries.push(beamGeometry);
    materials.push(beamMaterial);
  } else {
    box(object, -12, 0, -16, 24, 24, 64, 0, 0);
    for (let i = 0; i < 4; i++) box(object, -5, 10, -28 - i * 9, 10, 10, 10, 192, 104);
    box(object, -8, 6, -72, 16, 16, 16, 112, 30);
    box(object, -6, 5, -86, 12, 7, 16, 176, 44);
    for (let i = 0; i < 8; i++)
      box(object, -5 + i * 0.4, 6, 48 + i * 10, 10 - i * 0.8, 10 - i * 0.8, 12, 192, 104);
    for (const side of [-1, 1]) {
      const wing = new THREE.Group();
      wing.name = `wing${side}`;
      wing.position.set(side * 0.7, 1.25, 0);
      object.add(wing);
      box(wing, side < 0 ? -56 : 0, 0, 0, 56, 0, 56, -56, 88);
      box(wing, side < 0 ? -112 : 56, 0, 0, 56, 0, 56, -56, 144);
      box(wing, side < 0 ? -112 : 0, 0, -2, 112, 3, 3, 112, 88);
      box(object, side < 0 ? -16 : 8, -12, 24, 8, 24, 8, 112, 0);
    }
  }
  return { object, materials, geometries, kind };
}
