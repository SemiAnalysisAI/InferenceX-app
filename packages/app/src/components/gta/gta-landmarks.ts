import * as T from 'three';

import { buildingMaterial, type TextureSet } from './gta-materials';
import type { Point, World } from './gta-world';

// Hand-modelled San Francisco and Santa Clara landmarks, placed at their real
// coordinates. Proportions follow published dimensions.

interface Ctx {
  tex: TextureSet;
  base: string;
  signal: AbortSignal;
}

const ORANGE = new T.MeshStandardMaterial({ color: '#b8402e', roughness: 0.55, metalness: 0.35 });
const STEEL = new T.MeshStandardMaterial({ color: '#8b9399', roughness: 0.5, metalness: 0.6 });
const STONE = new T.MeshStandardMaterial({ color: '#d9d3c4', roughness: 0.85 });
const DARK = new T.MeshStandardMaterial({ color: '#2b2e33', roughness: 0.7 });
const DECK = new T.MeshStandardMaterial({ color: '#3a3b3d', roughness: 0.9 });
const COPPER = new T.MeshStandardMaterial({ color: '#8e7a4e', roughness: 0.45, metalness: 0.7 });
const GOLD = new T.MeshStandardMaterial({ color: '#d4af5a', roughness: 0.3, metalness: 1 });

/** Facade geometry (compatible with the building shader) for a tapered polygon prism. */
function prism(
  ring: Point[],
  y0: number,
  y1: number,
  topScale: number,
  style: number,
  color: T.ColorRepresentation,
  height = y1 - y0,
  centre?: Point,
) {
  const c = centre ?? {
    x: ring.reduce((s, p) => s + p.x, 0) / ring.length,
    z: ring.reduce((s, p) => s + p.z, 0) / ring.length,
  };
  const col = new T.Color(color);
  const pos: number[] = [],
    uv: number[] = [],
    aB: number[] = [],
    cl: number[] = [],
    idx: number[] = [];
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[i],
      b = ring[(i + 1) % n];
    const at = { x: c.x + (a.x - c.x) * topScale, z: c.z + (a.z - c.z) * topScale };
    const bt = { x: c.x + (b.x - c.x) * topScale, z: c.z + (b.z - c.z) * topScale };
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const lt = Math.hypot(bt.x - at.x, bt.z - at.z);
    const o = pos.length / 3;
    pos.push(a.x, y0, a.z, b.x, y0, b.z, bt.x, y1, bt.z, at.x, y1, at.z);
    const inset = (len - lt) / 2;
    uv.push(0, 0, len, 0, len - inset, y1 - y0, inset, y1 - y0);
    for (let k = 0; k < 4; k++) {
      aB.push(len, style, 0.37, height);
      cl.push(col.r, col.g, col.b);
    }
    // Outward winding for counter-clockwise rings in x/z.
    idx.push(o, o + 2, o + 1, o, o + 3, o + 2);
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setAttribute('aB', new T.Float32BufferAttribute(aB, 4));
  g.setAttribute('color', new T.Float32BufferAttribute(cl, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function square(c: Point, half: number, angle = 0): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < 4; i++) {
    const a = angle + Math.PI / 4 + (i * Math.PI) / 2;
    out.push({
      x: c.x + Math.cos(a) * half * Math.SQRT2,
      z: c.z - Math.sin(a) * half * Math.SQRT2,
    });
  }
  return out;
}

function circle(c: Point, r: number, n: number): Point[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return { x: c.x + Math.cos(a) * r, z: c.z - Math.sin(a) * r };
  });
}

function mesh(g: T.BufferGeometry, m: T.Material, shadow = true) {
  const x = new T.Mesh(g, m);
  x.castShadow = shadow;
  x.receiveShadow = true;
  return x;
}

function boxAt(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  m: T.Material,
  ry = 0,
) {
  const b = mesh(new T.BoxGeometry(w, h, d), m);
  b.position.set(x, y, z);
  b.rotation.y = ry;
  return b;
}

/** Canvas text sign texture. */
export function signTexture(
  lines: { text: string; font: string; color: string; y: number }[],
  w: number,
  h: number,
  bg: string | null,
) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const l of lines) {
    ctx.font = l.font;
    ctx.fillStyle = l.color;
    ctx.fillText(l.text, w / 2, l.y);
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

async function imageTexture(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Unable to load ${url}`);
  const bitmap = await createImageBitmap(await response.blob(), { imageOrientation: 'flipY' });
  const t = new T.Texture(bitmap);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

function signPanel(
  map: T.Texture,
  w: number,
  h: number,
  glow = 0.6,
  back: T.ColorRepresentation = '#30343a',
) {
  const g = new T.Group();
  const face = new T.Mesh(
    new T.PlaneGeometry(w, h),
    new T.MeshStandardMaterial({
      map,
      emissiveMap: map,
      emissive: new T.Color('#ffffff').multiplyScalar(glow),
      roughness: 0.4,
      transparent: true,
      alphaTest: 0.05,
    }),
  );
  face.position.z = 0.06;
  const board = mesh(
    new T.BoxGeometry(w + 0.2, h + 0.2, 0.1),
    new T.MeshStandardMaterial({ color: back, roughness: 0.6 }),
  );
  g.add(board, face);
  return g;
}

/** Nearest building facade to a point: returns the wall midpoint and outward angle. */
function facadeNear(world: World, p: Point, range = 30) {
  let best = { x: p.x, z: p.z, angle: 0, d: Infinity, top: 10, base: world.height(p.x, p.z) };
  for (const b of world.buildings) {
    if (
      p.x < b.minX - range ||
      p.x > b.maxX + range ||
      p.z < b.minZ - range ||
      p.z > b.maxZ + range
    )
      continue;
    const n = b.pts.length / 2;
    let area = 0;
    for (let i = 0, j = n - 1; i < n; j = i++)
      area += b.pts[j * 2] * b.pts[i * 2 + 1] - b.pts[i * 2] * b.pts[j * 2 + 1];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = b.pts[i * 2],
        az = b.pts[i * 2 + 1],
        bx = b.pts[j * 2],
        bz = b.pts[j * 2 + 1];
      const dx = bx - ax,
        dz = bz - az,
        len = Math.hypot(dx, dz);
      if (len < 4) continue;
      const t = Math.max(0.15, Math.min(0.85, ((p.x - ax) * dx + (p.z - az) * dz) / (len * len)));
      const qx = ax + dx * t,
        qz = az + dz * t;
      const d = Math.hypot(p.x - qx, p.z - qz);
      if (d < best.d) {
        let nx = dz / len,
          nz = -dx / len;
        if (area < 0) {
          nx = -nx;
          nz = -nz;
        }
        best = { x: qx, z: qz, angle: Math.atan2(nx, nz), d, top: b.base + b.height, base: b.base };
      }
    }
  }
  return best;
}

function suspension(
  world: World,
  a: Point,
  b: Point,
  towers: number[],
  towerH: number,
  deckH: number,
  width: number,
  mat: T.Material,
  anchorsAtEnds = true,
) {
  const g = new T.Group();
  const dx = b.x - a.x,
    dz = b.z - a.z,
    len = Math.hypot(dx, dz);
  const ang = Math.atan2(dx, dz);
  const ux = dx / len,
    uz = dz / len;
  const px = -uz,
    pz = ux;
  const at = (t: number, off = 0, y = 0) =>
    new T.Vector3(a.x + dx * t + px * off, y, a.z + dz * t + pz * off);
  // Deck with stiffening truss.
  const deck = mesh(new T.BoxGeometry(width, 1.2, len), DECK);
  deck.position.copy(at(0.5, 0, deckH));
  deck.rotation.y = ang;
  g.add(deck);
  const truss = mesh(new T.BoxGeometry(width + 0.6, 7.6, len), mat);
  truss.position.copy(at(0.5, 0, deckH - 4.4));
  truss.rotation.y = ang;
  truss.scale.x = 1;
  g.add(truss);
  for (const side of [-1, 1]) {
    const rail = mesh(new T.BoxGeometry(0.3, 1.2, len), mat);
    rail.position.copy(at(0.5, (side * width) / 2, deckH + 1.2));
    rail.rotation.y = ang;
    g.add(rail);
  }
  // Towers: two stepped legs joined by portal struts.
  for (const t of towers) {
    const ground = Math.max(0, world.height(a.x + dx * t, a.z + dz * t));
    for (const side of [-1, 1]) {
      const steps = 4;
      for (let s = 0; s < steps; s++) {
        const y0 = ground + ((towerH - ground) * s) / steps,
          y1 = ground + ((towerH - ground) * (s + 1)) / steps;
        const w = 11 - s * 1.6;
        const leg = mesh(new T.BoxGeometry(w * 0.8, y1 - y0, w), mat);
        leg.position.copy(at(t, side * (width / 2 + 2.5), (y0 + y1) / 2));
        leg.rotation.y = ang;
        g.add(leg);
      }
    }
    for (const y of [deckH + 20, deckH + 60, deckH + 100, towerH - 8].filter(
      (v) => v < towerH - 4,
    )) {
      const strut = mesh(new T.BoxGeometry(width + 4, 5, 6), mat);
      strut.position.copy(at(t, 0, y));
      strut.rotation.y = ang;
      g.add(strut);
    }
  }
  // Main cables (parabolic) and vertical suspenders.
  const cablePts = (side: number) => {
    const pts: T.Vector3[] = [];
    const t0 = towers[0],
      t1 = towers.at(-1) ?? 1;
    const off = side * (width / 2 + 2.5);
    const N = 120;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      let y: number;
      if (t < t0) y = anchorsAtEnds ? deckH + 4 + ((towerH - deckH - 4) * t) / t0 : towerH;
      else if (t > t1)
        y = anchorsAtEnds ? deckH + 4 + ((towerH - deckH - 4) * (1 - t)) / (1 - t1) : towerH;
      else {
        // Parabola between consecutive towers.
        let k = 0;
        while (k < towers.length - 2 && t > towers[k + 1]) k++;
        const ta = towers[k],
          tb = towers[k + 1];
        const u = (t - ta) / (tb - ta);
        y = towerH - (towerH - deckH - 3) * 4 * u * (1 - u);
      }
      pts.push(at(t, off, y));
    }
    return pts;
  };
  const lines: number[] = [];
  for (const side of [-1, 1]) {
    const pts = cablePts(side);
    const tube = mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 240, 0.6, 6), mat, false);
    g.add(tube);
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i];
      if (p.y - deckH < 2) continue;
      for (let k = 0; k < 2; k++) {
        const q = p.clone().lerp(pts[i + 1], k * 0.5);
        lines.push(q.x, q.y, q.z, q.x, deckH + 1, q.z);
      }
    }
  }
  const lg = new T.BufferGeometry();
  lg.setAttribute('position', new T.Float32BufferAttribute(lines, 3));
  g.add(
    new T.LineSegments(
      lg,
      new T.LineBasicMaterial({ color: (mat as T.MeshStandardMaterial).color }),
    ),
  );
  return g;
}

/** Canvas texture of triangular roof panels with skylights (NVIDIA campus). */
function facetTexture() {
  const c = document.createElement('canvas');
  c.height = 512;
  c.width = c.height;
  const g = c.getContext('2d')!;
  g.fillStyle = '#3a3e43';
  g.fillRect(0, 0, 512, 512);
  const n = 8,
    s = 512 / n,
    hgt = s;
  for (let j = 0; j < n; j++)
    for (let i = -1; i <= n; i++) {
      const x = i * s + (j % 2 ? s / 2 : 0),
        y = j * hgt;
      for (const up of [true, false]) {
        const sky = (i * 7 + j * 13 + (up ? 3 : 0)) % 5 === 0;
        const shade = 46 + ((i * 31 + j * 17 + (up ? 11 : 0)) % 9) * 3;
        g.fillStyle = sky ? '#6d7f8c' : `rgb(${shade},${shade + 3},${shade + 7})`;
        g.beginPath();
        if (up) {
          g.moveTo(x, y + hgt);
          g.lineTo(x + s / 2, y);
        } else {
          g.moveTo(x + s / 2, y);
          g.lineTo(x + s * 1.5, y);
        }
        g.lineTo(x + s, y + hgt);
        g.closePath();
        g.fill();
        g.strokeStyle = '#1f2226';
        g.lineWidth = 3;
        g.stroke();
      }
    }
  const t = new T.CanvasTexture(c);
  t.wrapT = T.RepeatWrapping;
  t.wrapS = t.wrapT;
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** White precast quartz panels with narrow punched windows (Transamerica). */
function precastTexture() {
  const c = document.createElement('canvas');
  c.height = 128;
  c.width = c.height;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ece9e1';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#2a3036';
  g.fillRect(40, 30, 48, 74);
  g.fillStyle = '#d6d2c8';
  g.fillRect(0, 118, 128, 10);
  const t = new T.CanvasTexture(c);
  t.wrapT = T.RepeatWrapping;
  t.wrapS = t.wrapT;
  t.repeat.set(1 / 1.7, 1 / 3.8);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Curtain-wall glass with mullions. */
function curtainTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#3f5562');
  grad.addColorStop(1, '#22313a');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#c9ced1';
  for (let x = 0; x < 256; x += 64) g.fillRect(x, 0, 5, 256);
  for (let y = 0; y < 256; y += 128) g.fillRect(0, y, 256, 7);
  const t = new T.CanvasTexture(c);
  t.wrapT = T.RepeatWrapping;
  t.wrapS = t.wrapT;
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/**
 * Replace an OSM footprint with a faceted, sloping roof building, approximating
 * NVIDIA's triangle-panelled Endeavor and Voyager roofs.
 */
function facetedBuilding(
  world: World,
  index: number,
  wall: number,
  peak: number,
  roofMat: T.Material,
  wallMat: T.Material,
  tilt: Point,
) {
  const b = world.buildings[index];
  const P = b.pts;
  const n = P.length / 2;
  let cx = 0,
    cz = 0;
  for (let k = 0; k < n; k++) {
    cx += P[k * 2];
    cz += P[k * 2 + 1];
  }
  cx /= n;
  cz /= n;
  const base = b.base;
  const g = new T.Group();
  // Walls.
  const wp: number[] = [],
    wu: number[] = [];
  let run = 0;
  for (let k = 0; k < n; k++) {
    const ax = P[k * 2],
      az = P[k * 2 + 1],
      bx = P[((k + 1) % n) * 2],
      bz = P[((k + 1) % n) * 2 + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const u0 = run / 6,
      u1 = (run + len) / 6;
    run += len;
    wp.push(
      ax,
      base - 1,
      az,
      bx,
      base - 1,
      bz,
      bx,
      base + wall,
      bz,
      ax,
      base - 1,
      az,
      bx,
      base + wall,
      bz,
      ax,
      base + wall,
      az,
    );
    wu.push(u0, 0, u1, 0, u1, (wall + 1) / 8, u0, 0, u1, (wall + 1) / 8, u0, (wall + 1) / 8);
  }
  const wg = new T.BufferGeometry();
  wg.setAttribute('position', new T.Float32BufferAttribute(wp, 3));
  wg.setAttribute('uv', new T.Float32BufferAttribute(wu, 2));
  wg.computeVertexNormals();
  g.add(mesh(wg, wallMat));
  // Roof: concentric rings rising toward an offset apex.
  const rings = 6;
  const ax0 = cx + tilt.x,
    az0 = cz + tilt.z;
  const ring = (r: number) => {
    const t = r / rings;
    const y = base + wall + (peak - wall) * Math.sin((t * Math.PI) / 2);
    const out: number[] = [];
    for (let k = 0; k < n; k++) {
      const px = P[k * 2],
        pz = P[k * 2 + 1];
      out.push(px + (ax0 - px) * t * 0.96, y, pz + (az0 - pz) * t * 0.96);
    }
    return out;
  };
  const rp: number[] = [];
  for (let r = 0; r < rings; r++) {
    const a = ring(r),
      c2 = ring(r + 1);
    for (let k = 0; k < n; k++) {
      const k2 = (k + 1) % n;
      rp.push(
        ...vtx(a, k),
        ...vtx(c2, k2),
        ...vtx(a, k2),
        ...vtx(a, k),
        ...vtx(c2, k),
        ...vtx(c2, k2),
      );
    }
  }
  const top = ring(rings);
  for (let k = 1; k < n - 1; k++)
    rp.push(
      top[0],
      top[1],
      top[2],
      top[k * 3],
      top[k * 3 + 1],
      top[k * 3 + 2],
      top[(k + 1) * 3],
      top[(k + 1) * 3 + 1],
      top[(k + 1) * 3 + 2],
    );
  const ru: number[] = [];
  for (let i = 0; i < rp.length; i += 3) ru.push(rp[i] / 30, rp[i + 2] / 30);
  const rg = new T.BufferGeometry();
  rg.setAttribute('position', new T.Float32BufferAttribute(rp, 3));
  rg.setAttribute('uv', new T.Float32BufferAttribute(ru, 2));
  rg.computeVertexNormals();
  g.add(mesh(rg, roofMat));
  return g;
}

const vtx = (arr: number[], i: number) => [arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]];

export async function buildLandmarks(world: World, ctx: Ctx) {
  const group = new T.Group();
  group.name = 'landmarks';
  const skip = new Set<number>();
  const L = world.landmarks;
  const facade = buildingMaterial(ctx.tex);
  facade.side = T.DoubleSide;
  const h = (p: Point) => world.height(p.x, p.z);

  // OSM footprints replaced by the hand-built models below.
  for (const [id, r] of [
    ['transamerica', 24],
    ['coit', 10],
  ] as const) {
    const c = L[id];
    world.buildings.forEach((b, index) => {
      if (b.height + b.minHeight < 12) return;
      if (c.x < b.minX - r || c.x > b.maxX + r || c.z < b.minZ - r || c.z > b.maxZ + r) return;
      if (world.inside(b, c.x, c.z) || world.edgeDistance(b, c.x, c.z) < r) skip.add(index);
    });
  }

  // Transamerica Pyramid: 260 m, tapering square plan with elevator wings.
  {
    const c = L.transamerica;
    const y = h(c);
    const quartz = new T.MeshStandardMaterial({
      map: precastTexture(),
      roughness: 0.6,
      side: T.DoubleSide,
    });
    const g = prism(square(c, 27, 0.02), y - 2, y + 212, 0.2, 4, '#ece8de', 212);
    group.add(mesh(g, quartz));
    const cap = mesh(new T.ConeGeometry(5.4 * Math.SQRT2, 48, 4, 1), STONE);
    cap.position.set(c.x, y + 236, c.z);
    cap.rotation.y = Math.PI / 4 + 0.02;
    group.add(cap);
    for (const side of [-1, 1]) {
      const wing = mesh(
        prism(
          square({ x: c.x + side * 9, z: c.z }, 3.2, 0.02),
          y + 60,
          y + 228,
          1,
          4,
          '#e5e1d6',
          168,
        ),
        quartz,
      );
      wing.position.x = 0;
      group.add(wing);
    }
    const base = mesh(prism(square(c, 30, 0.02), y - 2, y + 7, 1, 1, '#d8d2c4', 7), quartz);
    group.add(base);
  }

  // Coit Tower: 64 m fluted concrete column on Telegraph Hill.
  {
    const c = L.coit;
    const y = h(c);
    group.add(mesh(prism(circle(c, 5.6, 24), y, y + 58, 0.96, 4, '#e9e0c9', 58), facade));
    const crown = mesh(new T.CylinderGeometry(5.9, 5.6, 6, 24), STONE);
    crown.position.set(c.x, y + 61, c.z);
    group.add(crown);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      group.add(
        boxAt(
          1.6,
          3.2,
          0.5,
          c.x + Math.cos(a) * 5.75,
          y + 60.5,
          c.z + Math.sin(a) * 5.75,
          DARK,
          -a + Math.PI / 2,
        ),
      );
    }
    const top = mesh(new T.CylinderGeometry(4.6, 5.9, 1.6, 24), STONE);
    top.position.set(c.x, y + 64.8, c.z);
    group.add(top);
    group.add(boxAt(26, 1.2, 26, c.x, y + 0.6, c.z, STONE));
  }

  // Ferry Building clock tower (75 m) with lit clock faces.
  {
    const c = L.ferry;
    const y = Math.max(3, h(c));
    const angle = -0.82;
    group.add(mesh(prism(square(c, 6.5, angle), y, y + 60, 0.92, 4, '#e7dfcf', 60), facade));
    const cap = mesh(new T.ConeGeometry(6.6, 13, 4), COPPER);
    cap.position.set(c.x, y + 69, c.z);
    cap.rotation.y = angle + Math.PI / 4;
    group.add(cap);
    const clock = signTexture([], 256, 256, null);
    const cv = clock.image as HTMLCanvasElement;
    const k = cv.getContext('2d')!;
    k.fillStyle = '#f4efe2';
    k.beginPath();
    k.arc(128, 128, 120, 0, Math.PI * 2);
    k.fill();
    k.strokeStyle = '#222';
    k.lineWidth = 6;
    k.stroke();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      k.fillRect(128 + Math.cos(a) * 98 - 4, 128 + Math.sin(a) * 98 - 4, 8, 8);
    }
    k.lineWidth = 8;
    k.beginPath();
    k.moveTo(128, 128);
    k.lineTo(128, 50);
    k.moveTo(128, 128);
    k.lineTo(180, 140);
    k.stroke();
    clock.needsUpdate = true;
    for (let i = 0; i < 4; i++) {
      const a = angle + (i * Math.PI) / 2;
      const face = new T.Mesh(
        new T.CircleGeometry(3.4, 32),
        new T.MeshStandardMaterial({
          map: clock,
          emissiveMap: clock,
          emissive: '#fff3d0',
          emissiveIntensity: 0.4,
        }),
      );
      face.position.set(c.x + Math.sin(a) * 6.15, y + 52, c.z + Math.cos(a) * 6.15);
      face.rotation.y = a;
      group.add(face);
    }
  }

  // City Hall dome (94 m), gilded lantern.
  {
    const c = L.city_hall;
    // Beaux-Arts body (the OSM footprint is often a courtyard outline only).
    const hall = world.buildingAt(c.x, c.z, 8);
    if (hall < 0 || world.buildings[hall].height < 18) {
      if (hall >= 0) skip.add(hall);
      const body = prism(square(c, 46, 0), h(c) - 1, h(c) + 26, 1, 4, '#ddd6c6', 27);
      body.scale(1.3, 1, 1);
      body.translate(-c.x * 0.3, 0, 0);
      group.add(
        mesh(
          body,
          new T.MeshStandardMaterial({
            map: precastTexture(),
            color: '#ebe4d4',
            roughness: 0.75,
            side: T.DoubleSide,
          }),
        ),
      );
      group.add(boxAt(122, 1.2, 94, c.x, h(c) + 26.6, c.z, STONE));
      group.add(boxAt(40, 30, 50, c.x, h(c) + 15, c.z, STONE));
    }
    const y = h(c) + 30;
    group.add(mesh(prism(circle(c, 21, 32), y, y + 22, 1, 4, '#ddd6c6', 22), facade));
    const dome = mesh(new T.SphereGeometry(21, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), COPPER);
    dome.scale.y = 1.25;
    dome.position.set(c.x, y + 22, c.z);
    group.add(dome);
    const lantern = mesh(new T.CylinderGeometry(3.4, 4, 10, 16), STONE);
    lantern.position.set(c.x, y + 52, c.z);
    group.add(lantern);
    const spire = mesh(new T.ConeGeometry(2.2, 9, 16), GOLD);
    spire.position.set(c.x, y + 61.5, c.z);
    group.add(spire);
  }

  // Palace of Fine Arts rotunda.
  {
    const c = L.palace;
    const y = h(c);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const col = mesh(new T.CylinderGeometry(1.4, 1.6, 24, 12), STONE);
      col.position.set(c.x + Math.cos(a) * 17, y + 12, c.z + Math.sin(a) * 17);
      group.add(col);
    }
    const drum = mesh(
      new T.CylinderGeometry(19, 19, 8, 8),
      new T.MeshStandardMaterial({ color: '#c99d72', roughness: 0.85 }),
    );
    drum.position.set(c.x, y + 28, c.z);
    group.add(drum);
    const dome = mesh(
      new T.SphereGeometry(17, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      new T.MeshStandardMaterial({ color: '#b98a64', roughness: 0.8 }),
    );
    dome.position.set(c.x, y + 32, c.z);
    group.add(dome);
  }

  // Sutro Tower: 298 m three-legged mast in red and white bands.
  {
    const c = L.sutro;
    const y = h(c);
    const red = new T.MeshStandardMaterial({ color: '#c0392b', roughness: 0.6, metalness: 0.4 });
    const white = new T.MeshStandardMaterial({ color: '#e8e8e4', roughness: 0.6, metalness: 0.4 });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      for (let s = 0; s < 10; s++) {
        const y0 = (s / 10) * 298,
          y1 = ((s + 1) / 10) * 298;
        const r0 = 30 * (1 - s / 14),
          r1 = 30 * (1 - (s + 1) / 14);
        const p0 = new T.Vector3(c.x + Math.cos(a) * r0, y + y0, c.z + Math.sin(a) * r0);
        const p1 = new T.Vector3(c.x + Math.cos(a) * r1, y + y1, c.z + Math.sin(a) * r1);
        const leg = mesh(new T.CylinderGeometry(1, 1.2, p0.distanceTo(p1), 6), s % 2 ? white : red);
        leg.position.copy(p0).lerp(p1, 0.5);
        leg.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), p1.clone().sub(p0).normalize());
        group.add(leg);
      }
    }
    for (const yy of [140, 200, 250]) {
      const deck = mesh(
        new T.CylinderGeometry(30 * (1 - yy / 298 / 1.4) + 4, 30 * (1 - yy / 298 / 1.4) + 4, 2, 3),
        red,
      );
      deck.position.set(c.x, y + yy, c.z);
      group.add(deck);
    }
  }

  // Dewey Monument, Union Square.
  {
    const c = L.union_square;
    const y = h(c);
    const column = mesh(new T.CylinderGeometry(1.1, 1.3, 26, 20), STONE);
    column.position.set(c.x, y + 15, c.z);
    group.add(column, boxAt(4.5, 2.4, 4.5, c.x, y + 1.2, c.z, STONE));
    const statue = mesh(
      new T.ConeGeometry(0.9, 3.4, 10),
      new T.MeshStandardMaterial({ color: '#4c5a4f', metalness: 0.8, roughness: 0.4 }),
    );
    statue.position.set(c.x, y + 29.7, c.z);
    group.add(statue);
  }

  // Alcatraz cellhouse and lighthouse.
  {
    const c = L.alcatraz;
    const y = Math.max(8, h(c));
    const cell = mesh(
      prism(
        square(c, 1, -0.5).map((p) => ({ x: c.x + (p.x - c.x) * 75, z: c.z + (p.z - c.z) * 16 })),
        y,
        y + 15,
        1,
        3,
        '#d4cec0',
        15,
      ),
      facade,
    );
    group.add(cell);
    const light = mesh(new T.CylinderGeometry(2.2, 2.8, 26, 8), STONE);
    light.position.set(c.x - 70, y + 13, c.z + 10);
    group.add(light);
  }

  // Golden Gate Bridge: 227 m towers, 67 m deck, International Orange.
  group.add(suspension(world, L.gg_south, L.gg_north, [0.17, 0.83], 227, 67, 27, ORANGE));
  // Bay Bridge west span to Yerba Buena Island: twin suspension spans.
  group.add(
    suspension(
      world,
      L.bay_bridge_sf,
      L.ybi,
      [0.16, 0.37, 0.5, 0.63, 0.84],
      160,
      58,
      28,
      STEEL,
      true,
    ),
  );

  // Chinatown Dragon Gate on Grant Ave.
  {
    const c = L.dragon_gate;
    const y = h(c);
    const g = new T.Group();
    const green = new T.MeshStandardMaterial({ color: '#2f6b45', roughness: 0.5 });
    const red = new T.MeshStandardMaterial({ color: '#9c2a22', roughness: 0.6 });
    for (const x of [-7, -3, 3, 7])
      g.add(boxAt(1, x === -7 || x === 7 ? 6 : 8, 1, x, x === -7 || x === 7 ? 3 : 4, 0, STONE));
    g.add(
      boxAt(6.5, 0.6, 3, 0, 8.5, 0, green),
      boxAt(5, 1.6, 2, 0, 9.6, 0, red),
      boxAt(7, 0.5, 3.4, 0, 10.6, 0, green),
    );
    g.add(boxAt(4.5, 0.5, 2.6, -5, 6.3, 0, green), boxAt(4.5, 0.5, 2.6, 5, 6.3, 0, green));
    g.position.set(c.x, y, c.z);
    g.rotation.y = 0.14;
    group.add(g);
  }

  // Salesforce Tower crown lattice (lit LED sculpture at night).
  {
    const c = L.salesforce;
    let top = 326;
    const idx = world.buildingAt(c.x, c.z, 15);
    if (idx >= 0) top = world.buildings[idx].base + world.buildings[idx].height;
    const crown = mesh(
      new T.CylinderGeometry(15, 19, 26, 24, 4, true),
      new T.MeshStandardMaterial({
        color: '#dfe4e8',
        emissive: '#a8c8ff',
        emissiveIntensity: 0.15,
        roughness: 0.4,
        metalness: 0.5,
        wireframe: true,
      }),
    );
    crown.position.set(c.x, top + 13, c.z);
    group.add(crown);
  }

  // Oren's Hummus storefront, 71 3rd St.
  {
    const f = facadeNear(world, L.oren);
    const sign = signPanel(
      signTexture(
        [
          { text: "OREN'S", font: 'bold 120px Georgia, serif', color: '#f6efe0', y: 110 },
          {
            text: 'HUMMUS',
            font: '600 84px Helvetica, Arial, sans-serif',
            color: '#e9c46a',
            y: 210,
          },
        ],
        1024,
        280,
        '#1e3d2f',
      ),
      5.6,
      1.55,
      0.5,
      '#14281f',
    );
    sign.position.set(f.x + Math.sin(f.angle) * 0.2, f.base + 4.6, f.z + Math.cos(f.angle) * 0.2);
    sign.rotation.y = f.angle;
    group.add(sign);
    // Blade sign perpendicular to the wall and a few sidewalk tables.
    const blade = signPanel(
      signTexture(
        [{ text: "OREN'S", font: 'bold 150px Georgia, serif', color: '#f6efe0', y: 128 }],
        640,
        256,
        '#1e3d2f',
      ),
      1.6,
      0.64,
      0.5,
    );
    blade.position.set(
      f.x + Number(Math.sin(f.angle)) + Math.cos(f.angle) * 3.2,
      f.base + 6,
      f.z + Number(Math.cos(f.angle)) - Math.sin(f.angle) * 3.2,
    );
    blade.rotation.y = f.angle + Math.PI / 2;
    group.add(blade);
    const wood = new T.MeshStandardMaterial({ color: '#7a5a3c', roughness: 0.7 });
    for (let i = -1; i <= 1; i++) {
      const tx = f.x + Math.sin(f.angle) * 1.6 + Math.cos(f.angle) * i * 1.8,
        tz = f.z + Math.cos(f.angle) * 1.6 - Math.sin(f.angle) * i * 1.8;
      group.add(
        boxAt(0.8, 0.05, 0.8, tx, f.base + 0.95, tz, wood, f.angle),
        boxAt(0.08, 0.75, 0.08, tx, f.base + 0.55, tz, DARK),
      );
    }
  }

  // Fisherman's Wharf, Pier 39 and Ghirardelli signs.
  {
    const wharf = signPanel(
      signTexture(
        [
          { text: "FISHERMAN'S", font: 'bold 92px Georgia, serif', color: '#1d3557', y: 80 },
          { text: 'WHARF', font: 'bold 110px Georgia, serif', color: '#c1121f', y: 190 },
        ],
        640,
        256,
        '#f1e9d2',
      ),
      5,
      2,
      0.3,
    );
    const w = L.wharf;
    wharf.position.set(w.x, h(w) + 5, w.z);
    wharf.rotation.y = 0;
    group.add(wharf, boxAt(0.25, 5, 0.25, w.x, h(w) + 2.5, w.z - 0.1, DARK));
    const p39 = signPanel(
      signTexture(
        [
          {
            text: 'PIER 39',
            font: 'bold 150px Helvetica, Arial, sans-serif',
            color: '#0b3d91',
            y: 128,
          },
        ],
        768,
        256,
        '#f7f3e9',
      ),
      7,
      2.3,
      0.3,
    );
    p39.position.set(L.pier39.x, 9, L.pier39.z + 40);
    group.add(p39);
    const gh = L.ghirardelli;
    const ghBuilding = facadeNear(world, gh, 60);
    const ghSign = new T.Mesh(
      new T.PlaneGeometry(36, 4.5),
      new T.MeshStandardMaterial({
        map: signTexture(
          [{ text: 'GHIRARDELLI', font: 'bold 150px Georgia, serif', color: '#ffffff', y: 100 }],
          1400,
          200,
          null,
        ),
        transparent: true,
        emissive: '#ffffff',
        emissiveIntensity: 0.6,
        side: T.DoubleSide,
      }),
    );
    (ghSign.material as T.MeshStandardMaterial).emissiveMap = (
      ghSign.material as T.MeshStandardMaterial
    ).map;
    ghSign.position.set(gh.x, ghBuilding.top + 8, gh.z);
    ghSign.rotation.y = Math.PI;
    group.add(ghSign);
  }

  // Painted Ladies: Victorian row houses on Steiner St facing Alamo Square.
  {
    const c = L.painted_ladies;
    const colors = ['#e8d9b5', '#b9c9d6', '#e3b8a6', '#c8d4b8', '#f0e0c0', '#d7c3d8', '#a9c2c9'];
    const trim = new T.MeshStandardMaterial({ color: '#f5f1e8', roughness: 0.7 });
    const roofM = new T.MeshStandardMaterial({ color: '#4a4440', roughness: 0.9 });
    for (let i = 0; i < 7; i++) {
      const z = c.z - 21 + i * 7.6;
      const x = c.x;
      const y = world.height(x, z);
      const body = new T.MeshStandardMaterial({ color: colors[i], roughness: 0.8 });
      group.add(boxAt(14, 9, 7.4, x, y + 4.5 + 1, z, body));
      // Gabled roof facing the park (west).
      const gable = new T.Shape([
        new T.Vector2(-3.7, 0),
        new T.Vector2(3.7, 0),
        new T.Vector2(0, 4.4),
      ]);
      const rg = new T.ExtrudeGeometry(gable, { depth: 14, bevelEnabled: false });
      rg.translate(0, 0, -7);
      const roof = mesh(rg, roofM);
      roof.rotation.y = Math.PI / 2;
      roof.position.set(x, y + 10, z);
      group.add(roof);
      // Bay window and trim.
      group.add(boxAt(0.9, 6, 3.6, x - 7.45, y + 5, z - 1.2, body));
      group.add(boxAt(0.3, 0.4, 7.6, x - 7.1, y + 10.1, z, trim));
      group.add(
        boxAt(0.3, 6.4, 0.25, x - 7.92, y + 5, z - 3, trim),
        boxAt(0.3, 6.4, 0.25, x - 7.92, y + 5, z + 0.6, trim),
      );
      group.add(boxAt(2.2, 1, 2.6, x - 8.2, y + 0.5, z + 2.2, STONE));
    }
  }

  // Oracle Park: brick bowl, clock towers and the light standards on the bay.
  {
    const c = L.oracle;
    const y = h(c);
    const brick = new T.MeshStandardMaterial({
      map: ctx.tex.brick,
      color: '#c9876a',
      roughness: 0.85,
      side: T.DoubleSide,
    });
    const seats = new T.MeshStandardMaterial({
      color: '#2f4a52',
      roughness: 0.8,
      side: T.DoubleSide,
    });
    const field = new T.MeshStandardMaterial({ color: '#3f7f3a', roughness: 0.95 });
    const bowl = new T.CylinderGeometry(118, 90, 26, 48, 1, true, -Math.PI * 0.25, Math.PI * 1.5);
    const stand = mesh(bowl, seats);
    stand.position.set(c.x, y + 13, c.z);
    stand.rotation.y = 0.8;
    group.add(stand);
    const wall = mesh(
      new T.CylinderGeometry(120, 120, 24, 48, 1, true, -Math.PI * 0.25, Math.PI * 1.5),
      brick,
    );
    wall.position.set(c.x, y + 12, c.z);
    wall.rotation.y = 0.8;
    group.add(wall);
    const grass = mesh(new T.CircleGeometry(92, 48), field, false);
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(c.x, y + 0.6, c.z);
    grass.receiveShadow = true;
    group.add(grass);
    for (const a of [0.9, 2.3]) {
      const tx = c.x + Math.cos(a) * 122,
        tz = c.z + Math.sin(a) * 122;
      group.add(boxAt(9, 38, 9, tx, y + 19, tz, brick));
      const capT = mesh(new T.ConeGeometry(7, 9, 4), COPPER);
      capT.position.set(tx, y + 42.5, tz);
      capT.rotation.y = Math.PI / 4;
      group.add(capT);
    }
    for (let i = 0; i < 6; i++) {
      const a = -0.6 + i * 0.75;
      const lx = c.x + Math.cos(a + 0.8) * 112,
        lz = c.z + Math.sin(a + 0.8) * 112;
      group.add(boxAt(1.2, 48, 1.2, lx, y + 24, lz, STEEL), boxAt(10, 4, 1, lx, y + 49, lz, STEEL));
    }
  }

  // Lombard Street hedges and flower beds along the switchbacks.
  {
    const hedge = new T.MeshStandardMaterial({ color: '#3d6b35', roughness: 0.95 });
    const bloom = new T.MeshStandardMaterial({ color: '#c8507a', roughness: 0.9 });
    const c = L.lombard;
    for (const r of world.roads) {
      if (r.name !== 'Lombard Street' || r.cls > 9) continue;
      if (Math.abs(r.pts[0] - c.x) > 160 || Math.abs(r.pts[1] - c.z) > 160) continue;
      for (let k = 2; k < r.pts.length; k += 2) {
        const ax = r.pts[k - 2],
          az = r.pts[k - 1],
          bx = r.pts[k],
          bz = r.pts[k + 1];
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 1) continue;
        const nx = -(bz - az) / len,
          nz = (bx - ax) / len;
        for (let t = 0; t < len; t += 2.4)
          for (const side of [-1, 1]) {
            const px = ax + ((bx - ax) * t) / len + nx * side * (r.width / 2 + 1),
              pz = az + ((bz - az) * t) / len + nz * side * (r.width / 2 + 1);
            const py = world.height(px, pz);
            group.add(
              boxAt(
                2.4,
                0.9,
                1.1,
                px,
                py + 0.45,
                pz,
                (t / 2.4) % 3 < 1 ? bloom : hedge,
                Math.atan2(bx - ax, bz - az),
              ),
            );
          }
      }
    }
  }

  // SAP Center ("the Shark Tank") in downtown San Jovano.
  {
    const c = L.sap_center;
    const y = h(c);
    const glass = new T.MeshStandardMaterial({
      map: curtainTexture(),
      roughness: 0.15,
      metalness: 0.5,
    });
    const arena = mesh(new T.CylinderGeometry(70, 70, 26, 40), glass);
    arena.scale.z = 0.8;
    arena.position.set(c.x, y + 13, c.z);
    group.add(arena);
    const lid = mesh(new T.CylinderGeometry(66, 72, 6, 40), STEEL);
    lid.scale.z = 0.8;
    lid.position.set(c.x, y + 29, c.z);
    group.add(lid);
  }

  // NVIDIA Endeavor / Voyager and AMD HQ, with official logos.
  const [nv, amd] = await Promise.all([
    imageTexture(`${ctx.base}sf/logos/nvidia.png`, ctx.signal),
    imageTexture(`${ctx.base}sf/logos/amd.png`, ctx.signal),
  ]);
  const logoSign = (map: T.Texture, p: Point, width: number, wall?: number) => {
    const f = facadeNear(world, p, 120);
    if (wall !== undefined) f.top = f.base + wall;
    const sign = signPanel(map, width, width / 4, 0.35, '#e9e9e6');
    sign.position.set(
      f.x + Math.sin(f.angle) * 0.3,
      f.top - width / 8 - 1.5,
      f.z + Math.cos(f.angle) * 0.3,
    );
    sign.rotation.y = f.angle;
    group.add(sign);
    // Monument sign at the entrance.
    const mon = new T.Group();
    mon.add(
      boxAt(
        7,
        1.8,
        0.8,
        0,
        0.9,
        0,
        new T.MeshStandardMaterial({ color: '#d8d6d0', roughness: 0.8 }),
      ),
    );
    const face = signPanel(map, 6.4, 1.6, 0.25, '#e9e9e6');
    face.position.set(0, 1, 0.42);
    mon.add(face);
    mon.position.set(
      f.x + Math.sin(f.angle) * 14,
      world.height(f.x, f.z),
      f.z + Math.cos(f.angle) * 14,
    );
    mon.rotation.y = f.angle;
    group.add(mon);
  };
  // Endeavor (2017) and Voyager (2022): low glass walls under faceted roofs
  // studded with triangular skylights.
  {
    const roof = new T.MeshStandardMaterial({
      map: facetTexture(),
      roughness: 0.7,
      metalness: 0.1,
      side: T.DoubleSide,
    });
    const glass = new T.MeshStandardMaterial({
      map: curtainTexture(),
      roughness: 0.12,
      metalness: 0.6,
      side: T.DoubleSide,
    });
    const specs = [
      { p: L.nvidia_endeavor, wall: 12, peak: 21, tilt: { x: 0, z: 0 } },
      { p: L.nvidia_voyager, wall: 14, peak: 34, tilt: { x: -40, z: 20 } },
    ];
    for (const spec of specs) {
      const index = world.buildingAt(spec.p.x, spec.p.z, 30);
      if (index < 0) continue;
      skip.add(index);
      group.add(facetedBuilding(world, index, spec.wall, spec.peak, roof, glass, spec.tilt));
    }
  }
  logoSign(nv, L.nvidia_endeavor, 9, 11.5);
  logoSign(nv, L.nvidia_voyager, 11, 13.5);
  logoSign(amd, L.amd_hq, 12);

  // Welcome sign on US-101 at the South Bay boundary.
  {
    const p = world.freeway[Math.floor(world.freeway.length * 0.45)] ?? { x: 230, z: 4400 };
    const welcome = signPanel(
      signTexture(
        [
          {
            text: 'WELCOME TO',
            font: '600 64px Helvetica, Arial, sans-serif',
            color: '#ffffff',
            y: 70,
          },
          {
            text: 'SAN JOVANO',
            font: 'bold 120px Helvetica, Arial, sans-serif',
            color: '#ffffff',
            y: 170,
          },
          {
            text: 'Capital of Silicon Valley',
            font: 'italic 44px Georgia, serif',
            color: '#e8e2c8',
            y: 238,
          },
        ],
        800,
        270,
        '#0d5e3b',
      ),
      11,
      3.7,
      0.3,
      '#0a3f28',
    );
    welcome.position.set(p.x + 22, world.height(p.x, p.z) + 6, p.z);
    welcome.rotation.y = Math.PI;
    group.add(
      welcome,
      boxAt(0.4, 5, 0.4, p.x + 18, world.height(p.x, p.z) + 2.5, p.z, STEEL),
      boxAt(0.4, 5, 0.4, p.x + 26, world.height(p.x, p.z) + 2.5, p.z, STEEL),
    );
  }

  // Cable cars running along the Powell and California St cable lines.
  const cars: { rail: number; s: number; speed: number; obj: T.Object3D }[] = [];
  {
    const red = new T.MeshStandardMaterial({ color: '#9e2a22', roughness: 0.5 });
    const cream = new T.MeshStandardMaterial({ color: '#efe3c4', roughness: 0.6 });
    const wood = new T.MeshStandardMaterial({ color: '#6b4428', roughness: 0.7 });
    const glassM = new T.MeshStandardMaterial({ color: '#24323a', roughness: 0.1, metalness: 0.5 });
    const make = () => {
      const g = new T.Group();
      g.add(boxAt(2.4, 0.6, 8.3, 0, 0.55, 0, wood));
      g.add(boxAt(2.4, 1.3, 4.2, 0, 1.5, 0, red));
      g.add(boxAt(2.42, 0.8, 4, 0, 1.9, 0, glassM));
      g.add(boxAt(2.4, 0.5, 4.2, 0, 2.5, 0, cream));
      for (const z of [-3.1, 3.1]) g.add(boxAt(2.3, 0.8, 1.6, 0, 1.2, z, cream));
      for (const x of [-1.15, 1.15])
        for (const z of [-3.9, -2.3, 2.3, 3.9]) g.add(boxAt(0.08, 2, 0.08, x, 1.9, z, STEEL));
      g.add(boxAt(2.6, 0.18, 8.6, 0, 2.95, 0, cream));
      for (const z of [-2.8, 2.8])
        for (const x of [-0.75, 0.75]) {
          const w = mesh(new T.CylinderGeometry(0.38, 0.38, 0.2, 12), DARK);
          w.rotation.z = Math.PI / 2;
          w.position.set(x, 0.38, z);
          g.add(w);
        }
      return g;
    };
    world.rails.forEach((r, rail) => {
      if (!r.cable || r.length < 120) return;
      for (let i = 0; i < Math.min(3, Math.floor(r.length / 400) + 1); i++) {
        const obj = make();
        group.add(obj);
        cars.push({ rail, s: (i / 3) * r.length, speed: 4.2, obj });
      }
    });
  }
  const railPoint = (rail: number, s: number) => {
    const r = world.rails[rail];
    let d = ((s % (r.length * 2)) + r.length * 2) % (r.length * 2);
    const back = d > r.length;
    if (back) d = r.length * 2 - d;
    for (let k = 2; k < r.pts.length; k += 2) {
      const len = Math.hypot(r.pts[k] - r.pts[k - 2], r.pts[k + 1] - r.pts[k - 1]);
      if (d <= len || k === r.pts.length - 2) {
        const t = len ? Math.min(1, d / len) : 0;
        const x = r.pts[k - 2] + (r.pts[k] - r.pts[k - 2]) * t,
          z = r.pts[k - 1] + (r.pts[k + 1] - r.pts[k - 1]) * t;
        const a =
          Math.atan2(r.pts[k] - r.pts[k - 2], r.pts[k + 1] - r.pts[k - 1]) + (back ? Math.PI : 0);
        return { x, z, a };
      }
      d -= len;
    }
    return { x: r.pts[0], z: r.pts[1], a: 0 };
  };
  const update = (time: number) => {
    for (const c of cars) {
      const p = railPoint(c.rail, c.s + time * c.speed);
      const ahead = railPoint(c.rail, c.s + time * c.speed + 3);
      const y = world.surface(p.x, p.z);
      c.obj.position.set(p.x, y, p.z);
      c.obj.rotation.set(0, p.a, 0);
      c.obj.rotateX(-Math.atan2(world.surface(ahead.x, ahead.z) - y, 3));
    }
  };
  update(0);

  group.traverse((n) => {
    const m = n as T.Mesh;
    if (m.isMesh && m.castShadow === undefined) m.castShadow = true;
  });
  return { group, skip, update };
}
