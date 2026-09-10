import type { BenchmarkRow } from '@/lib/api';
import {
  estimateChassisPower,
  SUPPORTED_SYSTEM_POWER_HARDWARE,
  SYSTEM_POWER_MODEL_REVISION,
} from '@/lib/system-power-model';

// Application policy for the air-cooled chassis profiles; the pinned Python default stays 1.2.
export const AIR_COOLED_SYSTEM_PUE = 1.3;

/** Every supported chassis model describes one complete eight-GPU HGX/OAM system. */
const CHASSIS_GPU_COUNT = 8;

export type SystemPowerUnsupportedReason =
  | 'workload'
  | 'hardware'
  | 'telemetry'
  | 'gpu-count'
  | 'topology'
  | 'role-power'
  | 'model-domain';

export type SystemPowerEstimate =
  | { status: 'unsupported'; reason: SystemPowerUnsupportedReason; modelRevision: string }
  | {
      status: 'supported';
      hardware: string;
      modelRevision: string;
      modelPath: string;
      /** Physical GPUs covered by the validated telemetry. */
      gpuCount: number;
      chassisCount: number;
      /** GPUs the chassis models were evaluated for: chassisCount × 8. Exceeds gpuCount when extrapolated. */
      modeledGpuCount: number;
      measuredGpuWattsPerGpu: number;
      /** Modeled AC for every full chassis, summed. */
      chassisAcWatts: number;
      /** chassisAcWatts ÷ modeledGpuCount: the plotted metric. */
      chassisAcWattsPerGpu: number;
      facilityWatts: number;
      /** Share of the modeled chassis attributable to the measured GPUs; equals the totals for full chassis. */
      deploymentAcWatts: number;
      deploymentFacilityWatts: number;
      pue: number;
      telemetryBasis: 'validated-v2' | 'validated-unversioned-single-node';
      topologyBasis: 'single-node' | 'worker-hosts';
      /**
       * 'full': every chassis had all eight GPUs measured. 'extrapolated': at least
       * one chassis was partially allocated; its model input is the measured per-GPU
       * power × 8, assuming the unmeasured GPUs run the same workload. This is the
       * source README sweep's own n_gpu × W/GPU input, not a proportional share of a
       * chassis evaluated at partial load.
       */
      chassisBasis: 'full' | 'extrapolated';
    };

interface MeasuredChassis {
  /** GPUs on this chassis covered by telemetry (1–8). */
  measuredGpus: number;
  /** Full-chassis GPU watts handed to the source model. */
  modelInputWatts: number;
}

interface MeasuredWorker {
  role: string;
  gpus: number;
  watts: number;
}

const sumGpus = (items: MeasuredWorker[]) => items.reduce((sum, c) => sum + c.gpus, 0);
const sumWatts = (items: MeasuredWorker[]) => items.reduce((sum, c) => sum + c.watts, 0);

const positive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;
const count = (n: unknown): n is number => positive(n) && Number.isSafeInteger(n);
const chassisShare = (n: unknown): n is number => count(n) && n <= CHASSIS_GPU_COUNT;

// The schema-v2 producer rounds each watts field to 0.001 W. This bound
// accounts for both the aggregate rounding and every multiplied mean.
function matchingWatts(a: number, b: number, gpus: number): boolean {
  return Math.abs(a - b) <= (gpus + 1) * 0.0005 + 1e-6;
}

function unavailable(reason: SystemPowerUnsupportedReason): SystemPowerEstimate {
  return { status: 'unsupported', reason, modelRevision: SYSTEM_POWER_MODEL_REVISION };
}

/**
 * Model the mean GPU telemetry on known eight-GPU chassis.
 * This is f(mean GPU power), not a time-integrated wall-power measurement.
 * Do not use display counts here: legacy ingest can encode TP * EP twice.
 */
export function modelSystemPower(
  row: BenchmarkRow,
  pue: number = AIR_COOLED_SYSTEM_PUE,
): SystemPowerEstimate {
  if (row.benchmark_type !== 'single_turn' || row.isl !== 8192 || row.osl !== 1024) {
    return unavailable('workload');
  }
  if (typeof row.hardware !== 'string') return unavailable('hardware');
  const hardware = row.hardware.toLowerCase();
  if (!(SUPPORTED_SYSTEM_POWER_HARDWARE as readonly string[]).includes(hardware)) {
    return unavailable('hardware');
  }
  if (typeof row.disagg !== 'boolean' || typeof row.is_multinode !== 'boolean') {
    return unavailable('topology');
  }
  const m = row.metrics;
  // The original validated single-node producer already defines these two
  // watts fields identically (InferenceX bf4461db, aggregate_power.py). It
  // predates the schema version marker; retain that distinction. Unversioned
  // disaggregated/multinode telemetry is not admitted through this exception.
  const unversionedSingleNode =
    row.disagg === false &&
    row.is_multinode === false &&
    m?.power_metric_schema_version === undefined;
  if (
    m?.power_valid !== 1 ||
    (m.power_metric_schema_version !== 2 && !unversionedSingleNode) ||
    !positive(m.avg_power_w) ||
    !positive(m.avg_total_gpu_power_w)
  ) {
    return unavailable('telemetry');
  }

  // Both means have the identical validated window: total / per-GPU recovers
  // the observed physical GPU count, independent of TP/EP naming conventions.
  const gpuCount = Math.round(m.avg_total_gpu_power_w / m.avg_power_w);
  if (
    !count(gpuCount) ||
    !matchingWatts(m.avg_total_gpu_power_w, m.avg_power_w * gpuCount, gpuCount)
  ) {
    return unavailable('gpu-count');
  }

  const chassis: MeasuredChassis[] = [];
  let topologyBasis: 'single-node' | 'worker-hosts';
  if (row.disagg === false && row.is_multinode === false) {
    // One host cannot hold more than one chassis.
    if (gpuCount > CHASSIS_GPU_COUNT) return unavailable('topology');
    // The producer's physical width is TP * PP * PCP; EP partitions that
    // width. Check the populated aggregate side, not summed role aliases.
    const tp = row.decode_tp > 0 ? row.decode_tp : row.prefill_tp;
    // Historical aggregate rows sometimes mirrored TP but populated PP on
    // only one transport role. Preserve the meaningful width on either side,
    // matching rowToAggDataEntry's aggregate normalization.
    const widths = [
      m.pp,
      m.decode_pp,
      m.prefill_pp,
      m.pcp_size,
      m.decode_pcp_size,
      m.prefill_pcp_size,
    ];
    if (widths.some((width) => width !== undefined && !count(width)))
      return unavailable('gpu-count');
    const pp = Math.max(m.pp ?? 1, m.decode_pp ?? 1, m.prefill_pp ?? 1);
    const pcp = Math.max(m.pcp_size ?? 1, m.decode_pcp_size ?? 1, m.prefill_pcp_size ?? 1);
    if (!count(tp) || !count(pp) || !count(pcp) || tp * pp * pcp !== gpuCount) {
      return unavailable('gpu-count');
    }
    topologyBasis = 'single-node';
    chassis.push({
      measuredGpus: gpuCount,
      // The producer's exact total avoids re-rounding a full chassis through
      // the per-GPU mean.
      modelInputWatts:
        gpuCount === CHASSIS_GPU_COUNT
          ? m.avg_total_gpu_power_w
          : m.avg_power_w * CHASSIS_GPU_COUNT,
    });
  } else {
    // A role average across several hosts is insufficient for nonlinear
    // fan/PSU evaluation. Require one chassis per measured worker and a
    // distinct host for every worker.
    if (!Array.isArray(row.workers) || row.workers.length === 0) {
      return unavailable('topology');
    }
    const hosts = new Set<string>();
    const measured: MeasuredWorker[] = [];
    for (const worker of row.workers) {
      // CPU-only frontends are outside the modeled GPU-chassis boundary.
      if (worker.role === 'frontend' && worker.num_gpus === 0) continue;
      if (
        !chassisShare(worker.num_gpus) ||
        !Array.isArray(worker.hosts) ||
        worker.hosts.length !== 1 ||
        typeof worker.hosts[0] !== 'string' ||
        worker.hosts[0].trim() === '' ||
        hosts.has(worker.hosts[0])
      ) {
        return unavailable('topology');
      }
      if (
        !positive(worker.avg_power_w) ||
        (row.disagg
          ? !['prefill', 'decode'].includes(worker.role)
          : !['agg', 'aggregate'].includes(worker.role))
      ) {
        return unavailable('role-power');
      }
      hosts.add(worker.hosts[0]);
      const role = row.disagg ? worker.role : 'aggregate';
      measured.push({ role, gpus: worker.num_gpus, watts: worker.avg_power_w * worker.num_gpus });
      chassis.push({
        measuredGpus: worker.num_gpus,
        modelInputWatts: worker.avg_power_w * CHASSIS_GPU_COUNT,
      });
    }
    if (sumGpus(measured) !== gpuCount) return unavailable('gpu-count');
    if (!matchingWatts(sumWatts(measured), m.avg_total_gpu_power_w, gpuCount)) {
      return unavailable('role-power');
    }
    if (row.disagg) {
      for (const role of ['prefill', 'decode'] as const) {
        const roleWorkers = measured.filter((c) => c.role === role);
        const roleCount = sumGpus(roleWorkers);
        const roleAverage = m[`${role}_avg_power_w`];
        if (
          roleCount === 0 ||
          row[`num_${role}_gpu`] !== roleCount ||
          !positive(roleAverage) ||
          !matchingWatts(sumWatts(roleWorkers), roleAverage * roleCount, roleCount * 2)
        ) {
          return unavailable('role-power');
        }
      }
    }
    topologyBasis = 'worker-hosts';
  }

  const results = chassis.map((c) => ({
    ...c,
    model: estimateChassisPower(hardware, c.modelInputWatts, pue),
  }));
  if (results.some((r) => r.model === null)) return unavailable('model-domain');
  const first = results[0].model!;
  const modeledGpuCount = chassis.length * CHASSIS_GPU_COUNT;
  const extrapolated = chassis.some((c) => c.measuredGpus !== CHASSIS_GPU_COUNT);
  const chassisAcWatts = results.reduce((sum, r) => sum + r.model!.chassisAcWatts, 0);
  const facilityWatts = results.reduce((sum, r) => sum + r.model!.facilityWatts, 0);
  const share = (watts: (r: (typeof results)[number]) => number) =>
    results.reduce((sum, r) => sum + (watts(r) * r.measuredGpus) / CHASSIS_GPU_COUNT, 0);
  const deploymentAcWatts = extrapolated ? share((r) => r.model!.chassisAcWatts) : chassisAcWatts;
  const deploymentFacilityWatts = extrapolated
    ? share((r) => r.model!.facilityWatts)
    : facilityWatts;
  if (!positive(chassisAcWatts) || !positive(facilityWatts)) return unavailable('model-domain');
  return {
    status: 'supported',
    hardware,
    modelRevision: first.modelRevision,
    modelPath: first.modelPath,
    gpuCount,
    chassisCount: chassis.length,
    modeledGpuCount,
    measuredGpuWattsPerGpu: m.avg_power_w,
    chassisAcWatts,
    chassisAcWattsPerGpu: chassisAcWatts / modeledGpuCount,
    facilityWatts,
    deploymentAcWatts,
    deploymentFacilityWatts,
    pue,
    telemetryBasis: unversionedSingleNode ? 'validated-unversioned-single-node' : 'validated-v2',
    topologyBasis,
    chassisBasis: extrapolated ? 'extrapolated' : 'full',
  };
}
