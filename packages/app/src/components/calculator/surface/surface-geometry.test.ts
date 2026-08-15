import { describe, expect, it } from 'vitest';

import { buildIsolineArrays } from './buildIsoline';
import { buildSurfaceArrays, cellFromFace } from './buildSurfaceGeometry';
import { pickAxisEdges } from './pickAxisEdges';
import { darken, lighten } from './surfaceColors';
import { BOX, fitCameraDistance, makeScales } from './surfaceScales';

/**
 * Everything under test here is deliberately free of three.js, because the test
 * runners have no GPU: if the geometry and label placement were only exercised
 * inside a live canvas they would be untested in CI entirely.
 */

const times = [0, 1000, 2000, 3000];
const zs = [10, 20, 40, 80];
const scales = makeScales({ times, zs, yMin: -100, yMax: 300 });

/** Full grid, no holes. Typed to allow nulls so the hole cases can punch them in. */
const full: (number | null)[][] = zs.map((_, zi) => times.map((_t, ti) => zi * 10 + ti));

describe('makeScales', () => {
  it('makes every axis span exactly the box it is drawn inside', () => {
    expect(scales.xOf(times[0]!)).toBeCloseTo(-BOX.w / 2, 9);
    expect(scales.xOf(times.at(-1)!)).toBeCloseTo(BOX.w / 2, 9);
    expect(scales.zOf(zs[0]!)).toBeCloseTo(-BOX.d / 2, 9);
    expect(scales.zOf(zs.at(-1)!)).toBeCloseTo(BOX.d / 2, 9);
    expect(scales.yOf(-100)).toBeCloseTo(-BOX.h / 2, 9);
    expect(scales.yOf(300)).toBeCloseTo(BOX.h / 2, 9);
    // Break-even is a quarter of the way up this range, not the middle: the value
    // axis fills the frame like the other two, and the plane is positioned at
    // `yOf(0)` rather than assumed to be at the origin.
    expect(scales.yOf(0)).toBeCloseTo(-BOX.h * 0.25, 9);
  });

  it('keeps an asymmetric range inside the frame — including a zero floor', () => {
    // The bug this pins: offsetting the range to put value 0 at world 0 maps a
    // range that does not straddle zero symmetrically outside ±h/2, and the surface
    // then draws outside the box frame. Revenue always has a zero floor, so this
    // was reachable from the UI by switching the y-axis selector.
    for (const [yMin, yMax] of [
      [0, 250],
      [-250, 50],
      [-5, 500],
    ]) {
      const s = makeScales({ times, zs, yMin: yMin!, yMax: yMax! });
      expect(s.yOf(yMin!)).toBeCloseTo(-BOX.h / 2, 9);
      expect(s.yOf(yMax!)).toBeCloseTo(BOX.h / 2, 9);
      // Break-even stays inside the box whenever zero is inside the range.
      expect(Math.abs(s.yOf(0))).toBeLessThanOrEqual(BOX.h / 2 + 1e-9);
    }
  });

  it('fits the camera to the aspect ratio, both ways', () => {
    const radius = Math.hypot(BOX.w, BOX.h, BOX.d) / 2;
    // Whatever the shape of the container, the box's bounding sphere must subtend no
    // more than the field of view — otherwise a corner clips at some bearing.
    for (const aspect of [0.5, 0.9, 1, 1.875, 3]) {
      const distance = fitCameraDistance(aspect, 45);
      const halfVertical = (45 * Math.PI) / 360;
      const halfHorizontal = Math.atan(Math.tan(halfVertical) * aspect);
      expect(Math.asin(radius / distance)).toBeLessThanOrEqual(
        Math.min(halfVertical, halfHorizontal) + 1e-9,
      );
    }
    // A narrower container needs more distance: horizontal field is what binds there.
    expect(fitCameraDistance(0.6, 45)).toBeGreaterThan(fitCameraDistance(1.9, 45));
    // Past square the vertical field binds, so widening further changes nothing.
    expect(fitCameraDistance(3, 45)).toBeCloseTo(fitCameraDistance(9, 45), 9);
    // A zero or NaN aspect (a container measured before layout) must not divide away.
    expect(Number.isFinite(fitCameraDistance(0, 45))).toBe(true);
    expect(Number.isFinite(fitCameraDistance(Number.NaN, 45))).toBe(true);
  });

  it('spaces the interactivity axis logarithmically', () => {
    // 20 and 40 are one octave apart either side of the midpoint, so they sit
    // symmetrically — a linear axis would bunch them at the bottom.
    const mid = (scales.zOf(20) + scales.zOf(40)) / 2;
    expect(mid).toBeCloseTo(0, 9);
  });

  it('round-trips through its inverses', () => {
    expect(scales.msOf(scales.xOf(1500))).toBeCloseTo(1500, 6);
    expect(scales.valueOf(scales.yOf(42))).toBeCloseTo(42, 6);
    expect(scales.interactivityOf(scales.zOf(33))).toBeCloseTo(33, 6);
  });

  it('reports degenerate inputs rather than dividing by zero', () => {
    expect(makeScales({ times: [5], zs, yMin: 0, yMax: 1 }).degenerate).toBe(true);
    expect(makeScales({ times, zs: [10], yMin: 0, yMax: 1 }).degenerate).toBe(true);
    expect(makeScales({ times, zs, yMin: 7, yMax: 7 }).degenerate).toBe(true);
    // A zero or negative interactivity has no logarithm.
    expect(makeScales({ times, zs: [0, 10], yMin: 0, yMax: 1 }).degenerate).toBe(true);
    expect(Number.isFinite(makeScales({ times: [5], zs, yMin: 0, yMax: 1 }).xOf(5))).toBe(true);
  });
});

describe('buildSurfaceArrays', () => {
  it('indexes every quad of a complete grid', () => {
    const arrays = buildSurfaceArrays(full, scales, times, zs);
    expect(arrays.filled).toBe(16);
    // 3 × 3 quads, two triangles each.
    expect(arrays.faceToCell).toHaveLength(9);
    expect(arrays.index).toHaveLength(9 * 6);
    expect(arrays.positions).toHaveLength(16 * 3);
  });

  it('skips any quad touching a hole instead of bridging it', () => {
    const holed: (number | null)[][] = full.map((row) => [...row]);
    holed[1]![1] = null;
    const arrays = buildSurfaceArrays(holed, scales, times, zs);
    // One missing cell kills the four quads that had it as a corner.
    expect(arrays.faceToCell).toHaveLength(5);
    expect(arrays.filled).toBe(15);
    for (const quad of arrays.faceToCell) {
      const zi = Math.floor(quad / 65_536);
      const ti = quad % 65_536;
      const corners = [
        holed[zi]![ti],
        holed[zi]![ti + 1],
        holed[zi + 1]![ti],
        holed[zi + 1]![ti + 1],
      ];
      expect(corners.every((c) => c !== null)).toBe(true);
    }
  });

  it('emits nothing for an entirely empty slice set', () => {
    const empty = zs.map(() => times.map(() => null));
    const arrays = buildSurfaceArrays(empty, scales, times, zs);
    expect(arrays.index).toHaveLength(0);
    expect(arrays.faceToCell).toHaveLength(0);
    expect(arrays.wireIndex).toHaveLength(0);
    expect(arrays.filled).toBe(0);
  });

  it('keeps normals unit-length and pointing up', () => {
    const arrays = buildSurfaceArrays(full, scales, times, zs);
    for (let i = 0; i < arrays.positions.length; i += 3) {
      const [nx, ny, nz] = [arrays.normals[i]!, arrays.normals[i + 1]!, arrays.normals[i + 2]!];
      expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 6);
      // A height field's normal always has an upward component; a negative one
      // would light the surface from underneath.
      expect(ny).toBeGreaterThan(0);
    }
  });

  it('winds every triangle to face the same way its normals do', () => {
    // The test above checks the *shading* normals; this one checks the index
    // buffer, which is a separate decision and was for a while the opposite one.
    // It matters because the material is DoubleSide: three.js takes facing from
    // the projected winding and negates the shading normal on back faces, so a
    // surface wound the wrong way lights as if from below over whichever part
    // faces away — a boundary that sweeps as the camera orbits and reads as a
    // step in the data. Recomputed from `positions` so it pins the emitted
    // geometry rather than the arithmetic that produced it.
    const arrays = buildSurfaceArrays(full, scales, times, zs);
    expect(arrays.index.length).toBeGreaterThan(0);
    const at = (i: number): [number, number, number] => [
      arrays.positions[i * 3]!,
      arrays.positions[i * 3 + 1]!,
      arrays.positions[i * 3 + 2]!,
    ];
    for (let i = 0; i < arrays.index.length; i += 3) {
      const [ax, , az] = at(arrays.index[i]!);
      const [bx, , bz] = at(arrays.index[i + 1]!);
      const [cx, , cz] = at(arrays.index[i + 2]!);
      // y of the cross product of (b-a) and (c-a) — the only component whose
      // sign decides which side of a height field the triangle presents.
      const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
      expect(ny).toBeGreaterThan(0);
    }
  });

  it('tilts the normal in the direction the surface climbs', () => {
    // Rising along time only: the normal must lean backwards along x and stay
    // square in z.
    const ramp = zs.map(() => times.map((_t, ti) => ti * 100));
    const arrays = buildSurfaceArrays(ramp, scales, times, zs);
    expect(arrays.normals[0]!).toBeLessThan(0);
    expect(Math.abs(arrays.normals[2]!)).toBeCloseTo(0, 9);
  });

  it('draws grid lines without triangulation diagonals', () => {
    const arrays = buildSurfaceArrays(full, scales, times, zs);
    expect(arrays.wireIndex.length % 2).toBe(0);
    for (let i = 0; i < arrays.wireIndex.length; i += 2) {
      const a = arrays.wireIndex[i]!;
      const b = arrays.wireIndex[i + 1]!;
      const [az, at] = [Math.floor(a / times.length), a % times.length];
      const [bz, bt] = [Math.floor(b / times.length), b % times.length];
      // A diagonal would move in both axes at once.
      expect(az === bz || at === bt).toBe(true);
    }
  });

  it('maps a face back to the cell it came from', () => {
    const arrays = buildSurfaceArrays(full, scales, times, zs);
    // Both triangles of quad 0 resolve to the same cell.
    expect(cellFromFace(arrays.faceToCell, 0)).toEqual({ zi: 0, ti: 0 });
    expect(cellFromFace(arrays.faceToCell, 1)).toEqual({ zi: 0, ti: 0 });
    expect(cellFromFace(arrays.faceToCell, 2)).toEqual({ zi: 0, ti: 1 });
    expect(cellFromFace(arrays.faceToCell, 9999)).toBeNull();
  });
});

describe('buildIsolineArrays', () => {
  it('places the cord on the log-interpolated slice', () => {
    // Halfway between 20 and 40 in log space is 28.28…, and the cord must sit on
    // that plane rather than the linear midpoint of 30.
    const positions = buildIsolineArrays({
      cells: full,
      times,
      zs,
      currentZ: Math.sqrt(20 * 40),
      scales,
    });
    expect(positions.length).toBeGreaterThan(0);
    const zWorld = scales.zOf(Math.sqrt(20 * 40));
    for (let i = 2; i < positions.length; i += 3) {
      // Every vertex is within the cord's half-thickness of the slice plane.
      expect(Math.abs(positions[i]! - zWorld)).toBeLessThan(0.01);
    }
  });

  it('breaks the cord rather than spanning a hole', () => {
    const holed: (number | null)[][] = full.map((row) => [...row]);
    // Knock a hole in one bracketing slice: half a bracket is not a measurement.
    holed[1]![2] = null;
    const solid = buildIsolineArrays({ cells: full, times, zs, currentZ: 25, scales });
    const broken = buildIsolineArrays({ cells: holed, times, zs, currentZ: 25, scales });
    expect(broken.length).toBeLessThan(solid.length);
  });

  it('returns nothing when the slider sits on an unmeasured chip', () => {
    const empty = zs.map(() => times.map(() => null));
    expect(buildIsolineArrays({ cells: empty, times, zs, currentZ: 25, scales })).toHaveLength(0);
  });
});

describe('pickAxisEdges', () => {
  it('keeps tick edges on the side the camera is on', () => {
    // Looking down +z: the x ticks belong on the +z floor edge, nearest the viewer.
    expect(pickAxisEdges(0).xEdgeZ).toBe(1);
    // Swung round behind the box, they move to the far side.
    expect(pickAxisEdges(Math.PI).xEdgeZ).toBe(-1);
    // Looking down +x: the z ticks come to the +x edge.
    expect(pickAxisEdges(Math.PI / 2).zEdgeX).toBe(1);
    expect(pickAxisEdges(-Math.PI / 2).zEdgeX).toBe(-1);
  });

  it('keeps the value axis off the corner where the other two converge', () => {
    // Three tick families meeting at one corner is unreadable, so the value axis
    // takes the far end of the time edge instead — still facing the camera.
    for (const azimuth of [0, Math.PI / 3, Math.PI, -Math.PI / 4, 2.5, -3]) {
      const edges = pickAxisEdges(azimuth);
      expect(edges.yEdge.x).toBe(-edges.zEdgeX);
      expect(edges.yEdge.z).toBe(edges.xEdgeZ);
    }
  });

  it('offsets labels outward, away from the data', () => {
    const edges = pickAxisEdges(0.7);
    expect(edges.xOutward.z).toBe(edges.xEdgeZ);
    expect(edges.zOutward.x).toBe(edges.zEdgeX);
  });
});

describe('surfaceColors', () => {
  it('shifts a colour toward black and white', () => {
    expect(darken('#808080', 0.5)).toBe('#404040');
    expect(lighten('#808080', 0.5)).toBe('#c0c0c0');
    expect(darken('#000000', 0.5)).toBe('#000000');
    expect(lighten('#ffffff', 0.5)).toBe('#ffffff');
  });
});
