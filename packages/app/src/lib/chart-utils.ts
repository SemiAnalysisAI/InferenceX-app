/**
 * Runtime-compatible chart utility functions.
 * These functions can be used in API routes and client-side code.
 * They do NOT import Node.js-specific modules (fs, path) or build-time dependencies.
 *
 * This module is now a thin barrel. The implementation lives in focused
 * sibling modules; everything chart-utils.ts historically exported is
 * re-exported here so existing imports (`@/lib/chart-utils`) keep working
 * unchanged:
 *
 *   - chart-colors.ts   → generateHighContrastColors (iwanthue high-contrast)
 *   - hardware-keys.ts  → getHardwareKey / normalizeEvalHardwareKey / buildAvailabilityHwKey
 *   - chart-point.ts    → createChartDataPoint, getNestedYValue, Y_AXIS_METRICS, YAxisMetric
 *   - roofline.ts       → paretoFront* / calculateRoofline / computeAllRooflines / markRooflinePoints
 */

export { generateHighContrastColors } from '@/lib/chart-colors';
export {
  buildAvailabilityHwKey,
  getHardwareKey,
  normalizeEvalHardwareKey,
} from '@/lib/hardware-keys';
export {
  createChartDataPoint,
  getNestedYValue,
  Y_AXIS_METRICS,
  type YAxisMetric,
} from '@/lib/chart-point';
export {
  calculateRoofline,
  computeAllRooflines,
  markRooflinePoints,
  paretoFrontLowerLeft,
  paretoFrontLowerRight,
  paretoFrontUpperLeft,
  paretoFrontUpperRight,
} from '@/lib/roofline';
