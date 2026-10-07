import data from './san-paloma.json';
export interface GeoPoint {
  x: number;
  z: number;
}
export const geoPoint = (p: number[]): GeoPoint => ({ x: p[0], z: p[1] });
export const project = (lon: number, lat: number): GeoPoint => ({
  x: (lon + 122.4) * 87930,
  z: (37.792 - lat) * 111320,
});
export const STREETS_SF = data.streets.map((s) => ({ ...s, points: s.points.map(geoPoint) }));
// The southern corridor is deliberately compressed, not a survey of the peninsula.
const gateway = STREETS_SF.flatMap((s) => [
  { id: s.a, point: s.points[0] },
  { id: s.b, point: s.points.at(-1)! },
]).sort(
  (a, b) => Math.hypot(a.point.x, a.point.z - 1000) - Math.hypot(b.point.x, b.point.z - 1000),
)[0];
const southNodes = [
  gateway,
  { id: 'south-1', point: { x: 0, z: 1000 } },
  { id: 'south-2', point: { x: 0, z: 1900 } },
  { id: 'south-3', point: { x: 0, z: 2200 } },
  { id: 'south-4', point: { x: 500, z: 2200 } },
  { id: 'south-5', point: { x: 500, z: 2800 } },
];
southNodes.slice(1).forEach((node, i) =>
  STREETS_SF.push({
    id: `connector-${i}`,
    name: i < 2 ? 'PENINSULA EXPRESSWAY' : 'SOUTH BAY',
    a: southNodes[i].id,
    b: node.id,
    width: i < 2 ? 26 : 18,
    points: [southNodes[i].point, node.point],
  }),
);
const northGate = STREETS_SF.flatMap((s) => [
  { id: s.a, point: s.points[0] },
  { id: s.b, point: s.points.at(-1)! },
]).find((node) => node.id === '24800000.0')!;
STREETS_SF.push(
  {
    id: 'telegraph-approach',
    name: 'TELEGRAPH HILL SCENIC ROAD',
    a: northGate.id,
    b: 'coit-stop',
    width: 12,
    points: [
      northGate.point,
      { x: northGate.point.x, z: -920 },
      { x: -650, z: -920 },
      { x: -650, z: -1030 },
    ],
  },
  {
    id: 'bridge-vista',
    name: 'GOLDEN GATE VISTA',
    a: 'coit-stop',
    b: 'bridge-stop',
    width: 12,
    points: [
      { x: -650, z: -1030 },
      { x: -800, z: -1030 },
    ],
  },
);
export const FOOTPRINTS = data.buildings.map((b, i) => {
  const ring = b.ring.map(geoPoint);
  const minX = Math.min(...ring.map((p) => p.x)),
    maxX = Math.max(...ring.map((p) => p.x));
  const minZ = Math.min(...ring.map((p) => p.z)),
    maxZ = Math.max(...ring.map((p) => p.z));
  return {
    ...b,
    ring,
    x: (minX + maxX) / 2,
    z: (minZ + maxZ) / 2,
    w: maxX - minX,
    d: maxZ - minZ,
    style: i % 4,
  };
});
for (const [i, x, z, w, d, h] of [
  [1, 260, 2130, 170, 85, 28],
  [2, 640, 2730, 80, 70, 82],
  [3, 390, 2670, 70, 90, 45],
  [4, 620, 2860, 100, 80, 35],
  [5, 350, 2860, 90, 95, 30],
]) {
  FOOTPRINTS.push({
    id: `south-${i}`,
    x,
    z,
    w,
    d,
    h,
    style: i,
    ring: [
      { x: x - w / 2, z: z - d / 2 },
      { x: x - w / 2, z: z + d / 2 },
      { x: x + w / 2, z: z + d / 2 },
      { x: x + w / 2, z: z - d / 2 },
    ],
  });
}
// Condensed campus geometry. The same outlines drive rendering and collision.
export const NVIDIA_BUILDINGS = [
  {
    id: 'nvidia-endeavor',
    x: -125,
    z: 1850,
    h: 16,
    ring: [
      { x: -205, z: 1890 },
      { x: -45, z: 1890 },
      { x: -125, z: 1760 },
    ],
  },
  {
    id: 'nvidia-voyager',
    x: -235,
    z: 1650,
    h: 21,
    ring: [
      { x: -320, z: 1665 },
      { x: -275, z: 1730 },
      { x: -195, z: 1730 },
      { x: -150, z: 1665 },
      { x: -195, z: 1595 },
      { x: -275, z: 1595 },
    ],
  },
];
for (const b of NVIDIA_BUILDINGS) {
  const xs = b.ring.map((p) => p.x),
    zs = b.ring.map((p) => p.z);
  FOOTPRINTS.push({
    ...b,
    x: (Math.max(...xs) + Math.min(...xs)) / 2,
    z: (Math.max(...zs) + Math.min(...zs)) / 2,
    w: Math.max(...xs) - Math.min(...xs),
    d: Math.max(...zs) - Math.min(...zs),
    style: 2,
  });
}
const roundFootprint = (x: number, z: number, r: number) =>
  Array.from({ length: 24 }, (_, i) => ({
    x: x + Math.cos((i * Math.PI) / 12) * r,
    z: z + Math.sin((i * Math.PI) / 12) * r,
  }));
const salesforce = FOOTPRINTS.find((b) => inside({ x: 290, z: 256 }, b.ring));
if (salesforce)
  Object.assign(salesforce, {
    x: 290,
    z: 256,
    w: 44,
    d: 44,
    h: 250,
    ring: roundFootprint(290, 256, 22),
  });
FOOTPRINTS.push({
  id: 'coit-tower',
  x: -600,
  z: -1060,
  w: 20,
  d: 20,
  h: 52,
  style: 0,
  ring: roundFootprint(-600, -1060, 10),
});
export function segmentDistance(p: GeoPoint, a: GeoPoint, b: GeoPoint) {
  const dx = b.x - a.x,
    dz = b.z - a.z;
  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)),
  );
  return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz);
}
export function inside(p: GeoPoint, ring: GeoPoint[]) {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x)
      result = !result;
  }
  return result;
}
const graph = new Map<
  string,
  { point: GeoPoint; edges: { to: string; points: GeoPoint[]; length: number }[] }
>();
for (const s of STREETS_SF) {
  // Omit survey overlaps and non-driveable covered passages from vehicle routes.
  let obstructed = false;
  for (let i = 1; i < s.points.length && !obstructed; i++) {
    const a = s.points[i - 1],
      b = s.points[i],
      steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 4);
    for (let k = 0; k <= steps && !obstructed; k++) {
      const p = { x: a.x + ((b.x - a.x) * k) / steps, z: a.z + ((b.z - a.z) * k) / steps };
      obstructed = FOOTPRINTS.some(
        (f) =>
          Math.abs(p.x - f.x) < f.w / 2 + 2 &&
          Math.abs(p.z - f.z) < f.d / 2 + 2 &&
          (inside(p, f.ring) ||
            f.ring.some((q, j) => segmentDistance(p, q, f.ring[(j + 1) % f.ring.length]) < 2)),
      );
    }
  }
  if (obstructed) continue;
  if (!graph.has(s.a)) graph.set(s.a, { point: s.points[0], edges: [] });
  if (!graph.has(s.b)) graph.set(s.b, { point: s.points.at(-1)!, edges: [] });
  const length = s.points
    .slice(1)
    .reduce((n, p, i) => n + Math.hypot(p.x - s.points[i].x, p.z - s.points[i].z), 0);
  graph.get(s.a)!.edges.push({ to: s.b, points: s.points, length });
  graph.get(s.b)!.edges.push({ to: s.a, points: s.points.toReversed(), length });
}
export function nearestRoadPoint(p: GeoPoint, streetName?: string) {
  let best = p,
    distance = Infinity;
  for (const s of STREETS_SF.filter((street) => !streetName || street.name === streetName))
    for (let i = 1; i < s.points.length; i++) {
      const a = s.points[i - 1],
        b = s.points[i],
        dx = b.x - a.x,
        dz = b.z - a.z;
      const t = Math.max(
        0,
        Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)),
      );
      const q = { x: a.x + t * dx, z: a.z + t * dz },
        d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < distance) {
        distance = d;
        best = q;
      }
    }
  return best;
}
export function roadHeading(p: GeoPoint) {
  let angle = Math.PI,
    distance = Infinity;
  for (const s of STREETS_SF)
    for (let i = 1; i < s.points.length; i++) {
      const a = s.points[i - 1],
        b = s.points[i],
        d = segmentDistance(p, a, b);
      if (d < distance) {
        distance = d;
        angle = Math.atan2(b.x - a.x, b.z - a.z);
        if (Math.cos(angle) > 0) angle += Math.PI;
      }
    }
  return angle;
}
function nearestNode(p: GeoPoint) {
  let best = '',
    distance = Infinity;
  for (const [id, n] of graph) {
    const d = Math.hypot(n.point.x - p.x, n.point.z - p.z);
    if (d < distance) {
      distance = d;
      best = id;
    }
  }
  return best;
}
export function streetRoute(from: GeoPoint, to: GeoPoint): GeoPoint[] {
  const start = nearestNode(from),
    end = nearestNode(to);
  const costs = new Map([[start, 0]]),
    previous = new Map<string, { id: string; points: GeoPoint[] }>();
  const open = new Set([start]);
  while (open.size > 0) {
    let current = '',
      low = Infinity;
    for (const id of open)
      if (costs.get(id)! < low) {
        low = costs.get(id)!;
        current = id;
      }
    open.delete(current);
    if (current === end) break;
    for (const edge of graph.get(current)?.edges ?? []) {
      const cost = low + edge.length;
      if (cost < (costs.get(edge.to) ?? Infinity)) {
        costs.set(edge.to, cost);
        previous.set(edge.to, { id: current, points: edge.points });
        open.add(edge.to);
      }
    }
  }
  if (start !== end && !previous.has(end)) return [];
  const segments: GeoPoint[][] = [];
  for (let id = end; id !== start;) {
    const step = previous.get(id)!;
    segments.unshift(step.points);
    id = step.id;
  }
  return segments.length > 0
    ? segments.flatMap((s, i) => (i ? s.slice(1) : s))
    : [graph.get(start)!.point];
}
export const BAY_LANDMARKS = [
  { id: 'transamerica', name: 'Transamerica Pyramid', ...project(-122.4028, 37.7952) },
  { id: 'ferry', name: 'Ferry Building', ...project(-122.3936, 37.7955) },
  { id: 'orens', name: "Oren's Hummus", ...project(-122.4035, 37.7869) },
];
