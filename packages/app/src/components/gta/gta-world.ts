import {
  BAY_LANDMARKS,
  FOOTPRINTS,
  inside,
  nearestRoadPoint,
  roadHeading,
  segmentDistance,
  STREETS_SF,
  streetRoute,
} from './gta-geography';
export interface Point {
  x: number;
  z: number;
}
export const STREETS = [-100, 0, 100, 200, 300, 400, 500];
export const START = nearestRoadPoint(BAY_LANDMARKS[2], '03RD ST');
export const START_ANGLE = roadHeading(START);
export const GARAGE = { ...START };
export const ROAD_HALF = 13;
export const VEHICLES = ['adder', 'buffalo', 'blista', 'taxi'] as const;
export type Vehicle = (typeof VEHICLES)[number];
export const DISTRICTS = [
  { x: 0, z: 0, en: 'San Paloma', zh: 'San Paloma' },
  { x: 0, z: 2000, en: 'Santa Clara', zh: 'Santa Clara' },
  { x: 500, z: 2700, en: 'San Jose', zh: 'San Jose' },
];
export const JOBS = [
  { ...START, en: "Oren's Hummus pickup", zh: "Oren's Hummus 取货" },
  { ...nearestRoadPoint(BAY_LANDMARKS[1]), en: 'Ferry Building exchange', zh: '渡轮大厦交接' },
  { x: 0, z: 1900, en: 'NVIDIA campus delivery', zh: 'NVIDIA 园区送货' },
  { x: 300, z: 2200, en: 'AMD campus delivery', zh: 'AMD 园区送货' },
  { ...GARAGE, en: 'Return to the garage', zh: '返回车库' },
];
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
export const road = (p: Point, margin = ROAD_HALF) =>
  STREETS_SF.some((s) =>
    s.points.slice(1).some((q, i) => segmentDistance(p, s.points[i], q) < margin),
  );
export const BUILDINGS = FOOTPRINTS;
const cells = new Map<string, typeof BUILDINGS>();
for (const b of BUILDINGS)
  for (let x = Math.floor((b.x - b.w / 2) / 50); x <= Math.floor((b.x + b.w / 2) / 50); x++)
    for (let z = Math.floor((b.z - b.d / 2) / 50); z <= Math.floor((b.z + b.d / 2) / 50); z++) {
      const key = `${x},${z}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key)!.push(b);
    }
export function blocked(p: Point, radius = 1.2) {
  if (p.x < -860 + radius || p.x > 950 - radius || p.z < -1150 + radius || p.z > 2980 - radius)
    return true;
  for (let x = Math.floor((p.x - radius) / 50); x <= Math.floor((p.x + radius) / 50); x++)
    for (let z = Math.floor((p.z - radius) / 50); z <= Math.floor((p.z + radius) / 50); z++)
      for (const b of cells.get(`${x},${z}`) ?? [])
        if (
          inside(p, b.ring) ||
          b.ring.some((q, i) => segmentDistance(p, q, b.ring[(i + 1) % b.ring.length]) < radius)
        )
          return true;
  return false;
}
export const DESTINATIONS = [
  { ...START, en: "Oren's Hummus", zh: "Oren's Hummus" },
  { ...nearestRoadPoint(BAY_LANDMARKS[1]), en: 'Ferry Building', zh: '渡轮大厦' },
  { ...nearestRoadPoint(BAY_LANDMARKS[0]), en: 'Transamerica Pyramid', zh: '泛美金字塔' },
  { ...nearestRoadPoint({ x: 290, z: 256 }), en: 'Salesforce Tower', zh: 'Salesforce Tower' },
  { x: -650, z: -1030, en: 'Coit Tower · condensed hill', zh: '科伊特塔 · 缩比例山丘' },
  { x: -800, z: -1030, en: 'Golden Gate viewpoint', zh: '金门大桥观景点' },
  { x: 0, z: 1850, en: 'NVIDIA HQ · Santa Clara', zh: 'NVIDIA 总部 · Santa Clara' },
  { x: 300, z: 2200, en: 'AMD HQ · Santa Clara', zh: 'AMD 总部 · Santa Clara' },
  { x: 500, z: 2740, en: 'Downtown San Jose', zh: 'San Jose 市中心' },
];
const circuits = [
  [START, nearestRoadPoint(BAY_LANDMARKS[0]), nearestRoadPoint(BAY_LANDMARKS[1]), START],
  [
    nearestRoadPoint({ x: -600, z: 300 }),
    nearestRoadPoint({ x: -600, z: -500 }),
    nearestRoadPoint({ x: 0, z: -500 }),
    START,
    nearestRoadPoint({ x: -600, z: 300 }),
  ],
  [
    nearestRoadPoint({ x: 0, z: 500 }),
    nearestRoadPoint({ x: 600, z: 500 }),
    nearestRoadPoint({ x: 600, z: -200 }),
    nearestRoadPoint({ x: 0, z: 500 }),
  ],
].map((points) => {
  const route = points.slice(1).flatMap((p, i) => streetRoute(points[i], p));
  const lengths = route.slice(1).map((p, i) => distance(p, route[i]));
  return { points: route, lengths, total: lengths.reduce((a, b) => a + b, 0) };
});
export function lanePoint(progress: number, lane: number): Point & { angle: number } {
  const { points, lengths, total } = circuits[lane % circuits.length];
  let t = ((progress % total) + total) % total;
  for (let i = 0; i < lengths.length; i++) {
    if (t <= lengths[i] && lengths[i] > 0) {
      const a = points[i],
        b = points[i + 1],
        f = t / lengths[i],
        angle = Math.atan2(b.x - a.x, b.z - a.z);
      return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, angle };
    }
    t -= lengths[i];
  }
  return { ...START, angle: Math.PI };
}
