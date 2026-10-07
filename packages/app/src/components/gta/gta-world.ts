// San Fierro world data: real San Francisco and South Bay geography from
// OpenStreetMap (ODbL) and Mapzen Terrarium elevation tiles, decoded at runtime.
// Coordinates are metres: x east, z south, origin at Union Square.

export interface Point {
  x: number;
  z: number;
}

export const VEHICLES = [
  'buffalo',
  'adder',
  'blista',
  'taxi',
  'dilettante',
  'raiden',
  'baller',
  'stanier',
] as const;
export type Vehicle = (typeof VEHICLES)[number];
export const TRAFFIC_MODELS = [
  'asea',
  'primo',
  'stanier',
  'dilettante',
  'raiden',
  'baller',
  'speedo',
  'taxi',
  'blista',
  'washington',
] as const;
export type TrafficModel = (typeof TRAFFIC_MODELS)[number] | 'bus';

/** Ground classes stored in ground.png. */
export const GROUND = {
  urban: 0,
  grass: 1,
  sand: 2,
  water: 3,
  pier: 4,
  dryGrass: 5,
  forest: 6,
  plaza: 7,
  parking: 8,
  sidewalk: 9,
} as const;

/** Road classes from the build script. */
export const ROAD = {
  motorway: 0,
  trunk: 1,
  primary: 2,
  secondary: 3,
  tertiary: 4,
  residential: 5,
  service: 6,
  pedestrian: 7,
  footway: 8,
  steps: 9,
} as const;

export interface Building {
  base: number;
  height: number;
  minHeight: number;
  style: number;
  color: number;
  roof: number;
  name: string;
  pts: Float32Array;
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}
export interface Road {
  cls: number;
  width: number;
  oneway: boolean;
  bridge: boolean;
  name: string;
  pts: Float32Array;
  dy: Float32Array;
  length: number;
}
export interface Rail {
  cable: boolean;
  pts: Float32Array;
  length: number;
}
export interface CityData {
  version: number;
  grid: { x0: number; z0: number; x1: number; z1: number; terrain: number; ground: number };
  names: string[];
  buildings: number[];
  roads: number[];
  trees: number[];
  props: number[];
  parked: number[];
  rails: { cable: boolean; pts: number[][] }[];
  landmarks: Record<string, [number, number]>;
  freeway: [number, number][];
}
export interface Raster {
  width: number;
  height: number;
  data: Float32Array | Uint8Array;
}

export interface Place extends Point {
  id: string;
  en: string;
  zh: string;
}

/** Places with real coordinates. Parody city names follow the Los Santos convention. */
export const CITY_NAME = { en: 'San Fierro', zh: '圣菲耶罗' };
export const SOUTH_BAY_NAME = { en: 'San Jovano', zh: '圣霍瓦诺' };

export const JOB_IDS = ['oren', 'transamerica', 'coit', 'nvidia_endeavor', 'amd_hq'] as const;
export const TOUR_STOPS = [
  { id: 'oren', en: "Oren's Hummus", zh: "Oren's Hummus" },
  { id: 'ferry', en: 'Ferry Building', zh: '渡轮大厦' },
  { id: 'transamerica', en: 'Transamerica Pyramid', zh: 'Transamerica 金字塔' },
  { id: 'salesforce', en: 'Salesforce Tower', zh: 'Salesforce Tower' },
  { id: 'coit', en: 'Coit Tower', zh: 'Coit Tower' },
  { id: 'gg_south', en: 'Golden Gate viewpoint', zh: '金门大桥观景点' },
  { id: 'nvidia_endeavor', en: 'NVIDIA HQ · Santa Clara', zh: 'NVIDIA 总部 · 圣克拉拉' },
  { id: 'amd_hq', en: 'AMD HQ · Santa Clara', zh: 'AMD 总部 · 圣克拉拉' },
  { id: 'sjdt', en: 'Downtown San Jovano (San Jose)', zh: '圣霍瓦诺市中心（圣何塞）' },
] as const;
export type TourId = (typeof TOUR_STOPS)[number]['id'];
export const JOB_COPY: Record<(typeof JOB_IDS)[number], { en: string; zh: string }> = {
  oren: {
    en: "Pick up the order at Oren's Hummus, 71 3rd St",
    zh: "到 3rd St 71 号 Oren's Hummus 取餐",
  },
  transamerica: { en: 'Deliver to the Transamerica Pyramid', zh: '送到 Transamerica 金字塔' },
  coit: { en: 'Meet the contact at Coit Tower', zh: '在 Coit Tower 与联络人会合' },
  nvidia_endeavor: {
    en: 'Take US-101 south to NVIDIA Endeavor',
    zh: '沿 US-101 南下前往 NVIDIA Endeavor',
  },
  amd_hq: { en: 'Finish at AMD HQ, Augustine Dr', zh: '在 Augustine Dr 的 AMD 总部完成任务' },
};

export const DISTRICTS: (Point & { r: number; en: string; zh: string })[] = [
  { x: 420, z: -760, r: 520, en: 'Financial District', zh: '金融区' },
  { x: 200, z: -1150, r: 380, en: 'North Beach', zh: '北滩' },
  { x: 120, z: -540, r: 300, en: 'Chinatown', zh: '唐人街' },
  { x: 0, z: 0, r: 300, en: 'Union Square', zh: '联合广场' },
  { x: 700, z: 450, r: 900, en: 'SoMa', zh: 'SoMa' },
  { x: -900, z: -1300, r: 700, en: 'Russian Hill', zh: '俄罗斯山' },
  { x: -400, z: -2200, r: 600, en: "Fisherman's Wharf", zh: '渔人码头' },
  { x: -1000, z: 900, r: 500, en: 'Civic Center', zh: '市政中心' },
  { x: -2200, z: 1300, r: 600, en: 'Alamo Square', zh: '阿拉莫广场' },
  { x: -3000, z: -1700, r: 900, en: 'Marina', zh: '码头区' },
  { x: -1500, z: -300, r: 900, en: 'Nob Hill', zh: '诺布山' },
  { x: 1600, z: 1300, r: 700, en: 'Mission Bay', zh: '米慎湾' },
  { x: 250, z: 3500, r: 1100, en: 'Peninsula', zh: '半岛' },
  { x: -560, z: 4950, r: 600, en: 'Santa Clara', zh: '圣克拉拉' },
  { x: -620, z: 6200, r: 800, en: 'Santa Clara', zh: '圣克拉拉' },
  { x: 1300, z: 5850, r: 900, en: 'Downtown San Jovano', zh: '圣霍瓦诺市中心' },
];

const CELL = 32;
const LANE_CELL = 128;

const scaleColumns = (arr: number[], stride: number, cols: number[]) => {
  const out = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++)
    out[i] = cols.includes(i % stride) ? arr[i] / (i % stride === 3 ? 100 : 10) : arr[i];
  return out;
};

const laneKey = (x: number, z: number) => `${Math.round(x * 2)},${Math.round(z * 2)}`;

export class World {
  readonly x0: number;
  readonly z0: number;
  readonly x1: number;
  readonly z1: number;
  readonly buildings: Building[] = [];
  readonly roads: Road[] = [];
  readonly rails: Rail[] = [];
  readonly trees: Float32Array;
  readonly props: Float32Array;
  readonly parked: Float32Array;
  readonly landmarks: Record<string, Point>;
  readonly freeway: Point[];
  readonly places: Place[];
  /** Drivable lanes (roads split at intersections) for traffic and police. */
  readonly lanes: number[] = [];
  readonly nodes = new Map<string, { road: number; end: 0 | 1 }[]>();
  private readonly hash = new Map<number, number[]>();
  private readonly roadHash = new Map<number, number[]>();
  private readonly laneHash = new Map<number, number[]>();
  private readonly tRes: number;
  private readonly gRes: number;
  private readonly tW: number;
  private readonly tH: number;
  private readonly gW: number;
  private readonly gH: number;

  readonly data: CityData;
  readonly terrain: Raster;
  readonly groundMap: Raster;

  constructor(data: CityData, terrain: Raster, groundMap: Raster) {
    this.data = data;
    this.terrain = terrain;
    this.groundMap = groundMap;
    const g = data.grid;
    this.x0 = g.x0;
    this.z0 = g.z0;
    this.x1 = g.x1;
    this.z1 = g.z1;
    this.tRes = g.terrain;
    this.gRes = g.ground;
    this.tW = terrain.width;
    this.tH = terrain.height;
    this.gW = groundMap.width;
    this.gH = groundMap.height;
    const b = data.buildings;
    for (let i = 0; i < b.length;) {
      const n = b[i + 7];
      const pts = new Float32Array(n * 2);
      let minX = Infinity,
        minZ = Infinity,
        maxX = -Infinity,
        maxZ = -Infinity;
      for (let k = 0; k < n * 2; k += 2) {
        const x = b[i + 8 + k] / 10,
          z = b[i + 9 + k] / 10;
        pts[k] = x;
        pts[k + 1] = z;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
      }
      this.buildings.push({
        base: b[i] / 10,
        height: b[i + 1] / 10,
        minHeight: b[i + 2] / 10,
        style: b[i + 3],
        color: b[i + 4],
        roof: b[i + 5],
        name: b[i + 6] >= 0 ? data.names[b[i + 6]] : '',
        pts,
        minX,
        minZ,
        maxX,
        maxZ,
      });
      i += 8 + n * 2;
    }
    this.buildings.forEach((bd, index) => {
      if (bd.minHeight > 2.5) return; // Bridges and overhangs do not block the street.
      this.cells(bd.minX, bd.minZ, bd.maxX, bd.maxZ, (key) => {
        const list = this.hash.get(key);
        if (list) list.push(index);
        else this.hash.set(key, [index]);
      });
    });
    const rd = data.roads;
    for (let i = 0; i < rd.length;) {
      const n = rd[i + 4];
      const pts = new Float32Array(n * 2),
        dy = new Float32Array(n);
      let length = 0;
      for (let k = 0; k < n; k++) {
        pts[k * 2] = rd[i + 5 + k * 3] / 10;
        pts[k * 2 + 1] = rd[i + 6 + k * 3] / 10;
        dy[k] = rd[i + 7 + k * 3] / 10;
        if (k) length += Math.hypot(pts[k * 2] - pts[k * 2 - 2], pts[k * 2 + 1] - pts[k * 2 - 1]);
      }
      this.roads.push({
        cls: rd[i],
        width: rd[i + 1] / 10,
        oneway: Boolean(rd[i + 2] & 1),
        bridge: Boolean(rd[i + 2] & 2),
        name: rd[i + 3] >= 0 ? data.names[rd[i + 3]] : '',
        pts,
        dy,
        length,
      });
      i += 5 + n * 3;
    }
    // Fictional connector across the gap introduced by compressing the South Bay.
    // Both ends meet existing road geometry; the corridor avoids building footprints.
    for (const [name, points] of [
      ['San Jovano Connector', [203.1, 6190, 605.1, 6174.9]],
      ['Santa Clara Connector', [211.1, 4735.2, 211.1, 4660, -473.1, 4660, -473.1, 4679.9]],
    ] as const) {
      const pts = new Float32Array(points);
      const dy = new Float32Array(pts.length / 2);
      let length = 0;
      for (let i = 0; i < pts.length; i += 2) {
        dy[i / 2] = this.height(pts[i], pts[i + 1]);
        if (i) length += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
      }
      this.roads.push({
        cls: ROAD.primary,
        width: 10,
        oneway: false,
        bridge: false,
        name,
        pts,
        dy,
        length,
      });
    }
    this.splitLanes();
    for (const lane of this.lanes) {
      const r = this.roads[lane];
      const key =
        Math.floor((r.pts[1] - this.z0) / LANE_CELL) * 4096 +
        Math.floor((r.pts[0] - this.x0) / LANE_CELL);
      const list = this.laneHash.get(key);
      if (list) list.push(lane);
      else this.laneHash.set(key, [lane]);
    }
    this.roads.forEach((road, index) => {
      if (road.cls > ROAD.pedestrian) return;
      const P = road.pts;
      for (let k = P.length > 2 ? 2 : 0; k < P.length; k += 2)
        this.cells(
          Math.min(P[k], P[Math.max(0, k - 2)]) - road.width,
          Math.min(P[k + 1], P[Math.max(1, k - 1)]) - road.width,
          Math.max(P[k], P[Math.max(0, k - 2)]) + road.width,
          Math.max(P[k + 1], P[Math.max(1, k - 1)]) + road.width,
          (key) => {
            const list = this.roadHash.get(key);
            if (!list) this.roadHash.set(key, [index]);
            else if (list.at(-1) !== index) list.push(index);
          },
        );
    });
    for (const rail of data.rails) {
      const pts = new Float32Array(rail.pts.flat());
      let length = 0;
      for (let k = 2; k < pts.length; k += 2)
        length += Math.hypot(pts[k] - pts[k - 2], pts[k + 1] - pts[k - 1]);
      this.rails.push({ cable: rail.cable, pts, length });
    }
    this.trees = scaleColumns(data.trees, 3, [0, 1]);
    this.props = scaleColumns(data.props, 4, [1, 2, 3]);
    const parked = new Float32Array(data.parked.length);
    for (let i = 0; i < parked.length; i++) parked[i] = data.parked[i] / (i % 3 === 2 ? 100 : 10);
    this.parked = parked;
    this.landmarks = Object.fromEntries(
      Object.entries(data.landmarks).map(([k, [x, z]]) => [k, { x, z }]),
    );
    this.freeway = data.freeway.map(([x, z]) => ({ x, z }));
    this.places = JOB_IDS.map((id) => ({ id, ...this.landmarks[id], ...JOB_COPY[id] }));
  }

  private cells(minX: number, minZ: number, maxX: number, maxZ: number, fn: (key: number) => void) {
    const i0 = Math.floor((minX - this.x0) / CELL),
      i1 = Math.floor((maxX - this.x0) / CELL),
      j0 = Math.floor((minZ - this.z0) / CELL),
      j1 = Math.floor((maxZ - this.z0) / CELL);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(j * 4096 + i);
  }

  private splitLanes() {
    // Split drivable roads at shared vertices so traffic can turn at every junction.
    const count = new Map<string, number>();
    for (const road of this.roads) {
      if (road.cls > ROAD.service || road.bridge || road.cls === ROAD.motorway) continue;
      for (let k = 0; k < road.pts.length; k += 2) {
        const id = laneKey(road.pts[k], road.pts[k + 1]);
        count.set(id, (count.get(id) || 0) + 1);
      }
    }
    const original = this.roads.length;
    for (let index = 0; index < original; index++) {
      const road = this.roads[index];
      if (road.cls > ROAD.service || road.bridge) continue;
      if (road.cls === ROAD.motorway && road.name !== 'US 101 South Bay Freeway') continue;
      let start = 0;
      const n = road.pts.length / 2;
      for (let k = 1; k < n; k++) {
        const junction = (count.get(laneKey(road.pts[k * 2], road.pts[k * 2 + 1])) || 0) > 1;
        if (k === n - 1 || junction) {
          const pts = road.pts.slice(start * 2, k * 2 + 2);
          let length = 0;
          for (let q = 2; q < pts.length; q += 2)
            length += Math.hypot(pts[q] - pts[q - 2], pts[q + 1] - pts[q - 1]);
          if (length > 2) {
            const id = this.roads.length;
            this.roads.push({
              ...road,
              pts,
              dy: road.dy.slice(start, k + 1),
              length,
              cls: road.cls + 100,
            });
            this.lanes.push(id);
            for (const end of [0, 1] as const) {
              const q = end ? pts.length - 2 : 0;
              const nodeKey = laneKey(pts[q], pts[q + 1]);
              const list = this.nodes.get(nodeKey);
              if (list) list.push({ road: id, end });
              else this.nodes.set(nodeKey, [{ road: id, end }]);
            }
          }
          start = k;
        }
      }
    }
    // Lane copies carry cls + 100 so renderers can skip them.
  }

  /** Lanes whose start lies within roughly r metres of (x, z). */
  lanesNear(x: number, z: number, r: number) {
    const out: number[] = [];
    const i0 = Math.floor((x - r - this.x0) / LANE_CELL),
      i1 = Math.floor((x + r - this.x0) / LANE_CELL),
      j0 = Math.floor((z - r - this.z0) / LANE_CELL),
      j1 = Math.floor((z + r - this.z0) / LANE_CELL);
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const list = this.laneHash.get(j * 4096 + i);
        if (list) for (const lane of list) out.push(lane);
      }
    return out;
  }

  nodeKey(x: number, z: number) {
    return `${Math.round(x * 2)},${Math.round(z * 2)}`;
  }

  /** Bilinear terrain height in metres. */
  height(x: number, z: number) {
    const fx = (x - this.x0) / this.tRes - 0.5,
      fz = (z - this.z0) / this.tRes - 0.5;
    const i = Math.floor(fx),
      j = Math.floor(fz);
    const ax = fx - i,
      az = fz - j;
    const W = this.tW,
      H = this.tH,
      d = this.terrain.data;
    const i0 = Math.max(0, Math.min(W - 1, i)),
      i1 = Math.max(0, Math.min(W - 1, i + 1));
    const j0 = Math.max(0, Math.min(H - 1, j)),
      j1 = Math.max(0, Math.min(H - 1, j + 1));
    return (
      d[j0 * W + i0] * (1 - ax) * (1 - az) +
      d[j0 * W + i1] * ax * (1 - az) +
      d[j1 * W + i0] * (1 - ax) * az +
      d[j1 * W + i1] * ax * az
    );
  }

  /** Height of the drivable surface (terrain, or pier decks above the water line). */
  surface(x: number, z: number) {
    return Math.max(this.height(x, z), this.ground(x, z) === GROUND.pier ? 2.6 : -50);
  }

  ground(x: number, z: number) {
    const i = Math.floor((x - this.x0) / this.gRes),
      j = Math.floor((z - this.z0) / this.gRes);
    if (i < 0 || j < 0 || i >= this.gW || j >= this.gH) return GROUND.water;
    return this.groundMap.data[j * this.gW + i];
  }

  inside(b: Building, x: number, z: number) {
    const p = b.pts;
    let c = false;
    for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
      if (
        p[i + 1] > z !== p[j + 1] > z &&
        x < ((p[j] - p[i]) * (z - p[i + 1])) / (p[j + 1] - p[i + 1]) + p[i]
      )
        c = !c;
    }
    return c;
  }

  edgeDistance(b: Building, x: number, z: number) {
    const p = b.pts;
    let best = Infinity;
    for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
      const ax = p[j],
        az = p[j + 1],
        dx = p[i] - ax,
        dz = p[i + 1] - az;
      const t = Math.max(
        0,
        Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)),
      );
      best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
    }
    return best;
  }

  buildingAt(x: number, z: number, radius = 0) {
    const list = this.hash.get(
      Math.floor((z - this.z0) / CELL) * 4096 + Math.floor((x - this.x0) / CELL),
    );
    if (!list) return -1;
    for (const index of list) {
      const b = this.buildings[index];
      if (x < b.minX - radius || x > b.maxX + radius || z < b.minZ - radius || z > b.maxZ + radius)
        continue;
      if (this.inside(b, x, z) || (radius > 0 && this.edgeDistance(b, x, z) < radius)) return index;
    }
    return -1;
  }

  /** True when a circle at p cannot occupy the world (buildings, open water, edges). */
  blocked(p: Point, radius = 1.2) {
    if (p.x < this.x0 + 40 || p.x > this.x1 - 40 || p.z < this.z0 + 40 || p.z > this.z1 - 40)
      return true;
    if (this.ground(p.x, p.z) === GROUND.water) return true;
    // Check neighbouring cells when the circle crosses a cell boundary.
    const seen = new Set<number>();
    for (const [ox, oz] of [
      [0, 0],
      [radius, 0],
      [-radius, 0],
      [0, radius],
      [0, -radius],
    ]) {
      const list = this.hash.get(
        Math.floor((p.z + oz - this.z0) / CELL) * 4096 + Math.floor((p.x + ox - this.x0) / CELL),
      );
      if (!list) continue;
      for (const index of list) {
        if (seen.has(index)) continue;
        seen.add(index);
        const b = this.buildings[index];
        if (
          p.x < b.minX - radius ||
          p.x > b.maxX + radius ||
          p.z < b.minZ - radius ||
          p.z > b.maxZ + radius
        )
          continue;
        if (this.inside(b, p.x, p.z) || this.edgeDistance(b, p.x, p.z) < radius) return true;
      }
    }
    return false;
  }

  /** Nearest named street within 30 m. */
  street(x: number, z: number) {
    const list = this.roadHash.get(
      Math.floor((z - this.z0) / CELL) * 4096 + Math.floor((x - this.x0) / CELL),
    );
    let best = '',
      bestD = 30;
    for (const index of list || []) {
      const r = this.roads[index];
      if (!r.name) continue;
      for (let k = 2; k < r.pts.length; k += 2) {
        const ax = r.pts[k - 2],
          az = r.pts[k - 1],
          dx = r.pts[k] - ax,
          dz = r.pts[k + 1] - az;
        const t = Math.max(
          0,
          Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)),
        );
        const d = Math.hypot(x - ax - dx * t, z - az - dz * t) - r.width / 2;
        if (d < bestD) {
          bestD = d;
          best = r.name;
        }
      }
    }
    return best;
  }

  district(p: Point) {
    let best = DISTRICTS[0],
      score = Infinity;
    for (const d of DISTRICTS) {
      const s = Math.hypot(p.x - d.x, p.z - d.z) / d.r;
      if (s < score) {
        score = s;
        best = d;
      }
    }
    return best;
  }

  southBay(p: Point) {
    return p.z > 4300;
  }

  /** Point on a lane at distance s from its start, offset to the right-hand side. */
  lanePoint(road: Road, s: number, offset: number) {
    const p = road.pts;
    let acc = 0;
    for (let k = 2; k < p.length; k += 2) {
      const dx = p[k] - p[k - 2],
        dz = p[k + 1] - p[k - 1],
        len = Math.hypot(dx, dz);
      if (acc + len >= s || k === p.length - 2) {
        const t = len ? Math.max(0, Math.min(1, (s - acc) / len)) : 0;
        const ux = dx / (len || 1),
          uz = dz / (len || 1);
        return {
          x: p[k - 2] + dx * t - uz * offset,
          z: p[k - 1] + dz * t + ux * offset,
          angle: Math.atan2(ux, uz),
        };
      }
      acc += len;
    }
    return { x: p[0], z: p[1], angle: 0 };
  }
}

export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);

/** Decode a Terrarium RGB image (R*256 + G + B/256 - 32768) into metres. */
export function decodeTerrarium(rgba: Uint8ClampedArray, width: number, height: number): Raster {
  const data = new Float32Array(width * height);
  for (let i = 0; i < data.length; i++)
    data[i] = rgba[i * 4] * 256 + rgba[i * 4 + 1] + rgba[i * 4 + 2] / 256 - 32768;
  return { width, height, data };
}

async function pixels(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Unable to load ${url}: ${response.status}`);
  const bitmap = await createImageBitmap(await response.blob(), {
    colorSpaceConversion: 'none',
    premultiplyAlpha: 'none',
  });
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

export async function loadWorld(base: string, signal: AbortSignal) {
  const [json, terrain, ground] = await Promise.all([
    fetch(`${base}city.json`, { signal }).then((r) => {
      if (!r.ok) throw new Error(`Unable to load city data: ${r.status}`);
      return r.json() as Promise<CityData>;
    }),
    pixels(`${base}terrain.png`, signal),
    pixels(`${base}ground.png`, signal),
  ]);
  const g = new Uint8Array(ground.width * ground.height);
  for (let i = 0; i < g.length; i++) g[i] = ground.data[i * 4];
  return new World(json, decodeTerrarium(terrain.data, terrain.width, terrain.height), {
    width: ground.width,
    height: ground.height,
    data: g,
  });
}
