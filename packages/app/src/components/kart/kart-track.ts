import { CatmullRomCurve3, Vector3 } from 'three';

// Centerline traced against the source course mesh, in its exported world units.
// The racers drive freely; this line is only used for lap progress, ranking, AI
// targets, respawn points, and the minimap. It never steers the player.
const WAYPOINTS = [
  [-204, 258],
  [-204, 170],
  [-202, 82],
  [-187, 33],
  [-130, 12],
  [-74, 4],
  [-29, -11],
  [38, -63],
  [78, -60],
  [123, -17],
  [145, 11],
  [140, 58],
  [96, 110],
  [52, 161],
  [-8, 227],
  [-41, 272],
  [-48, 350],
  [-48, 430],
  [-66, 477],
  [-122, 507],
  [-164, 500],
  [-206, 458],
  [-207, 360],
];
export const TRACK = new CatmullRomCurve3(
  WAYPOINTS.map(([x, z]) => new Vector3(x, 0, z)),
  true,
  'centripetal',
);
TRACK.arcLengthDivisions = 2000;
export const TRACK_LENGTH = TRACK.getLength();
export const SAMPLES = 1200;
export const SAMPLE_STEP = TRACK_LENGTH / SAMPLES;
const sx = new Float64Array(SAMPLES);
const sz = new Float64Array(SAMPLES);
const tx = new Float64Array(SAMPLES);
const tz = new Float64Array(SAMPLES);
for (let i = 0; i < SAMPLES; i++) {
  const p = TRACK.getPointAt(i / SAMPLES);
  const t = TRACK.getTangentAt(i / SAMPLES);
  sx[i] = p.x;
  sz[i] = p.z;
  tx[i] = t.x;
  tz[i] = t.z;
}
// Signed curvature (radians per unit) smoothed over a short window; positive turns left.
const curvature = new Float64Array(SAMPLES);
for (let i = 0; i < SAMPLES; i++) {
  const a = (i - 6 + SAMPLES) % SAMPLES;
  const b = (i + 6) % SAMPLES;
  const ha = Math.atan2(tx[a], tz[a]);
  const hb = Math.atan2(tx[b], tz[b]);
  curvature[i] = wrapAngle(hb - ha) / (12 * SAMPLE_STEP);
}

export function wrapAngle(a: number) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
export const mod = (v: number, m: number) => ((v % m) + m) % m;

export interface TrackPoint {
  x: number;
  z: number;
  /** Unit tangent in X/Z. */
  tx: number;
  tz: number;
  heading: number;
}
/** Point on the centerline at `distance`, optionally offset sideways (+ is left of travel). */
export function pointAt(distance: number, lane = 0): TrackPoint {
  const f = mod(distance, TRACK_LENGTH) / SAMPLE_STEP;
  const i = Math.floor(f) % SAMPLES;
  const j = (i + 1) % SAMPLES;
  const u = f - Math.floor(f);
  let ttx = tx[i] + (tx[j] - tx[i]) * u;
  let ttz = tz[i] + (tz[j] - tz[i]) * u;
  const len = Math.hypot(ttx, ttz) || 1;
  ttx /= len;
  ttz /= len;
  const x = sx[i] + (sx[j] - sx[i]) * u + ttz * lane;
  const z = sz[i] + (sz[j] - sz[i]) * u - ttx * lane;
  return { x, z, tx: ttx, tz: ttz, heading: Math.atan2(ttx, ttz) };
}
export function curvatureAt(distance: number) {
  return curvature[Math.floor(mod(distance, TRACK_LENGTH) / SAMPLE_STEP) % SAMPLES];
}
/** Nearest centerline distance (0..TRACK_LENGTH) and signed lateral offset (+ left). */
export function nearest(x: number, z: number, hint = -1) {
  let best = -1;
  let bestD = Infinity;
  const scan = (from: number, to: number) => {
    for (let k = from; k <= to; k++) {
      const i = mod(k, SAMPLES);
      const d = (sx[i] - x) ** 2 + (sz[i] - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
  };
  if (hint >= 0) scan(hint - 90, hint + 90);
  if (best < 0 || bestD > 50 * 50) scan(0, SAMPLES - 1);
  const i = best;
  const j = (i + 1) % SAMPLES;
  const ex = sx[j] - sx[i];
  const ez = sz[j] - sz[i];
  const el = ex * ex + ez * ez || 1;
  const u = Math.max(-1, Math.min(1, ((x - sx[i]) * ex + (z - sz[i]) * ez) / el));
  const lateral = (x - sx[i]) * tz[i] - (z - sz[i]) * tx[i];
  return {
    index: i,
    distance: mod((i + u) * SAMPLE_STEP, TRACK_LENGTH),
    lateral,
    gap: Math.sqrt(bestD),
    tx: tx[i],
    tz: tz[i],
  };
}
/** Item box rows (distance along the lap, five boxes across). */
export const ITEM_ROWS = [0.205, 0.585, 0.83].map((f) => f * TRACK_LENGTH);
export const ITEM_LANES = [-11, -5.5, 0, 5.5, 11];
export function minimapPath(steps = 160) {
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const p = pointAt((i / steps) * TRACK_LENGTH);
    pts.push([p.x, p.z]);
  }
  return pts;
}
