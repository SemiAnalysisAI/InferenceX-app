import * as T from 'three';

import { mergeSimple } from './gta-actors';

// Street trees built from a photographic leaf-spray texture (taken from the
// GTA ficus asset) on dense alpha-tested cards, with canopy-shaped normals so
// they shade like a volume. Palms use a generated frond texture.

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function cylinderBetween(a: T.Vector3, b: T.Vector3, r0: number, r1: number, seg = 7) {
  const g = new T.CylinderGeometry(r1, r0, a.distanceTo(b), seg, 1, true);
  const dir = b.clone().sub(a).normalize();
  g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), dir));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

const BARK = new T.MeshStandardMaterial({ color: '#5b4d40', roughness: 0.95 });

export interface TreeSpec {
  height: number;
  trunk: number;
  radius: number;
  squash: number;
  cards: number;
  card: number;
  tint: [number, number, number];
  seed: number;
}

export const TREE_SPECS: TreeSpec[] = [
  // London plane / ficus street tree
  {
    height: 9,
    trunk: 3,
    radius: 3.6,
    squash: 0.85,
    cards: 90,
    card: 2.6,
    tint: [0.62, 0.78, 0.45],
    seed: 3,
  },
  // Young street tree
  {
    height: 6.5,
    trunk: 2.4,
    radius: 2.4,
    squash: 0.95,
    cards: 55,
    card: 2,
    tint: [0.66, 0.8, 0.48],
    seed: 11,
  },
  // Broad park tree
  {
    height: 12,
    trunk: 3.4,
    radius: 5.4,
    squash: 0.7,
    cards: 150,
    card: 3.2,
    tint: [0.52, 0.68, 0.4],
    seed: 29,
  },
];

export function makeTree(spec: TreeSpec, leaf: T.Texture) {
  const rand = rng(spec.seed);
  const group = new T.Group();
  const centre = new T.Vector3(0, spec.trunk + spec.radius * spec.squash * 0.9, 0);
  // Trunk and primary branches.
  const wood: T.BufferGeometry[] = [];
  const top = new T.Vector3((rand() - 0.5) * 0.4, spec.trunk, (rand() - 0.5) * 0.4);
  wood.push(
    cylinderBetween(
      new T.Vector3(0, -0.3, 0),
      top,
      0.2 + spec.radius * 0.03,
      0.15 + spec.radius * 0.02,
    ),
  );
  const branches = 5;
  for (let i = 0; i < branches; i++) {
    const a = (i / branches) * Math.PI * 2 + rand() * 0.8;
    const end = new T.Vector3(
      Math.cos(a) * spec.radius * 0.6,
      centre.y + (rand() - 0.2) * spec.radius * 0.5,
      Math.sin(a) * spec.radius * 0.6,
    );
    wood.push(cylinderBetween(top, end, 0.13, 0.05, 5));
  }
  const trunk = new T.Mesh(mergeSimple(wood), BARK);
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  group.add(trunk);
  // Leaf cards.
  const pos: number[] = [],
    nor: number[] = [],
    uv: number[] = [],
    col: number[] = [],
    idx: number[] = [];
  const q = new T.Quaternion(),
    e = new T.Euler(),
    p = new T.Vector3(),
    n = new T.Vector3();
  for (let i = 0; i < spec.cards; i++) {
    // Points biased toward the canopy surface.
    const u = rand() * 2 - 1,
      th = rand() * Math.PI * 2;
    const rr = rand() ** 0.35;
    const s = Math.sqrt(1 - u * u);
    const dir = new T.Vector3(s * Math.cos(th), u * spec.squash, s * Math.sin(th));
    const c = centre.clone().add(dir.clone().multiplyScalar(spec.radius * rr));
    e.set(rand() * Math.PI, rand() * Math.PI * 2, rand() * Math.PI);
    q.setFromEuler(e);
    const size = spec.card * (0.75 + rand() * 0.5);
    const shade = 0.8 + rand() * 0.4;
    const o = pos.length / 3;
    for (const [cx, cy] of [
      [-0.5, -0.5],
      [0.5, -0.5],
      [0.5, 0.5],
      [-0.5, 0.5],
    ]) {
      p.set(cx * size, cy * size, 0)
        .applyQuaternion(q)
        .add(c);
      pos.push(p.x, p.y, p.z);
      n.copy(p).sub(centre).normalize();
      n.y = n.y * 0.7 + 0.3;
      n.normalize();
      nor.push(n.x, n.y, n.z);
      uv.push(cx + 0.5, cy + 0.5);
      // Inner cards are darker (self shadowing).
      const ao = 0.55 + 0.45 * rr;
      col.push(spec.tint[0] * shade * ao, spec.tint[1] * shade * ao, spec.tint[2] * shade * ao);
    }
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  const leaves = new T.Mesh(
    g,
    new T.MeshStandardMaterial({
      map: leaf,
      alphaTest: 0.42,
      side: T.DoubleSide,
      vertexColors: true,
      roughness: 0.82,
      metalness: 0,
    }),
  );
  leaves.castShadow = true;
  leaves.receiveShadow = true;
  group.add(leaves);
  return group;
}

/** Canvas frond texture: a midrib with drooping leaflets on transparent background. */
function frondTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 512;
  const k = c.getContext('2d')!;
  k.clearRect(0, 0, 128, 512);
  k.strokeStyle = '#6d6a3a';
  k.lineWidth = 4;
  k.beginPath();
  k.moveTo(64, 0);
  k.lineTo(64, 512);
  k.stroke();
  for (let y = 10; y < 500; y += 7) {
    const len = 56 * Math.sin((y / 512) * Math.PI) + 8;
    for (const side of [-1, 1]) {
      const g = 90 + Math.floor(Math.random() * 50);
      k.strokeStyle = `rgb(${50 + Math.floor(Math.random() * 30)},${g},${40 + Math.floor(Math.random() * 20)})`;
      k.lineWidth = 3;
      k.beginPath();
      k.moveTo(64, y);
      k.quadraticCurveTo(64 + side * len * 0.6, y + 6, 64 + side * len, y + 22);
      k.stroke();
    }
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}

export function makePalm(seed = 5) {
  const rand = rng(seed);
  const group = new T.Group();
  const h = 12 + rand() * 3;
  const lean = new T.Vector3((rand() - 0.5) * 0.8, 0, (rand() - 0.5) * 0.8);
  const parts: T.BufferGeometry[] = [];
  const segs = 8;
  let prev = new T.Vector3(0, -0.3, 0);
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    const p = new T.Vector3(lean.x * t * t, h * t, lean.z * t * t);
    parts.push(cylinderBetween(prev, p, 0.34 - 0.1 * (t - 1 / segs), 0.34 - 0.1 * t, 9));
    prev = p;
  }
  const trunk = new T.Mesh(
    mergeSimple(parts),
    new T.MeshStandardMaterial({ color: '#7b6a55', roughness: 0.95 }),
  );
  trunk.castShadow = true;
  group.add(trunk);
  const tex = frondTexture();
  const pos: number[] = [],
    nor: number[] = [],
    uv: number[] = [],
    idx: number[] = [];
  const fronds = 18;
  for (let f = 0; f < fronds; f++) {
    const a = (f / fronds) * Math.PI * 2 + rand() * 0.3;
    const up = 0.5 - rand() * 0.9;
    const len = 4 + rand() * 1.2;
    const width = 1.4;
    const o = pos.length / 3;
    const steps = 8;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const droop = up * t - t * t * 1.4;
      const cx = prev.x + Math.cos(a) * len * t,
        cz = prev.z + Math.sin(a) * len * t,
        cy = prev.y + droop * len * 0.5;
      const px = -Math.sin(a) * width * 0.5 * (1 - t * 0.6),
        pz = Math.cos(a) * width * 0.5 * (1 - t * 0.6);
      pos.push(cx - px, cy, cz - pz, cx + px, cy, cz + pz);
      nor.push(0, 1, 0, 0, 1, 0);
      uv.push(0, 1 - t, 1, 1 - t);
      if (s) {
        const b = o + (s - 1) * 2;
        idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
      }
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const leaves = new T.Mesh(
    g,
    new T.MeshStandardMaterial({ map: tex, alphaTest: 0.4, side: T.DoubleSide, roughness: 0.8 }),
  );
  leaves.castShadow = true;
  group.add(leaves);
  return group;
}
