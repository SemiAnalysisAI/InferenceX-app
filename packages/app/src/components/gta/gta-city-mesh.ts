import * as T from 'three';

import { GROUND, ROAD, type Road, type World } from './gta-world';

// Static city geometry built once from OpenStreetMap data: terrain chunks,
// road ribbons with junction-aware markings, raised sidewalks and extruded
// buildings with per-segment facade attributes.

export const CHUNK = 400;

class Buf {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  extra: Record<string, { size: number; data: number[] }> = {};
  idx: number[] = [];
  get count() {
    return this.pos.length / 3;
  }
  attr(name: string, size: number) {
    this.extra[name] ||= { size, data: [] };
    return this.extra[name].data;
  }
  geometry() {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(this.pos, 3));
    if (this.nor.length > 0) g.setAttribute('normal', new T.Float32BufferAttribute(this.nor, 3));
    if (this.uv.length > 0) g.setAttribute('uv', new T.Float32BufferAttribute(this.uv, 2));
    for (const [name, a] of Object.entries(this.extra))
      g.setAttribute(name, new T.Float32BufferAttribute(a.data, a.size));
    g.setIndex(this.idx);
    if (this.nor.length === 0) g.computeVertexNormals();
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

function chunked<V>(map: Map<string, V>, x: number, z: number, make: () => V) {
  const key = `${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`;
  let v = map.get(key);
  if (!v) {
    v = make();
    map.set(key, v);
  }
  return v;
}

/** Terrain as 800 m chunks with a coarse LOD for distant hills. */
export function buildTerrain(world: World, material: T.Material) {
  const group = new T.Group();
  group.name = 'terrain';
  const res = world.data.grid.terrain;
  const W = world.terrain.width,
    H = world.terrain.height;
  const span = 80;
  const make = (ci: number, cj: number, step: number) => {
    const n0 = Math.min(W - 1, ci + span) - ci;
    const m0 = Math.min(H - 1, cj + span) - cj;
    const nx = Math.floor(n0 / step) + 1,
      nz = Math.floor(m0 / step) + 1;
    const pos = new Float32Array(nx * nz * 3);
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const gi = Math.min(ci + i * step, ci + n0),
          gj = Math.min(cj + j * step, cj + m0);
        const o = (j * nx + i) * 3;
        pos[o] = world.x0 + (gi + 0.5) * res;
        pos[o + 1] = world.terrain.data[gj * W + gi] - (step > 1 ? 0.4 : 0);
        pos[o + 2] = world.z0 + (gj + 0.5) * res;
      }
    const idx: number[] = [];
    for (let j = 0; j < nz - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i;
        idx.push(a, a + nx, a + 1, a + 1, a + nx, a + nx + 1);
      }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const mesh = new T.Mesh(g, material);
    mesh.receiveShadow = true;
    return mesh;
  };
  for (let cj = 0; cj < H - 1; cj += span)
    for (let ci = 0; ci < W - 1; ci += span) {
      // Skip chunks that are entirely deep water.
      let dry = false;
      for (let j = cj; j < Math.min(H, cj + span) && !dry; j += 4)
        for (let i = ci; i < Math.min(W, ci + span); i += 4)
          if (world.terrain.data[j * W + i] > -1.5) {
            dry = true;
            break;
          }
      if (!dry) continue;
      const lod = new T.LOD();
      lod.addLevel(make(ci, cj, 1), 0);
      lod.addLevel(make(ci, cj, 4), 1500);
      group.add(lod);
    }
  return group;
}

interface Junction {
  r: number;
}

function junctions(world: World) {
  const map = new Map<string, Junction & { n: number }>();
  for (const road of world.roads) {
    if (road.cls > ROAD.pedestrian || road.cls === ROAD.motorway) continue;
    const seen = new Set<string>();
    for (let k = 0; k < road.pts.length; k += 2) {
      if (road.dy[k / 2] > 1) continue;
      const key = world.nodeKey(road.pts[k], road.pts[k + 1]);
      if (seen.has(key)) continue;
      seen.add(key);
      const j = map.get(key);
      if (j) {
        j.n++;
        j.r = Math.max(j.r, road.width / 2);
      } else map.set(key, { n: 1, r: road.width / 2 });
    }
  }
  return map;
}

interface Sample {
  x: number;
  z: number;
  s: number;
  dy: number;
}

function resample(road: Road, step: number) {
  const out: Sample[] = [];
  const p = road.pts;
  let s = 0;
  for (let k = 0; k < p.length / 2 - 1; k++) {
    const ax = p[k * 2],
      az = p[k * 2 + 1],
      bx = p[k * 2 + 2],
      bz = p[k * 2 + 3];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(len / step));
    for (let q = 0; q < n; q++) {
      const t = q / n;
      out.push({
        x: ax + (bx - ax) * t,
        z: az + (bz - az) * t,
        s: s + len * t,
        dy: road.dy[k] + (road.dy[k + 1] - road.dy[k]) * t,
      });
    }
    s += len;
  }
  const n = p.length / 2 - 1;
  out.push({ x: p[n * 2], z: p[n * 2 + 1], s, dy: road.dy[n] });
  return out;
}

function normals(samples: Sample[]) {
  return samples.map((_, i) => {
    const a = samples[Math.max(0, i - 1)],
      b = samples[Math.min(samples.length - 1, i + 1)];
    let dx = b.x - a.x,
      dz = b.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    // Left-hand normal in the x/z plane, with a mitre stretch at corners.
    let scale = 1;
    if (i > 0 && i < samples.length - 1) {
      const p = samples[i - 1],
        c = samples[i];
      const ux = c.x - p.x,
        uz = c.z - p.z;
      const ul = Math.hypot(ux, uz) || 1;
      const cos = (ux / ul) * dx + (uz / ul) * dz;
      scale = Math.min(1.8, 1 / Math.max(0.55, Math.sqrt((1 + cos) / 2)));
    }
    return { nx: -dz * scale, nz: dx * scale, dx, dz };
  });
}

const STYLE = {
  twoWay: 0,
  oneWay: 1,
  residential: 2,
  motorway: 3,
  service: 4,
  pedestrian: 5,
  path: 6,
};

function roadStyle(road: Road) {
  if (road.cls === ROAD.motorway) return STYLE.motorway;
  if (road.cls === ROAD.pedestrian) return STYLE.pedestrian;
  if (road.cls >= ROAD.footway) return STYLE.path;
  if (road.cls === ROAD.service) return STYLE.service;
  if (road.oneway) return STYLE.oneWay;
  if (road.cls >= ROAD.residential) return STYLE.residential;
  return STYLE.twoWay;
}

export interface RoadMeshes {
  roads: T.Group;
  sidewalks: T.Group;
  decks: T.Group;
}

export function buildRoads(
  world: World,
  roadMat: T.Material,
  walkMat: T.Material,
  deckMat: T.Material,
): RoadMeshes {
  const J = junctions(world);
  const roadChunks = new Map<string, Buf>();
  const walkChunks = new Map<string, Buf>();
  const deck = new Buf();
  const pillars: T.Matrix4[] = [];
  for (const road of world.roads) {
    if (road.cls >= 100 || road.cls === ROAD.steps) continue;
    if (road.cls === ROAD.footway && road.width < 1.5) continue;
    const style = roadStyle(road);
    const W = road.cls === ROAD.footway ? 2.2 : road.width;
    const lanes = style >= STYLE.service ? 1 : Math.max(1, Math.round((W - 0.6) / 3.3));
    const samples = resample(road, 6);
    if (samples.length < 2) continue;
    const ns = normals(samples);
    // Junction arc positions along this road for markings and curb cuts.
    const marks: { s: number; r: number }[] = [];
    let s = 0;
    for (let k = 0; k < road.pts.length; k += 2) {
      if (k) s += Math.hypot(road.pts[k] - road.pts[k - 2], road.pts[k + 1] - road.pts[k - 1]);
      const j = J.get(world.nodeKey(road.pts[k], road.pts[k + 1]));
      if (j && j.n > 1) marks.push({ s, r: j.r + 0.4 });
    }
    const nearest = (at: number) => {
      let best = 1e9,
        r = 0;
      for (const m of marks)
        if (Math.abs(at - m.s) < Math.abs(best)) {
          best = at - m.s;
          r = m.r;
        }
      // Positive when the junction lies ahead.
      return { d: -best, r };
    };
    const mid = samples[samples.length >> 1];
    const buf = chunked(roadChunks, mid.x, mid.z, () => new Buf());
    const base = buf.count;
    const lift = style === STYLE.path ? 0.05 : 0.08;
    const heights: number[] = [];
    for (let i = 0; i < samples.length; i++) {
      const p = samples[i],
        n = ns[i];
      const nj = nearest(p.s);
      for (const side of [0, 1]) {
        const sign = side ? -1 : 1;
        const x = p.x + (n.nx * W * sign) / 2,
          z = p.z + (n.nz * W * sign) / 2;
        const y = p.dy > 0.5 ? world.height(p.x, p.z) + p.dy : world.surface(x, z) + lift;
        heights.push(y);
        buf.pos.push(x, y, z);
        buf.nor.push(0, 1, 0);
        buf.uv.push(side, p.s);
        buf.attr('aRoad', 4).push(W, lanes, style, road.oneway ? 1 : 0);
        buf.attr('aJunction', 2).push(nj.d, nj.r);
      }
      if (i) {
        const a = base + (i - 1) * 2;
        buf.idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    // Elevated decks: underside, barriers and columns.
    if (samples.some((p) => p.dy > 0.5)) {
      for (let i = 1; i < samples.length; i++) {
        const a = samples[i - 1],
          b = samples[i];
        if (a.dy < 0.5 && b.dy < 0.5) continue;
        const na = ns[i - 1],
          nb = ns[i];
        const ya = heights[(i - 1) * 2],
          yb = heights[i * 2];
        for (const side of [1, -1]) {
          const o = deck.count;
          const ax = a.x + (na.nx * W * side) / 2,
            az = a.z + (na.nz * W * side) / 2,
            bx = b.x + (nb.nx * W * side) / 2,
            bz = b.z + (nb.nz * W * side) / 2;
          deck.pos.push(ax, ya - 1.6, az, bx, yb - 1.6, bz, bx, yb + 0.9, bz, ax, ya + 0.9, az);
          deck.idx.push(o, o + 1, o + 2, o, o + 2, o + 3, o, o + 2, o + 1, o, o + 3, o + 2);
        }
        // Underside.
        const o = deck.count;
        deck.pos.push(
          a.x + (na.nx * W) / 2,
          ya - 1.6,
          a.z + (na.nz * W) / 2,
          a.x - (na.nx * W) / 2,
          ya - 1.6,
          a.z - (na.nz * W) / 2,
          b.x - (nb.nx * W) / 2,
          yb - 1.6,
          b.z - (nb.nz * W) / 2,
          b.x + (nb.nx * W) / 2,
          yb - 1.6,
          b.z + (nb.nz * W) / 2,
        );
        deck.idx.push(o, o + 1, o + 2, o, o + 2, o + 3, o, o + 2, o + 1, o, o + 3, o + 2);
        if (Math.floor(a.s / 36) !== Math.floor(b.s / 36) && Math.min(a.dy, b.dy) > 3) {
          const g = world.height(b.x, b.z);
          const h = yb - 1.6 - g;
          pillars.push(
            new T.Matrix4().compose(
              new T.Vector3(b.x, g + h / 2, b.z),
              new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), Math.atan2(nb.dx, nb.dz)),
              new T.Vector3(Math.min(W * 0.6, 9), h, 1.6),
            ),
          );
        }
      }
    }
    // Raised sidewalks and curbs along city streets.
    if (
      road.cls >= ROAD.trunk &&
      road.cls <= ROAD.service &&
      !road.bridge &&
      !samples.some((p) => p.dy > 0.5) &&
      !world.southBay({ x: mid.x, z: mid.z })
    ) {
      const walkW = road.cls === ROAD.service ? 0 : road.cls <= ROAD.secondary ? 3.6 : 2.9;
      if (walkW > 0)
        for (const side of [1, -1]) {
          let prev = -1;
          const wb = chunked(walkChunks, mid.x, mid.z, () => new Buf());
          for (let i = 0; i < samples.length; i++) {
            const p = samples[i],
              n = ns[i];
            const nj = nearest(p.s);
            const ok =
              Math.abs(nj.d) > nj.r + 0.6 &&
              world.ground(p.x + n.nx * side * (W / 2 + 1.5), p.z + n.nz * side * (W / 2 + 1.5)) !==
                GROUND.water;
            if (!ok) {
              prev = -1;
              continue;
            }
            const o = wb.count;
            const e0 = W / 2,
              e1 = W / 2 + walkW;
            const x0 = p.x + n.nx * side * e0,
              z0 = p.z + n.nz * side * e0;
            const x1 = p.x + n.nx * side * e1,
              z1 = p.z + n.nz * side * e1;
            const y0 = world.surface(x0, z0) + 0.08,
              y1 = world.surface(x1, z1);
            const top0 = Math.max(y0 + 0.14, world.surface(x0, z0) + 0.22);
            const top1 = Math.max(y1 + 0.22, top0 - 0.4);
            // curb bottom, curb top, outer top
            wb.pos.push(x0, y0, z0, x0, top0, z0, x1, top1, z1);
            const ox = n.nx * side,
              oz = n.nz * side;
            const l = Math.hypot(ox, oz) || 1;
            wb.nor.push(-ox / l, 0, -oz / l, 0, 1, 0, 0, 1, 0);
            if (prev >= 0) {
              // Wind each triangle so it faces up (or toward the road for the curb face).
              const P = wb.pos;
              const tri = (
                a: number,
                b: number,
                c: number,
                wantX: number,
                wantY: number,
                wantZ: number,
              ) => {
                const ax = P[b * 3] - P[a * 3],
                  ay = P[b * 3 + 1] - P[a * 3 + 1],
                  az = P[b * 3 + 2] - P[a * 3 + 2];
                const bx2 = P[c * 3] - P[a * 3],
                  by2 = P[c * 3 + 1] - P[a * 3 + 1],
                  bz2 = P[c * 3 + 2] - P[a * 3 + 2];
                const nx2 = ay * bz2 - az * by2,
                  ny2 = az * bx2 - ax * bz2,
                  nz2 = ax * by2 - ay * bx2;
                if (nx2 * wantX + ny2 * wantY + nz2 * wantZ >= 0) wb.idx.push(a, b, c);
                else wb.idx.push(a, c, b);
              };
              const fx = -ox / l,
                fz = -oz / l;
              tri(prev, o, prev + 1, fx, 0, fz);
              tri(o, o + 1, prev + 1, fx, 0, fz);
              tri(prev + 1, o + 1, prev + 2, 0, 1, 0);
              tri(o + 1, o + 2, prev + 2, 0, 1, 0);
            }
            prev = o;
          }
        }
    }
  }
  const roads = new T.Group();
  roads.name = 'roads';
  for (const b of roadChunks.values()) {
    const mesh = new T.Mesh(b.geometry(), roadMat);
    mesh.receiveShadow = true;
    roads.add(mesh);
  }
  const sidewalks = new T.Group();
  sidewalks.name = 'sidewalks';
  for (const b of walkChunks.values()) {
    if (b.idx.length === 0) continue;
    const mesh = new T.Mesh(b.geometry(), walkMat);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    sidewalks.add(mesh);
  }
  const decks = new T.Group();
  if (deck.idx.length > 0) {
    const g = deck.geometry();
    const mesh = new T.Mesh(g, deckMat);
    mesh.receiveShadow = true;
    mesh.castShadow = mesh.receiveShadow;
    decks.add(mesh);
  }
  if (pillars.length > 0) {
    const inst = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), deckMat, pillars.length);
    pillars.forEach((m, i) => inst.setMatrixAt(i, m));
    inst.receiveShadow = true;
    inst.castShadow = inst.receiveShadow;
    inst.computeBoundingSphere();
    decks.add(inst);
  }
  return { roads, sidewalks, decks };
}

const STYLE_COLORS: Record<number, string[]> = {
  0: ['#e8e2d4', '#d9cdb5', '#c9d6dc', '#e6d3b8', '#d5dccb', '#f0eadf', '#bfc7cc'],
  1: ['#c9b9a0', '#b8a58a', '#d8cdb8', '#a77d63', '#c4c0b6', '#d9d2c3'],
  2: ['#8fa3b3', '#7d8f9c', '#9db1bf', '#6f8494', '#a9b6bd'],
  3: ['#b4aea3', '#9f9a92', '#c2bcaf', '#8e8a82'],
  4: ['#e0d9ca', '#d6cfbf', '#cfc6b2'],
  5: ['#a9b4bc', '#c8ccc9', '#96a5ae'],
  6: ['#c7c3ba', '#b5b1a8', '#d2cfc6', '#a8a49b'],
};
const PASTEL = [
  '#e7c9a9',
  '#b9d3d0',
  '#e8d8a8',
  '#c8b8d6',
  '#a9c4a0',
  '#e6b3a3',
  '#d6e0e6',
  '#f0e2c8',
  '#9fb7c9',
  '#e0c6d2',
];

function hash(i: number) {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Extruded buildings merged per 400 m chunk. */
export function buildBuildings(world: World, material: T.Material, skip: Set<number>) {
  const chunks = new Map<string, Buf>();
  const color = new T.Color();
  const units: T.Matrix4[] = [];
  world.buildings.forEach((b, index) => {
    if (skip.has(index)) return;
    const n = b.pts.length / 2;
    if (n < 3) return;
    const seed = hash(index);
    const cx = (b.minX + b.maxX) / 2,
      cz = (b.minZ + b.maxZ) / 2;
    const buf = chunked(chunks, cx, cz, () => new Buf());
    let style = b.style;
    const palette = STYLE_COLORS[style] ?? STYLE_COLORS[6];
    if (b.color >= 0) color.setHex(b.color, T.SRGBColorSpace);
    else
      color.setStyle(
        b.color === -2
          ? PASTEL[Math.floor(seed * PASTEL.length)]
          : palette[Math.floor(seed * palette.length)],
        T.SRGBColorSpace,
      );
    // Use linear colour in the vertex attribute.
    const cr = color.r,
      cg = color.g,
      cb = color.b;
    const y0 = b.base + b.minHeight - (b.minHeight > 0 ? 0 : 1.5);
    const top = b.base + b.height;
    const flat = b.roof === 0 || b.roof > 3;
    const parapet = flat && b.height > 7 && style !== 3 ? 0.9 : 0;
    let area = 0;
    for (let i = 0, j = n - 1; i < n; j = i++)
      area += b.pts[j * 2] * b.pts[i * 2 + 1] - b.pts[i * 2] * b.pts[j * 2 + 1];
    const ccw = area > 0;
    if (style === 0 && b.height > 22) style = 1;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = b.pts[i * 2],
        az = b.pts[i * 2 + 1],
        bx = b.pts[j * 2],
        bz = b.pts[j * 2 + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.05) continue;
      let nx = (bz - az) / len,
        nz = -(bx - ax) / len;
      if (!ccw) {
        nx = -nx;
        nz = -nz;
      }
      const o = buf.count;
      const h = top + parapet;
      buf.pos.push(ax, y0, az, bx, y0, bz, bx, h, bz, ax, h, az);
      for (let q = 0; q < 4; q++) {
        buf.nor.push(nx, 0, nz);
        buf.attr('aB', 4).push(len, style, seed, top - b.base);
        buf.attr('color', 3).push(cr, cg, cb);
      }
      const vb = y0 - b.base,
        vt = h - b.base;
      buf.uv.push(0, vb, len, vb, len, vt, 0, vt);
      // Wind so the face points along the outward normal.
      const ex = bx - ax,
        ez = bz - az;
      // cross((e,0),(0,1,0)) = (-ez, 0, ex)... choose winding by comparing with normal.
      const cx2 = -ez,
        cz2 = ex;
      if (cx2 * nx + cz2 * nz > 0) buf.idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
      else buf.idx.push(o, o + 2, o + 1, o, o + 3, o + 2);
    }
    // Roof.
    const contour: T.Vector2[] = [];
    for (let i = 0; i < n; i++) contour.push(new T.Vector2(b.pts[i * 2], b.pts[i * 2 + 1]));
    let tris: number[][];
    try {
      tris = T.ShapeUtils.triangulateShape(contour, []);
    } catch {
      tris = [];
    }
    const roofStyle = 20 + style;
    const pushRoofVert = (x: number, y: number, z: number, nx: number, ny: number, nz: number) => {
      buf.pos.push(x, y, z);
      buf.nor.push(nx, ny, nz);
      buf.uv.push(x, z);
      buf.attr('aB', 4).push(0, roofStyle, seed, b.height);
      buf.attr('color', 3).push(cr, cg, cb);
    };
    if (b.roof === 3 || b.roof === 1 || b.roof === 2) {
      // Hipped / pyramid / dome: inset ring up to a ridge or apex.
      const rise =
        b.roof === 3
          ? Math.min(3.5, Math.sqrt(Math.abs(area) / 2) * 0.35)
          : b.roof === 1
            ? Math.min(60, Math.sqrt(Math.abs(area) / 2) * 1.2)
            : Math.sqrt(Math.abs(area) / 2) * 0.45;
      const k = b.roof === 3 ? 0.35 : 0;
      const ring = contour.map((p) => new T.Vector2(cx + (p.x - cx) * k, cz + (p.y - cz) * k));
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const a = contour[i],
          c = contour[j],
          ra = ring[i],
          rc = ring[j];
        const o = buf.count;
        const v1 = new T.Vector3(c.x - a.x, 0, c.y - a.y);
        const v2 = new T.Vector3(ra.x - a.x, rise, ra.y - a.y);
        const nn = v1.clone().cross(v2).normalize();
        if (nn.y < 0) nn.negate();
        pushRoofVert(a.x, top, a.y, nn.x, nn.y, nn.z);
        pushRoofVert(c.x, top, c.y, nn.x, nn.y, nn.z);
        pushRoofVert(rc.x, top + rise, rc.y, nn.x, nn.y, nn.z);
        pushRoofVert(ra.x, top + rise, ra.y, nn.x, nn.y, nn.z);
        const tri = new T.Vector3()
          .subVectors(new T.Vector3(c.x, 0, c.y), new T.Vector3(a.x, 0, a.y))
          .cross(new T.Vector3(ra.x - a.x, rise, ra.y - a.y));
        if (tri.y > 0) buf.idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
        else buf.idx.push(o, o + 2, o + 1, o, o + 3, o + 2);
      }
      if (k > 0)
        for (const t of tris) {
          const o = buf.count;
          for (const q of t) pushRoofVert(ring[q].x, top + rise, ring[q].y, 0, 1, 0);
          const [p0, p1, p2] = t.map((q) => ring[q]);
          const cr2 = (p1.x - p0.x) * (p2.y - p0.y) - (p1.y - p0.y) * (p2.x - p0.x);
          if (cr2 < 0) buf.idx.push(o, o + 1, o + 2);
          else buf.idx.push(o, o + 2, o + 1);
        }
    } else {
      for (const t of tris) {
        const o = buf.count;
        for (const q of t) pushRoofVert(contour[q].x, top, contour[q].y, 0, 1, 0);
        const [p0, p1, p2] = t.map((q) => contour[q]);
        const cr2 = (p1.x - p0.x) * (p2.y - p0.y) - (p1.y - p0.y) * (p2.x - p0.x);
        if (cr2 < 0) buf.idx.push(o, o + 1, o + 2);
        else buf.idx.push(o, o + 2, o + 1);
      }
      // Rooftop mechanical units on larger flat roofs.
      const footprint = Math.abs(area) / 2;
      if (footprint > 300 && b.height > 9 && style !== 0) {
        const count = 1 + Math.floor(seed * Math.min(5, footprint / 400));
        for (let u = 0; u < count; u++) {
          const px = b.minX + (b.maxX - b.minX) * (0.25 + 0.5 * hash(index * 7 + u)),
            pz = b.minZ + (b.maxZ - b.minZ) * (0.25 + 0.5 * hash(index * 13 + u));
          if (!world.inside(b, px, pz) || world.edgeDistance(b, px, pz) < 3) continue;
          const sx = 2 + hash(index + u * 3) * 5,
            sz = 2 + hash(index + u * 5) * 4,
            sy = 1.4 + hash(index + u) * 2;
          units.push(
            new T.Matrix4().compose(
              new T.Vector3(px, top + sy / 2, pz),
              new T.Quaternion().setFromAxisAngle(
                new T.Vector3(0, 1, 0),
                Math.atan2(b.pts[3] - b.pts[1], b.pts[2] - b.pts[0]),
              ),
              new T.Vector3(sx, sy, sz),
            ),
          );
        }
      }
    }
  });
  const group = new T.Group();
  group.name = 'buildings';
  for (const b of chunks.values()) {
    const mesh = new T.Mesh(b.geometry(), material);
    mesh.receiveShadow = true;
    mesh.castShadow = mesh.receiveShadow;
    group.add(mesh);
  }
  return { group, units };
}
