/**
 * Typed arrays for one chip's surface. Pure, no three.js, so the hole handling and
 * the normals are unit-testable without a GL context.
 *
 * The grid is allocated dense — one vertex per (slice, time sample) — but only
 * quads whose four corners all carry a measured value are indexed. Vertices that
 * belong solely to holes simply go unreferenced, which keeps a direct
 * `(zi, ti) → vertex` mapping that the isoline and the hover lookup both reuse.
 * At 20 × 120 the wasted vertices are irrelevant; the alternative — compacting the
 * grid — would cost that mapping and every consumer would need a lookup table.
 *
 * Holes are not decoration. A read outside a run's measured interactivity range is
 * dropped rather than clamped, so at the extremes of the interactivity axis most
 * cells are genuinely empty, and bridging them would draw economics for operating
 * points nobody ever benchmarked.
 */

import type { SurfaceScales } from './surfaceScales';

export interface SurfaceArrays {
  /** `nz * nt * 3`. Hole vertices are positioned but never indexed. */
  positions: Float32Array;
  normals: Float32Array;
  /** Triangles, two per complete quad. */
  index: Uint32Array;
  /** Grid lines only — no triangulation diagonals. */
  wireIndex: Uint32Array;
  /** `quad → zi * CELL_STRIDE + ti`, shared by that quad's two triangles. */
  faceToCell: Uint32Array;
  /** Live cells, for coverage reporting. */
  filled: number;
}

/**
 * Packing base for `faceToCell`. Decimal rather than a hex mask because oxfmt and
 * oxlint disagree on hex-literal case and the repo has no other hex literals.
 */
const CELL_STRIDE = 65_536;

/** Wire density: enough to read as a grid, not so much it becomes a tint. */
const WIRE_EVERY_Z = 2;
const WIRE_EVERY_T = 6;

/**
 * Central difference over *valid* neighbours, falling back to one-sided at a hole
 * border. `computeVertexNormals` would average face normals instead, which leaves
 * every hole edge lit by its single surviving triangle and reads as a bright seam.
 */
function slopeAlong(
  value: (i: number) => number | null,
  coord: (i: number) => number,
  i: number,
  n: number,
): { dValue: number; dCoord: number } {
  const here = value(i);
  if (here === null) return { dValue: 0, dCoord: 1 };
  const prev = i > 0 ? value(i - 1) : null;
  const next = i < n - 1 ? value(i + 1) : null;
  if (prev !== null && next !== null) {
    return { dValue: next - prev, dCoord: coord(i + 1) - coord(i - 1) };
  }
  if (next !== null) return { dValue: next - here, dCoord: coord(i + 1) - coord(i) };
  if (prev !== null) return { dValue: here - prev, dCoord: coord(i) - coord(i - 1) };
  // An isolated cell has no gradient; point straight up.
  return { dValue: 0, dCoord: 1 };
}

export function buildSurfaceArrays(
  cells: readonly (number | null)[][],
  scales: SurfaceScales,
  times: readonly number[],
  zs: readonly number[],
): SurfaceArrays {
  const nz = zs.length;
  const nt = times.length;
  const vertices = nz * nt;
  const positions = new Float32Array(vertices * 3);
  const normals = new Float32Array(vertices * 3);
  const at = (zi: number, ti: number) => zi * nt + ti;

  const xs = times.map((ms) => scales.xOf(ms));
  const zws = zs.map((z) => scales.zOf(z));

  let filled = 0;
  for (let zi = 0; zi < nz; zi += 1) {
    const row = cells[zi] ?? [];
    for (let ti = 0; ti < nt; ti += 1) {
      const value = row[ti] ?? null;
      const o = at(zi, ti) * 3;
      positions[o] = xs[ti]!;
      // Holes sit on the break-even plane and are never indexed; parking them at a
      // finite coordinate keeps the bounding sphere sane for raycast culling.
      positions[o + 1] = value === null ? 0 : scales.yOf(value);
      positions[o + 2] = zws[zi]!;
      if (value !== null) filled += 1;
    }
  }

  for (let zi = 0; zi < nz; zi += 1) {
    for (let ti = 0; ti < nt; ti += 1) {
      const o = at(zi, ti) * 3;
      if ((cells[zi]?.[ti] ?? null) === null) {
        normals[o + 1] = 1;
        continue;
      }
      const alongT = slopeAlong(
        (i) => cells[zi]?.[i] ?? null,
        (i) => xs[i]!,
        ti,
        nt,
      );
      const alongZ = slopeAlong(
        (i) => cells[i]?.[ti] ?? null,
        (i) => zws[i]!,
        zi,
        nz,
      );

      // A height field y = f(x, z) has tangents Tx = (dx, dyx, 0) and
      // Tz = (0, dyz, dz); the normal is Tx × Tz, negated so it points up
      // (the raw cross product has ny = -dx·dz, which faces the floor).
      const dx = alongT.dCoord || 1;
      const dz = alongZ.dCoord || 1;
      const dyx = scaleDelta(scales, alongT.dValue);
      const dyz = scaleDelta(scales, alongZ.dValue);
      const nx = -dyx * dz;
      const ny = dx * dz;
      const nzc = -dx * dyz;
      const length = Math.hypot(nx, ny, nzc) || 1;
      normals[o] = nx / length;
      normals[o + 1] = ny / length;
      normals[o + 2] = nzc / length;
    }
  }

  const maxQuads = Math.max(0, (nz - 1) * (nt - 1));
  const index = new Uint32Array(maxQuads * 6);
  const faceToCell = new Uint32Array(maxQuads);
  let ip = 0;
  let qp = 0;
  for (let zi = 0; zi < nz - 1; zi += 1) {
    for (let ti = 0; ti < nt - 1; ti += 1) {
      if (
        (cells[zi]?.[ti] ?? null) === null ||
        (cells[zi]?.[ti + 1] ?? null) === null ||
        (cells[zi + 1]?.[ti] ?? null) === null ||
        (cells[zi + 1]?.[ti + 1] ?? null) === null
      ) {
        continue;
      }
      const a = at(zi, ti);
      const b = at(zi, ti + 1);
      const c = at(zi + 1, ti + 1);
      const d = at(zi + 1, ti);
      index[ip] = a;
      index[ip + 1] = b;
      index[ip + 2] = c;
      index[ip + 3] = a;
      index[ip + 4] = c;
      index[ip + 5] = d;
      ip += 6;
      faceToCell[qp] = zi * CELL_STRIDE + ti;
      qp += 1;
    }
  }

  // Explicit grid edges. `material.wireframe` would draw the triangulation
  // diagonals too, which reads as a herringbone rash rather than a data grid.
  const wire: number[] = [];
  for (let zi = 0; zi < nz; zi += 1) {
    if (zi % WIRE_EVERY_Z !== 0 && zi !== nz - 1) continue;
    for (let ti = 0; ti < nt - 1; ti += 1) {
      if ((cells[zi]?.[ti] ?? null) === null || (cells[zi]?.[ti + 1] ?? null) === null) continue;
      wire.push(at(zi, ti), at(zi, ti + 1));
    }
  }
  for (let ti = 0; ti < nt; ti += 1) {
    if (ti % WIRE_EVERY_T !== 0 && ti !== nt - 1) continue;
    for (let zi = 0; zi < nz - 1; zi += 1) {
      if ((cells[zi]?.[ti] ?? null) === null || (cells[zi + 1]?.[ti] ?? null) === null) continue;
      wire.push(at(zi, ti), at(zi + 1, ti));
    }
  }

  return {
    positions,
    normals,
    index: index.slice(0, ip),
    wireIndex: new Uint32Array(wire),
    faceToCell: faceToCell.slice(0, qp),
    filled,
  };
}

/** Value delta in world units. The y scale is affine, so one difference suffices. */
function scaleDelta(scales: SurfaceScales, dValue: number): number {
  return scales.yOf(dValue) - scales.yOf(0);
}

/** Recover the grid cell behind a raycast hit. */
export function cellFromFace(
  faceToCell: Uint32Array,
  faceIndex: number,
): { zi: number; ti: number } | null {
  const quad = faceIndex >> 1;
  if (quad < 0 || quad >= faceToCell.length) return null;
  const packed = faceToCell[quad]!;
  return { zi: Math.floor(packed / CELL_STRIDE), ti: packed % CELL_STRIDE };
}
