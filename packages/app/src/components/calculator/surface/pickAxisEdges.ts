/**
 * Which edges of the plot box carry the axis labels, given where the camera is.
 *
 * Labels on a rotating 3D box are only legible if they follow the camera: pinned
 * to fixed edges they end up behind the surfaces half the time. So each frame
 * picks the box edges nearest the viewer and offsets the labels outward, away from
 * the data.
 *
 * Pure, and a function of one angle — which makes it the one part of the label
 * machinery that can be tested without a GL context. It is also where the bugs
 * live: an off-by-one quadrant makes every tick jump 90° at one bearing.
 */

import { BOX } from './surfaceScales';

export interface AxisEdges {
  /** Sign of z the x-axis ticks sit on (the near floor edge running along x). */
  xEdgeZ: 1 | -1;
  /** Sign of x the z-axis ticks sit on (the near floor edge running along z). */
  zEdgeX: 1 | -1;
  /** Corner the vertical value axis is drawn on. */
  yEdge: { x: 1 | -1; z: 1 | -1 };
  /** Outward directions to offset each axis' labels along. */
  xOutward: { x: 0; z: 1 | -1 };
  zOutward: { x: 1 | -1; z: 0 };
}

/**
 * @param azimuth `atan2(camera.x, camera.z)` — 0 looking down +z, growing
 *   counter-clockwise seen from above.
 */
export function pickAxisEdges(azimuth: number): AxisEdges {
  // Camera direction in the floor plane. Ticks go on the edges facing the camera,
  // so a label is never occluded by the surface it belongs to.
  const towardCameraX = Math.sin(azimuth);
  const towardCameraZ = Math.cos(azimuth);

  // The x ticks live on whichever z edge is nearer the camera, and vice versa.
  const xEdgeZ: 1 | -1 = towardCameraZ >= 0 ? 1 : -1;
  const zEdgeX: 1 | -1 = towardCameraX >= 0 ? 1 : -1;

  return {
    xEdgeZ,
    zEdgeX,
    // The value axis goes on the far end of the time edge — visible, but *not* the
    // corner where the two floor edges converge. That corner is where the time and
    // interactivity ticks already meet, and stacking a third family there makes all
    // three unreadable at once. Here it competes only with the outermost time tick.
    yEdge: { x: -zEdgeX as 1 | -1, z: xEdgeZ },
    xOutward: { x: 0, z: xEdgeZ },
    zOutward: { x: zEdgeX, z: 0 },
  };
}

/** World position of a tick on the time axis, pushed clear of the box. */
export function xTickPosition(worldX: number, edges: AxisEdges, offset = 0.09) {
  return {
    x: worldX,
    y: -BOX.h / 2,
    z: (BOX.d / 2 + offset) * edges.xEdgeZ,
  };
}

/** World position of a tick on the interactivity axis. */
export function zTickPosition(worldZ: number, edges: AxisEdges, offset = 0.09) {
  return {
    x: (BOX.w / 2 + offset) * edges.zEdgeX,
    y: -BOX.h / 2,
    z: worldZ,
  };
}

/** World position of a tick on the value axis, on the near vertical corner. */
export function yTickPosition(worldY: number, edges: AxisEdges, offset = 0.07) {
  return {
    x: (BOX.w / 2 + offset) * edges.yEdge.x,
    y: worldY,
    z: (BOX.d / 2 + offset) * edges.yEdge.z,
  };
}
