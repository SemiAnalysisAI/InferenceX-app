export interface Point {
  x: number;
  z: number;
}
export const STREETS = [-100, 0, 100, 200, 300, 400, 500];
export const START = { x: 0, z: 28 };
export const GARAGE = { x: -100, z: 100 };
export const ROAD_HALF = 13;
export const VEHICLES = ['adder', 'buffalo', 'blista', 'taxi'] as const;
export type Vehicle = (typeof VEHICLES)[number];
export const DISTRICTS = [
  { x: 0, z: 0, en: 'Vespucci Run', zh: 'Vespucci 街区' },
  { x: 100, z: 300, en: 'Downtown', zh: '市中心' },
  { x: 400, z: 300, en: 'Vinewood Heights', zh: 'Vinewood 高地' },
];
export const JOBS = [
  { x: 0, z: 100, en: 'Beach pickup', zh: '海滩取货' },
  { x: 300, z: 100, en: 'Downtown exchange', zh: '市中心交接' },
  { x: 400, z: 400, en: 'Vinewood delivery', zh: 'Vinewood 送货' },
  { x: -100, z: 400, en: 'Pier rendezvous', zh: '码头会合' },
  { ...GARAGE, en: 'Return to the garage', zh: '返回车库' },
];
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
export const road = (p: Point, margin = ROAD_HALF) =>
  STREETS.some((v) => Math.abs(p.x - v) < margin || Math.abs(p.z - v) < margin);
export const BUILDINGS: (Point & { w: number; d: number; h: number; style: number })[] = [];
for (let x = 0; x < 500; x += 100)
  for (let z = -100; z < 500; z += 100) {
    if (x === 0 && z === 100) continue; // Public park.
    const style = (x / 100 + z / 100 + 7) % 4;
    for (let i = 0; i < 2; i++)
      for (let k = 0; k < 2; k++) {
        BUILDINGS.push({
          x: x + 31 + i * 38,
          z: z + 31 + k * 38,
          w: 29,
          d: 29,
          h: x >= 200 && z >= 100 ? 28 + ((x + z + i * 47 + k * 83) % 110) : 8 + style * 5 + i * 3,
          style,
        });
      }
  }
export function blocked(p: Point, radius = 1.2) {
  const onPier = p.x >= -273 + radius && p.x <= -120 && Math.abs(p.z - 300) < 11 - radius;
  if (
    (!onPier && p.x < -230 + radius) ||
    p.x > 529 - radius ||
    p.z < -129 + radius ||
    p.z > 529 - radius
  )
    return true;
  return BUILDINGS.some(
    (b) => Math.abs(p.x - b.x) < b.w / 2 + radius && Math.abs(p.z - b.z) < b.d / 2 + radius,
  );
}
export function lanePoint(progress: number, lane: number): Point & { angle: number } {
  const min = -100 + lane * 100,
    max = 500 - lane * 100,
    length = max - min;
  const t = ((progress % (length * 4)) + length * 4) % (length * 4);
  const off = 5;
  if (t < length) return { x: min + t, z: min + off, angle: Math.PI / 2 };
  if (t < length * 2) return { x: max - off, z: min + t - length, angle: 0 };
  if (t < length * 3) return { x: max - (t - length * 2), z: max - off, angle: -Math.PI / 2 };
  return { x: min + off, z: max - (t - length * 3), angle: Math.PI };
}
