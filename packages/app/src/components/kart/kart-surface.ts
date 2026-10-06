import { nearest } from './kart-track';

/**
 * Collision/terrain grid rasterized from the Luigi Circuit course mesh
 * (see public/decorative/kart/README.md). Each cell stores the surface type of
 * the highest drivable triangle and its height.
 */
export const SURFACE = {
  none: 0,
  road: 1,
  offroad: 2,
  sand: 3,
  water: 4,
  wall: 5,
  curb: 6,
  bank: 7,
  boost: 8,
} as const;
export type SurfaceType = (typeof SURFACE)[keyof typeof SURFACE];

export interface SurfaceMap {
  x0: number;
  z0: number;
  res: number;
  width: number;
  height: number;
  type: Uint8Array;
  /** Height in 1/32 course units. */
  y: Int16Array;
}

export function parseSurface(buffer: ArrayBuffer): SurfaceMap {
  const view = new DataView(buffer);
  const magic = String.fromCodePoint(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3),
  );
  if (magic !== 'KSRF') throw new Error('Invalid kart surface map');
  const x0 = view.getFloat32(4, true);
  const z0 = view.getFloat32(8, true);
  const res = view.getFloat32(12, true);
  const width = view.getUint32(20, true);
  const height = view.getUint32(24, true);
  const n = width * height;
  if (buffer.byteLength < 28 + n * 3) throw new Error('Truncated kart surface map');
  const type = new Uint8Array(buffer, 28, n);
  // Int16Array requires 2-byte alignment; copy if the offset is odd.
  const off = 28 + n;
  const y =
    off % 2 === 0 ? new Int16Array(buffer, off, n) : new Int16Array(buffer.slice(off, off + n * 2));
  return { x0, z0, res, width, height, type, y };
}

/** Flat synthetic course around the centerline, used by unit tests and as a fallback. */
export function syntheticSurface(): SurfaceMap {
  const x0 = -260;
  const z0 = -110;
  const res = 2;
  const width = 250;
  const height = 340;
  const type = new Uint8Array(width * height);
  const y = new Int16Array(width * height);
  let hint = -1;
  for (let j = 0; j < height; j++)
    for (let i = 0; i < width; i++) {
      const n = nearest(x0 + (i + 0.5) * res, z0 + (j + 0.5) * res, hint);
      hint = n.index;
      const d = Math.abs(n.lateral);
      type[j * width + i] =
        n.gap > 44 ? SURFACE.wall : d < 15 ? SURFACE.road : d < 17 ? SURFACE.curb : SURFACE.offroad;
    }
  return { x0, z0, res, width, height, type, y };
}

export function surfaceAt(map: SurfaceMap, x: number, z: number): SurfaceType {
  const i = Math.floor((x - map.x0) / map.res);
  const j = Math.floor((z - map.z0) / map.res);
  if (i < 0 || j < 0 || i >= map.width || j >= map.height) return SURFACE.wall;
  return map.type[j * map.width + i] as SurfaceType;
}

/** Bilinear terrain height. Wall/unknown cells borrow their neighbours' heights. */
export function heightAt(map: SurfaceMap, x: number, z: number) {
  const fx = (x - map.x0) / map.res - 0.5;
  const fz = (z - map.z0) / map.res - 0.5;
  const i = Math.max(0, Math.min(map.width - 2, Math.floor(fx)));
  const j = Math.max(0, Math.min(map.height - 2, Math.floor(fz)));
  const u = Math.max(0, Math.min(1, fx - i));
  const v = Math.max(0, Math.min(1, fz - j));
  let sum = 0;
  let weight = 0;
  const add = (ii: number, jj: number, w: number) => {
    const k = jj * map.width + ii;
    if (map.type[k] === SURFACE.wall || map.type[k] === SURFACE.none || w <= 0) return;
    sum += (map.y[k] / 32) * w;
    weight += w;
  };
  add(i, j, (1 - u) * (1 - v));
  add(i + 1, j, u * (1 - v));
  add(i, j + 1, (1 - u) * v);
  add(i + 1, j + 1, u * v);
  if (weight > 0) return sum / weight;
  const k = Math.max(0, Math.min(map.width * map.height - 1, j * map.width + i));
  return map.y[k] / 32;
}
