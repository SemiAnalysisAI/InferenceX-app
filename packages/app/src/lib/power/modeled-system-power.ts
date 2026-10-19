import type { BenchmarkRow } from '@/lib/api/api';
import { isKvOffloadEnabled } from '@/lib/benchmarks/kv-offload';
import {
  estimateChassisPower,
  estimateRackPower,
  isRackPowerHardware,
  isSystemPowerHardware,
  rackComputeTrayCount,
  SYSTEM_POWER_MODEL_REVISION,
  type SystemPowerOperatingState,
  type SystemUnitPower,
} from '@/lib/power/system-power-model';

const CHASSIS_GPU_COUNT = 8;
const TRAY_GPU_COUNT = 4;
const TRAY_GRACE_SOCKETS = 2;

export const isNvl72Hardware = (hardware: string): boolean =>
  isRackPowerHardware(hardware.toLowerCase());

export type SystemPowerUnsupportedReason =
  | 'workload'
  | 'hardware'
  | 'telemetry'
  | 'gpu-count'
  | 'topology'
  | 'role-power'
  | 'model-domain';

export type SystemPowerUnit = 'chassis' | 'nvl72-tray';

interface SupportedSystemPower {
  status: 'supported';
  hardware: string;
  modelRevision: string;
  operatingState: SystemPowerOperatingState;
  gpuCount: number;
  chassisCount: number;
  modeledGpuCount: number;
  measuredGpuWattsPerGpu: number;
  itWatts: number;
  itWattsPerGpu: number;
  facilityWatts: number;
  deploymentItWatts: number;
  deploymentFacilityWatts: number;
  pue: number;
  telemetryBasis: 'validated-v2' | 'validated-unversioned-single-node';
  topologyBasis: 'single-node' | 'worker-hosts' | 'uniform-hosts';
  chassisBasis: 'full' | 'extrapolated';
}

export type SystemPowerEstimate =
  | { status: 'unsupported'; reason: SystemPowerUnsupportedReason; modelRevision: string }
  | (SupportedSystemPower & { unit: 'chassis' })
  | (SupportedSystemPower & {
      unit: 'nvl72-tray';
      cpuBasis: 'measured' | 'modeled';
      measuredGraceSocketWatts: number | null;
    });

interface MeasuredChassis {
  measuredGpus: number;
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

function matchingWatts(a: number, b: number, gpus: number): boolean {
  return Math.abs(a - b) <= (gpus + 1) * 0.0005 + 1e-6;
}

function unavailable(reason: SystemPowerUnsupportedReason): SystemPowerEstimate {
  return { status: 'unsupported', reason, modelRevision: SYSTEM_POWER_MODEL_REVISION };
}

function descriptor(row: BenchmarkRow, key: string): string | null {
  const value: unknown = row.metrics[key];
  return typeof value === 'string' ? value : null;
}

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
  const mooncake = descriptor(row, 'kv_offload_backend')?.trim().toLowerCase() === 'mooncake';
  return { workload, scaleOut: row.disagg || systems > 1 || mooncake };
}

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

  const gpuCount = Math.round(m.avg_total_gpu_power_w / m.avg_power_w);
  if (
    !count(gpuCount) ||
    !matchingWatts(m.avg_total_gpu_power_w, m.avg_power_w * gpuCount, gpuCount)
  ) {
    return unavailable('gpu-count');
  }

  const cpuAudit = row.power_audit?.cpu;
  const graceSocketWatts = m.avg_cpu_socket_power_w;
  let measuredSockets =
    rack &&
    m.cpu_power_valid === 1 &&
    cpuAudit?.sensor_kind === 'grace_socket' &&
    count(cpuAudit.expected_sockets) &&
    cpuAudit.observed_sockets === cpuAudit.expected_sockets &&
    positive(m.avg_total_cpu_power_w) &&
    positive(graceSocketWatts) &&
    matchingWatts(
      m.avg_total_cpu_power_w,
      graceSocketWatts * cpuAudit.observed_sockets,
      cpuAudit.observed_sockets,
    );

  const chassis: MeasuredChassis[] = [];
  let topologyBasis: 'single-node' | 'worker-hosts' | 'uniform-hosts';
  if (row.disagg === false && row.is_multinode === false) {
    if (gpuCount > unitGpuCount) return unavailable('topology');
    const tp = row.decode_tp > 0 ? row.decode_tp : row.prefill_tp;
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
      modelInputWatts:
        gpuCount === unitGpuCount ? m.avg_total_gpu_power_w : m.avg_power_w * unitGpuCount,
    });
  } else if (row.disagg === false && (!Array.isArray(row.workers) || row.workers.length === 0)) {
    const hostCount = gpuCount / unitGpuCount;
    if (!count(hostCount)) return unavailable(rack ? 'gpu-count' : 'topology');
    if (hostCount < 2) return unavailable('topology');
    const tp = row.decode_tp > 0 ? row.decode_tp : row.prefill_tp;
    const pp = Math.max(m.pp ?? 1, m.decode_pp ?? 1, m.prefill_pp ?? 1);
    const pcp = Math.max(m.pcp_size ?? 1, m.decode_pcp_size ?? 1, m.prefill_pcp_size ?? 1);
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
        modelInputWatts: m.avg_total_gpu_power_w / hostCount,
      });
    }
  } else {
    if (!Array.isArray(row.workers) || row.workers.length === 0) {
      return unavailable('topology');
    }
    const hosts = new Set<string>();
    const measured: MeasuredWorker[] = [];
    for (const worker of row.workers) {
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
  measuredSockets &&= cpuAudit?.observed_sockets === chassis.length * TRAY_GRACE_SOCKETS;
  const socketInput = measuredSockets ? graceSocketWatts! : null;

  let models: (SystemUnitPower | null)[];
  let state: SystemPowerOperatingState | null;
  if (system.unit === 'nvl72-tray') {
    const traysPerRack = rackComputeTrayCount(system.hardware);
    state = operatingState(row, Math.ceil(chassis.length / traysPerRack));
    if (!state) return unavailable('workload');
    const trayInputs = chassis.reduce((sum, c) => sum + c.modelInputWatts, 0);
    const rackModel = estimateRackPower(
      system.hardware,
      trayInputs / (chassis.length * TRAY_GPU_COUNT),
      socketInput,
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
    ? {
        ...estimate,
        unit: 'nvl72-tray',
        cpuBasis: socketInput === null ? 'modeled' : 'measured',
        measuredGraceSocketWatts: socketInput,
      }
    : { ...estimate, unit: 'chassis' };
}
