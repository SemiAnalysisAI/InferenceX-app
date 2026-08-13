/**
 * The curve at the calculator's current interactivity, as a solid ribbon.
 *
 * This is what ties the 3D view back to the 2D chart above: the same line, in the
 * same place, on the slice the slider is set to.
 *
 * It is built as geometry rather than a line because `LineBasicMaterial.linewidth`
 * is ignored in WebGL — every line is one pixel, whatever you ask for, and a
 * one-pixel curve inside a shaded box is invisible. So each segment becomes a pair
 * of crossed ribbons (one extruded in y, one in z), giving a plus-shaped section
 * that reads as a solid cord from every camera angle the elevation clamp allows.
 */

import type { SurfaceScales } from './surfaceScales';

/** Half-thickness of the cord, world units. */
const HALF = 0.006;

export interface IsolineInput {
  cells: readonly (number | null)[][];
  times: readonly number[];
  zs: readonly number[];
  currentZ: number;
  scales: SurfaceScales;
}

/**
 * Triangle positions for the isoline, or an empty array when the slider's
 * interactivity has no measured line on this chip.
 *
 * Interpolates between the two bracketing slices **in log space**, matching the z
 * axis — a linear blend would place the cord off the plane the ticks claim it is
 * on. A hole in either bracketing slice breaks the ribbon rather than falling back
 * to the slice that does have data: half a bracket is not a measurement.
 */
export function buildIsolineArrays(input: IsolineInput): Float32Array {
  const { cells, times, zs, currentZ, scales } = input;
  if (zs.length === 0 || times.length < 2) return new Float32Array(0);

  // Bracketing slices, clamped to the axis: at or past an end, follow that slice.
  let lower = 0;
  for (let i = 0; i < zs.length - 1; i += 1) {
    if (zs[i]! <= currentZ) lower = i;
  }
  const upper = Math.min(lower + 1, zs.length - 1);
  const zLo = zs[lower]!;
  const zHi = zs[upper]!;
  const logSpan = Math.log(zHi) - Math.log(zLo);
  const weight =
    logSpan > 0 ? Math.max(0, Math.min(1, (Math.log(currentZ) - Math.log(zLo)) / logSpan)) : 0;

  const zWorld = scales.zOf(Math.max(zs[0]!, Math.min(zs.at(-1)!, currentZ)));
  const points: { x: number; y: number }[] = [];
  const runs: { x: number; y: number }[][] = [];
  const flush = () => {
    if (points.length > 1) runs.push([...points]);
    points.length = 0;
  };

  for (let ti = 0; ti < times.length; ti += 1) {
    const low = cells[lower]?.[ti] ?? null;
    const high = cells[upper]?.[ti] ?? null;
    if (low === null || high === null) {
      flush();
      continue;
    }
    points.push({
      x: scales.xOf(times[ti]!),
      y: scales.yOf(low + (high - low) * weight),
    });
  }
  flush();

  const out: number[] = [];
  const quad = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    d: [number, number, number],
  ) => out.push(...a, ...b, ...c, ...a, ...c, ...d);

  for (const run of runs) {
    for (let i = 0; i < run.length - 1; i += 1) {
      const p = run[i]!;
      const q = run[i + 1]!;
      // Vertical ribbon: visible from a low camera.
      quad(
        [p.x, p.y - HALF, zWorld],
        [q.x, q.y - HALF, zWorld],
        [q.x, q.y + HALF, zWorld],
        [p.x, p.y + HALF, zWorld],
      );
      // Horizontal ribbon: visible from a high camera.
      quad(
        [p.x, p.y, zWorld - HALF],
        [q.x, q.y, zWorld - HALF],
        [q.x, q.y, zWorld + HALF],
        [p.x, p.y, zWorld + HALF],
      );
    }
  }

  return new Float32Array(out);
}
