import type { BenchmarkRow } from '@/lib/api';
import { isKvOffloadEnabled } from '@/lib/kv-offload';
import {
  estimateChassisPower,
  estimateRackPower,
  isRackPowerHardware,
  isSystemPowerHardware,
  rackComputeTrayCount,
  SYSTEM_POWER_MODEL_REVISION,
  type SystemPowerOperatingState,
  type SystemUnitPower,
} from '@/lib/system-power-model';

/** Every supported chassis model describes one complete eight-GPU HGX/OAM system. */
const CHASSIS_GPU_COUNT = 8;
/** A GB200/GB300 NVL72 compute tray: four GPUs and two Grace sockets (the generator asserts it). */
const TRAY_GPU_COUNT = 4;
const TRAY_GRACE_SOCKETS = 2;

export const isNvl72Hardware = (hardware: string): boolean =>
  isRackPowerHardware(hardware.toLowerCase());

export type SystemPowerUnsupportedReason =
  | 'workload'
  | 'hardware'
  | 'telemetry'
  /** NVL72 only: complete, matching Grace-socket telemetry from the GPU window. */
  | 'cpu-telemetry'
  | 'gpu-count'
  | 'topology'
  | 'role-power'
  | 'model-domain';

/**
 * The modeled unit: an eight-GPU HGX/OAM chassis, or a four-GPU NVL72 compute
 * tray's equal share of a rack of identical trays.
 */
export type SystemPowerUnit = 'chassis' | 'nvl72-tray';

interface SupportedSystemPower {
  status: 'supported';
  hardware: string;
  modelRevision: string;
  operatingState: SystemPowerOperatingState;
  /** Physical GPUs covered by the validated telemetry. */
  gpuCount: number;
  /** Modeled units: chassis, or NVL72 compute trays. */
  chassisCount: number;
  /** GPUs the units were evaluated for: chassisCount × 8 (chassis) or × 4 (trays). Exceeds gpuCount when extrapolated. */
  modeledGpuCount: number;
  measuredGpuWattsPerGpu: number;
  /** Modeled IT power (system AC plus its scale-out network share) for every full unit, summed. */
  itWatts: number;
  /** itWatts ÷ modeledGpuCount. */
  itWattsPerGpu: number;
  facilityWatts: number;
  /** Share of the modeled units attributable to the measured GPUs; equals the totals for full units. */
  deploymentItWatts: number;
  deploymentFacilityWatts: number;
  pue: number;
  telemetryBasis: 'validated-v2' | 'validated-unversioned-single-node';
  /**
   * 'single-node': one host, one unit. 'worker-hosts': one unit per measured
   * worker, each chassis at its own telemetry. 'uniform-hosts': an aggregate
   * multinode deployment whose producer emitted no per-worker telemetry; every
   * unit is modeled at the deployment mean.
   */
  topologyBasis: 'single-node' | 'worker-hosts' | 'uniform-hosts';
  /**
   * 'full': every unit had all its GPUs measured. 'extrapolated': at least one
   * unit was partially allocated; its model input is the measured per-GPU power
   * for every GPU of the unit, assuming the unmeasured GPUs run the same
   * workload. This is the upstream model's full-unit input, not a proportional
   * share of a unit evaluated at partial load.
   */
  chassisBasis: 'full' | 'extrapolated';
}

export type SystemPowerEstimate =
  | { status: 'unsupported'; reason: SystemPowerUnsupportedReason; modelRevision: string }
  | (SupportedSystemPower & { unit: 'chassis' })
  | (SupportedSystemPower & {
      unit: 'nvl72-tray';
      /** Measured mean W per Grace socket, the rack model's whole-socket input. */
      measuredGraceSocketWatts: number;
    });

interface MeasuredChassis {
  /** GPUs on this chassis or tray covered by telemetry. */
  measuredGpus: number;
  /** Full-unit GPU watts handed to the source model. */
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

// The schema-v2 producer rounds each watts field to 0.001 W. This bound
// accounts for both the aggregate rounding and every multiplied mean.
function matchingWatts(a: number, b: number, gpus: number): boolean {
  return Math.abs(a - b) <= (gpus + 1) * 0.0005 + 1e-6;
}

function unavailable(reason: SystemPowerUnsupportedReason): SystemPowerEstimate {
  return { status: 'unsupported', reason, modelRevision: SYSTEM_POWER_MODEL_REVISION };
}

/** Offload descriptors are strings inside the numerically typed metrics JSONB. */
function descriptor(row: BenchmarkRow, key: string): string | null {
  const value: unknown = row.metrics[key];
  return typeof value === 'string' ? value : null;
}

/**
 * The upstream operating state of a row spanning `systems` chassis or NVL72
 * racks; null for other workloads. Trays within one rack share its NVLink
 * domain, so spanning them does not by itself need the scale-out fabric;
 * disaggregated and Mooncake rows still do.
 */
function operatingState(row: BenchmarkRow, systems: number): SystemPowerOperatingState | null {
  let workload: SystemPowerOperatingState['workload'];
  if (row.benchmark_type === 'single_turn') workload = 'fixed-seq-len';
  else if (row.benchmark_type === 'agentic_traces') {
    const offload = {
      kv_offloading: descriptor(row, 'kv_offloading'),
      offload_mode: row.offload_mode ?? descriptor(row, 'offload_mode'),
    };
    workload = isKvOffloadEnabled(offload) ? 'agentic-cpu-offloading' : 'agentic';
  } else return null;
  // A Mooncake store moves KV over the RDMA NICs even on one node.
  const mooncake = descriptor(row, 'kv_offload_backend')?.trim().toLowerCase() === 'mooncake';
  return { workload, scaleOut: row.disagg || systems > 1 || mooncake };
}

/**
 * Model the mean GPU telemetry on known eight-GPU chassis, or on NVL72 compute
 * trays with measured Grace sockets.
 * This is f(mean power), not a time-integrated wall-power measurement.
 * Do not use display counts here: legacy ingest can encode TP * EP twice.
 */
export function modelSystemPower(row: BenchmarkRow): SystemPowerEstimate {
  if (typeof row.hardware !== 'string') return unavailable('hardware');
  const hardware = row.hardware.toLowerCase();
  const system = isRackPowerHardware(hardware)
    ? ({ unit: 'nvl72-tray', hardware } as const)
    : isSystemPowerHardware(hardware)
      ? ({ unit: 'chassis', hardware } as const)
      : null;
  if (!system) return unavailable('hardware');
  const rack = system.unit === 'nvl72-tray';
  const unitGpuCount = rack ? TRAY_GPU_COUNT : CHASSIS_GPU_COUNT;
  const unitShare = (n: unknown): n is number => count(n) && n <= unitGpuCount;
  if (typeof row.disagg !== 'boolean' || typeof row.is_multinode !== 'boolean') {
    return unavailable('topology');
  }
  const m = row.metrics;
  // The original validated single-node producer already defines these two
  // watts fields identically (InferenceX bf4461db, aggregate_power.py). It
  // predates the schema version marker; retain that distinction. Unversioned
  // disaggregated/multinode telemetry is not admitted through this exception,
  // and no NVL72 row predates it.
  const unversionedSingleNode =
    !rack &&
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

  // The rack model takes the whole Grace socket. The CPU rail alone omits
  // SysIO and LPDDR5X, and a module-sensor audit does not establish which sensor
  // fed the Grace-side keys; require Grace-socket readings with complete socket
  // coverage from the same window.
  const cpuAudit = row.power_audit?.cpu;
  const graceSocketWatts = m.avg_cpu_socket_power_w;
  if (
    rack &&
    (m.cpu_power_valid !== 1 ||
      cpuAudit?.sensor_kind !== 'grace_socket' ||
      !count(cpuAudit.expected_sockets) ||
      cpuAudit.observed_sockets !== cpuAudit.expected_sockets ||
      !positive(m.avg_total_cpu_power_w) ||
      !positive(graceSocketWatts) ||
      !matchingWatts(
        m.avg_total_cpu_power_w,
        graceSocketWatts * cpuAudit.observed_sockets,
        cpuAudit.observed_sockets,
      ))
  ) {
    return unavailable('cpu-telemetry');
  }

  const chassis: MeasuredChassis[] = [];
  let topologyBasis: 'single-node' | 'worker-hosts' | 'uniform-hosts';
  if (row.disagg === false && row.is_multinode === false) {
    // One host cannot hold more than one chassis or tray.
    if (gpuCount > unitGpuCount) return unavailable('topology');
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
        gpuCount === unitGpuCount ? m.avg_total_gpu_power_w : m.avg_power_w * unitGpuCount,
    });
  } else if (row.disagg === false && (!Array.isArray(row.workers) || row.workers.length === 0)) {
    // Aggregate multinode producers emit no per-worker telemetry. Symmetric
    // TP/PP/DP shards load every host alike, so each full unit is modeled at
    // the deployment mean: chassis hardware only ships in eight-GPU hosts and
    // NVL72 in four-GPU compute trays, so the count must fill whole units on
    // several hosts. Disaggregated roles differ in load and stay on the worker path.
    const hostCount = gpuCount / unitGpuCount;
    // An uneven chassis count leaves placement unknown; an uneven tray count
    // contradicts the four-GPU tray itself.
    if (!count(hostCount)) return unavailable(rack ? 'gpu-count' : 'topology');
    if (hostCount < 2) return unavailable('topology');
    const tp = row.decode_tp > 0 ? row.decode_tp : row.prefill_tp;
    const pp = Math.max(m.pp ?? 1, m.decode_pp ?? 1, m.prefill_pp ?? 1);
    const pcp = Math.max(m.pcp_size ?? 1, m.decode_pcp_size ?? 1, m.prefill_pcp_size ?? 1);
    // Data-parallel replicas widen the deployment beyond one TP×PP×PCP group.
    const replicas = Math.max(1, row.decode_num_workers);
    if (
      !count(tp) ||
      !count(pp) ||
      !count(pcp) ||
      !count(replicas) ||
      tp * pp * pcp * replicas !== gpuCount
    ) {
      return unavailable('gpu-count');
    }
    topologyBasis = 'uniform-hosts';
    for (let host = 0; host < hostCount; host++) {
      chassis.push({
        measuredGpus: unitGpuCount,
        // Partition the producer's exact total so the chassis inputs sum back to it.
        modelInputWatts: m.avg_total_gpu_power_w / hostCount,
      });
    }
  } else {
    // A role average across several hosts is insufficient for nonlinear
    // fan/PSU evaluation. Require one chassis or tray per measured worker and
    // a distinct host for every worker.
    if (!Array.isArray(row.workers) || row.workers.length === 0) {
      return unavailable('topology');
    }
    const hosts = new Set<string>();
    const measured: MeasuredWorker[] = [];
    for (const worker of row.workers) {
      // CPU-only frontends are outside the modeled GPU-chassis boundary.
      if (worker.role === 'frontend' && worker.num_gpus === 0) continue;
      if (
        !unitShare(worker.num_gpus) ||
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
        modelInputWatts: worker.avg_power_w * unitGpuCount,
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
  // Every compute tray carries two Grace sockets; another count is not a tray topology.
  if (rack && cpuAudit?.observed_sockets !== chassis.length * TRAY_GRACE_SOCKETS) {
    return unavailable('cpu-telemetry');
  }

  let models: (SystemUnitPower | null)[];
  let state: SystemPowerOperatingState | null;
  if (system.unit === 'nvl72-tray') {
    // Trays share their rack's switch trays, power shelves and network, and the
    // upstream rack takes one W/GPU and one W/socket for all 18 trays. Fold the
    // measured trays into racks of identical trays at their mean full-tray GPU
    // input and the measured mean socket; every tray takes an equal rack share.
    const traysPerRack = rackComputeTrayCount(system.hardware);
    state = operatingState(row, Math.ceil(chassis.length / traysPerRack));
    if (!state) return unavailable('workload');
    const trayInputs = chassis.reduce((sum, c) => sum + c.modelInputWatts, 0);
    const rackModel = estimateRackPower(
      system.hardware,
      trayInputs / (chassis.length * TRAY_GPU_COUNT),
      graceSocketWatts!,
      state,
    );
    const tray = rackModel && {
      itWatts: rackModel.itWatts / traysPerRack,
      facilityWatts: rackModel.facilityWatts / traysPerRack,
      pue: rackModel.pue,
    };
    models = chassis.map(() => tray);
  } else {
    state = operatingState(row, chassis.length);
    if (!state) return unavailable('workload');
    const operating = state;
    models = chassis.map((c) =>
      estimateChassisPower(system.hardware, c.modelInputWatts, operating),
    );
  }
  if (models.some((model) => model === null)) return unavailable('model-domain');
  const results = chassis.map((c, i) => ({ ...c, model: models[i]! }));
  const modeledGpuCount = chassis.length * unitGpuCount;
  const extrapolated = chassis.some((c) => c.measuredGpus !== unitGpuCount);
  const itWatts = results.reduce((sum, r) => sum + r.model.itWatts, 0);
  const facilityWatts = results.reduce((sum, r) => sum + r.model.facilityWatts, 0);
  const share = (watts: (r: (typeof results)[number]) => number) =>
    results.reduce((sum, r) => sum + (watts(r) * r.measuredGpus) / unitGpuCount, 0);
  const estimate: SupportedSystemPower = {
    status: 'supported',
    hardware,
    modelRevision: SYSTEM_POWER_MODEL_REVISION,
    operatingState: state,
    gpuCount,
    chassisCount: chassis.length,
    modeledGpuCount,
    measuredGpuWattsPerGpu: m.avg_power_w,
    itWatts,
    itWattsPerGpu: itWatts / modeledGpuCount,
    facilityWatts,
    deploymentItWatts: extrapolated ? share((r) => r.model.itWatts) : itWatts,
    deploymentFacilityWatts: extrapolated ? share((r) => r.model.facilityWatts) : facilityWatts,
    pue: results[0].model.pue,
    telemetryBasis: unversionedSingleNode ? 'validated-unversioned-single-node' : 'validated-v2',
    topologyBasis,
    chassisBasis: extrapolated ? 'extrapolated' : 'full',
  };
  return system.unit === 'nvl72-tray'
    ? { ...estimate, unit: 'nvl72-tray', measuredGraceSocketWatts: graceSocketWatts! }
    : { ...estimate, unit: 'chassis' };
}
