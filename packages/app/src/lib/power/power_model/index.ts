// SPDX-License-Identifier: GPL-3.0-only
/**
 * Shared public API. Advanced equipment is available under models/advanced.
 *
 * A file-for-file TypeScript port of the InferenceX power model (Python
 * power_model/src/power_model) at the revision in manifest.ts; parity.test.ts
 * checks it against that revision's own output.
 */

export {
  OperatingState,
  PowerEstimate,
  PowerModel,
  Provenance,
  ValidationError,
  ValueError,
  WorkloadState,
} from './base';
export { CoolingProfile } from './cooling';
export { create_power_model } from './models/catalog';
export { ExamplePowerModel } from './models/example';
