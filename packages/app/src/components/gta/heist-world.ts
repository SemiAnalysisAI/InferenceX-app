export interface Point {
  x: number;
  y: number;
}
export type Office = Point & { id: string; name: string; city: string; color: string };
export const WORLD = { width: 2400, height: 1900 };
export const SAFEHOUSE: Point = { x: 570, y: 630 };
export const OFFICES: Office[] = [
  { id: 'openai', name: 'OpenAI', city: 'San Francisco', x: 640, y: 450, color: '#9ee6ce' },
  { id: 'anthropic', name: 'Anthropic', city: 'San Francisco', x: 610, y: 260, color: '#dfaa8b' },
  { id: 'meta', name: 'Meta', city: 'Menlo Park', x: 950, y: 1090, color: '#74baff' },
  { id: 'google', name: 'Google', city: 'Mountain View', x: 1200, y: 1350, color: '#f4ca65' },
  { id: 'apple', name: 'Apple', city: 'Cupertino', x: 1160, y: 1660, color: '#e4e9e6' },
  { id: 'nvidia', name: 'NVIDIA', city: 'Santa Clara', x: 1510, y: 1570, color: '#a8da62' },
  { id: 'amd', name: 'AMD', city: 'Santa Clara', x: 1700, y: 1470, color: '#f28d79' },
];
export const BAY: Point[] = [
  { x: 800, y: 80 },
  { x: 1350, y: 50 },
  { x: 1570, y: 480 },
  { x: 1950, y: 940 },
  { x: 1800, y: 1270 },
  { x: 1460, y: 1410 },
  { x: 1260, y: 1250 },
  { x: 1100, y: 1050 },
  { x: 900, y: 680 },
  { x: 760, y: 400 },
];
export const ROADS: Point[][] = [
  // Peninsula spine and campus driveways; intentionally schematic, not navigation data.
  [
    { x: 610, y: 170 },
    { x: 610, y: 260 },
    { x: 640, y: 450 },
    SAFEHOUSE,
    { x: 700, y: 800 },
    { x: 950, y: 1090 },
    { x: 1200, y: 1350 },
    { x: 1510, y: 1570 },
    { x: 1700, y: 1470 },
    { x: 1930, y: 1670 },
  ],
  [
    SAFEHOUSE,
    { x: 380, y: 800 },
    { x: 600, y: 1150 },
    { x: 860, y: 1440 },
    { x: 1160, y: 1660 },
    { x: 1510, y: 1570 },
  ],
  [
    { x: 1200, y: 1350 },
    { x: 1160, y: 1660 },
  ],
  [
    { x: 640, y: 450 },
    { x: 810, y: 380 },
    { x: 1690, y: 460 },
    { x: 1940, y: 880 },
    { x: 2070, y: 1220 },
    { x: 1930, y: 1670 },
  ],
  [
    { x: 950, y: 1090 },
    { x: 1140, y: 990 },
    { x: 1940, y: 880 },
  ],
  [
    { x: 1200, y: 1350 },
    { x: 1370, y: 1230 },
    { x: 2070, y: 1220 },
  ],
  [
    { x: 350, y: 260 },
    { x: 610, y: 260 },
    { x: 690, y: 260 },
  ],
  [
    { x: 350, y: 450 },
    { x: 640, y: 450 },
  ],
  [{ x: 350, y: 260 }, { x: 350, y: 630 }, SAFEHOUSE],
  [
    { x: 1510, y: 1570 },
    { x: 1510, y: 1740 },
    { x: 1930, y: 1670 },
  ],
];
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export function segmentDistance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)),
  );
  return distance(p, { x: a.x + dx * t, y: a.y + dy * t });
}

export function onRoad(p: Point, width = 35) {
  return ROADS.some((road) =>
    road.some((a, i) => i > 0 && segmentDistance(p, road[i - 1], a) < width),
  );
}

export function inBay(p: Point) {
  let inside = false;
  for (let i = 0, j = BAY.length - 1; i < BAY.length; j = i++) {
    const a = BAY[i];
    const b = BAY[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  return inside;
}

export type Building = Point & { w: number; h: number; tone: number };
export const BUILDINGS: Building[] = [];
for (let y = 180; y < WORLD.height - 100; y += 90) {
  for (let x = 260; x < WORLD.width - 180; x += 90) {
    const p = { x, y };
    if (
      inBay(p) ||
      onRoad(p, 115) ||
      distance(p, SAFEHOUSE) < 140 ||
      OFFICES.some((office) => distance(p, office) < 150) ||
      (x * 7 + y * 13) % 11 < 3
    )
      continue;
    const nearCity = (x < 740 && y < 760) || y > 1260 || x > 1750;
    if (nearCity)
      BUILDINGS.push({ ...p, w: 48 + (x % 3) * 7, h: 42 + (y % 4) * 5, tone: (x + y) % 3 });
  }
}

export function driveable(p: Point) {
  return (
    p.x > 70 &&
    p.y > 70 &&
    p.x < WORLD.width - 70 &&
    p.y < WORLD.height - 70 &&
    (!inBay(p) || onRoad(p, 26)) &&
    !BUILDINGS.some(
      (b) => p.x > b.x - 12 && p.x < b.x + b.w + 12 && p.y > b.y - 12 && p.y < b.y + b.h + 12,
    )
  );
}

const key = (p: Point) => `${p.x},${p.y}`;

/** Follow the connected road graph instead of drawing GPS lines through the bay. */
export function routeTo(from: Point, target: Point): Point[] {
  const nodes = ROADS.flat();
  const nearest = nodes.reduce((best, p) => (distance(p, from) < distance(best, from) ? p : best));
  const end = nodes.reduce((best, p) => (distance(p, target) < distance(best, target) ? p : best));
  const costs = new Map([[key(nearest), 0]]);
  const previous = new Map<string, Point>();
  const pending = new Map(nodes.map((p) => [key(p), p]));
  while (pending.size > 0) {
    const next = [...pending.values()].reduce((a, b) =>
      (costs.get(key(a)) ?? Infinity) < (costs.get(key(b)) ?? Infinity) ? a : b,
    );
    const cost = costs.get(key(next)) ?? Infinity;
    if (!Number.isFinite(cost) || key(next) === key(end)) break;
    pending.delete(key(next));
    for (const road of ROADS) {
      for (let i = 0; i < road.length; i++) {
        if (key(road[i]) !== key(next)) continue;
        for (const neighbor of [road[i - 1], road[i + 1]]) {
          if (!neighbor) continue;
          const value = cost + distance(next, neighbor);
          if (value < (costs.get(key(neighbor)) ?? Infinity)) {
            costs.set(key(neighbor), value);
            previous.set(key(neighbor), next);
          }
        }
      }
    }
  }
  const path = [end];
  let cursor = end;
  while (previous.has(key(cursor)) && path.length < nodes.length) {
    cursor = previous.get(key(cursor))!;
    path.unshift(cursor);
  }
  return [from, ...path, target];
}
