/**
 * Data → world mapping for the interactivity surface, and its inverse.
 *
 * Pure and free of three.js so it can be unit-tested without a GL context, which
 * matters here: CI has no GPU, so anything that only works inside a live canvas is
 * effectively untested.
 */

/** Extents of the plot box in world units: x = time, y = value, z = interactivity. */
export const BOX = { w: 1.8, h: 1.1, d: 1.4 } as const;

export interface SurfaceScales {
  xOf: (ms: number) => number;
  yOf: (value: number) => number;
  zOf: (interactivity: number) => number;
  /** Inverses, for turning a raycast hit back into data. */
  msOf: (x: number) => number;
  valueOf: (y: number) => number;
  interactivityOf: (z: number) => number;
  /** True when the inputs were too degenerate to map (single sample, flat range). */
  degenerate: boolean;
}

/** Everything maps to the box centre when the inputs cannot define an axis. */
const collapsed = () => 0;

export interface ScaleInput {
  times: readonly number[];
  zs: readonly number[];
  yMin: number;
  yMax: number;
}

/**
 * Build the mapping.
 *
 * Two deliberate choices:
 *
 * - **z is logarithmic**, because the slices are log-spaced and the physics is
 *   multiplicative. Anything that positions itself in z — the isoline especially —
 *   must interpolate in log space too, or it lands off the plane the axis ticks
 *   claim it is on.
 * - **break-even sits at world y = 0**, by offsetting the value range by the
 *   fraction of it that is below zero. The zero plane then needs no offset and
 *   "is this fleet above water" is a sign test on a world coordinate.
 */
export function makeScales({ times, zs, yMin, yMax }: ScaleInput): SurfaceScales {
  const t0 = times[0] ?? 0;
  const t1 = times.at(-1) ?? 0;
  const z0 = zs[0] ?? 1;
  const z1 = zs.at(-1) ?? 1;
  const span = yMax - yMin;

  const degenerate = !(t1 > t0) || !(z1 > z0) || !(span > 0) || !(z0 > 0);
  if (degenerate) {
    return {
      xOf: collapsed,
      yOf: collapsed,
      zOf: collapsed,
      msOf: () => t0,
      valueOf: () => yMin,
      interactivityOf: () => z0,
      degenerate: true,
    };
  }

  const logLo = Math.log(z0);
  const logHi = Math.log(z1);
  /** Fraction of the value range below zero, so world y = 0 is break-even. */
  const zeroAt = (0 - yMin) / span;

  return {
    xOf: (ms) => ((ms - t0) / (t1 - t0) - 0.5) * BOX.w,
    yOf: (value) => ((value - yMin) / span - zeroAt) * BOX.h,
    zOf: (interactivity) => ((Math.log(interactivity) - logLo) / (logHi - logLo) - 0.5) * BOX.d,
    msOf: (x) => t0 + (x / BOX.w + 0.5) * (t1 - t0),
    valueOf: (y) => yMin + (y / BOX.h + zeroAt) * span,
    interactivityOf: (z) => Math.exp(logLo + (z / BOX.d + 0.5) * (logHi - logLo)),
    degenerate: false,
  };
}
