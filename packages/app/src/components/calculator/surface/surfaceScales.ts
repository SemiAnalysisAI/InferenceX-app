/**
 * Data → world mapping for the interactivity surface, and its inverse.
 *
 * Pure and free of three.js so it can be unit-tested without a GL context, which
 * matters here: CI has no GPU, so anything that only works inside a live canvas is
 * effectively untested.
 */

/** Extents of the plot box in world units: x = time, y = value, z = interactivity. */
export const BOX = { w: 1.8, h: 1.1, d: 1.4 } as const;

/**
 * How far the camera must sit from the box's centre for the whole box to fit.
 *
 * A fixed camera position cannot frame the box well, because the container's aspect
 * ratio is not fixed: a perspective camera's `fov` is its *vertical* angle, so making
 * the canvas taller widens nothing and simply pads the render with empty space, while
 * a narrow phone viewport crops the box's corners off the sides.
 *
 * Fits the box's bounding **sphere** rather than its projected outline. The view
 * rotates, so a fit that depended on the bearing would breathe in and out as the
 * reader dragged; the sphere is bearing-independent, at the cost of a little margin
 * at the angles where the box is thinnest. Whichever of the two field angles is
 * tighter is the one that binds.
 */
export function fitCameraDistance(aspect: number, fovDegrees: number, margin = 1.06): number {
  const radius = Math.hypot(BOX.w, BOX.h, BOX.d) / 2;
  const halfVertical = (fovDegrees * Math.PI) / 360;
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const halfHorizontal = Math.atan(Math.tan(halfVertical) * safeAspect);
  const binding = Math.min(halfVertical, halfHorizontal);
  return (radius / Math.sin(binding)) * margin;
}

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
 * - **the value range fills the box**, exactly like the other two axes. It is
 *   tempting to instead offset the range so that value 0 lands on world y 0 — then
 *   the break-even plane needs no offset at all and "above water" is a sign test on
 *   a world coordinate. That is wrong: it only fits when zero sits at the middle of
 *   the range. A fleet whose margin runs -$250k…+$50k, or a revenue grid whose floor
 *   *is* zero, gets mapped outside ±h/2 and the surface escapes the frame it is
 *   drawn inside. Break-even is wherever `yOf(0)` puts it, and the plane is
 *   positioned there.
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

  return {
    xOf: (ms) => ((ms - t0) / (t1 - t0) - 0.5) * BOX.w,
    yOf: (value) => ((value - yMin) / span - 0.5) * BOX.h,
    zOf: (interactivity) => ((Math.log(interactivity) - logLo) / (logHi - logLo) - 0.5) * BOX.d,
    msOf: (x) => t0 + (x / BOX.w + 0.5) * (t1 - t0),
    valueOf: (y) => yMin + (y / BOX.h + 0.5) * span,
    interactivityOf: (z) => Math.exp(logLo + (z / BOX.d + 0.5) * (logHi - logLo)),
    degenerate: false,
  };
}
