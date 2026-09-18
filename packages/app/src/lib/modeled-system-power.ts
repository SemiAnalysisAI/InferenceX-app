import type { BenchmarkRow } from '@/lib/api';
import {
  estimateChassisPower,
  estimateRackPower,
  type RackMeasuredBasis,
  type RackMeasuredInput,
  SUPPORTED_SYSTEM_POWER_HARDWARE,
  SYSTEM_POWER_MODEL_REVISION,
  SYSTEM_POWER_RACK_PROFILES,
  type SystemPowerRackHardware,
} from '@/lib/system-power-model';

// Application policy for the air-cooled chassis profiles; the pinned Python default stays 1.2.
export const AIR_COOLED_SYSTEM_PUE = 1.3;
// Application policy for the direct-liquid-cooled NVL72 rack profiles (docs/powerx-system-power.md).
export const DLC_SYSTEM_PUE = 1.1;

/**
 * Facility PUE applied when a caller passes none: the DLC factor for NVL72 rack
 * profiles, the air-cooled factor for every chassis profile. The dashboard and
 * the offline exporter share this selection so article figures match chart hovers.
 */
export function defaultSystemPue(hardware: string): number {
  return Object.hasOwn(SYSTEM_POWER_RACK_PROFILES, hardware.toLowerCase())
    ? DLC_SYSTEM_PUE
    : AIR_COOLED_SYSTEM_PUE;
}

/** Every supported chassis model describes one complete eight-GPU HGX/OAM system. */
const CHASSIS_GPU_COUNT = 8;

export type SystemPowerUnsupportedReason =
  | 'workload'
  | 'hardware'
  | 'telemetry'
  /** NVL72 only: the Grace side is measured or the row stays unavailable. */
  | 'cpu-telemetry'
  | 'gpu-count'
  | 'topology'
  | 'role-power'
  | 'model-domain';

/** Producer sensor behind the CPU-side keys; the module sensor whenever its keys are present. */
export type SystemPowerSensorKind = 'module' | 'grace-socket';

interface SupportedSystemPowerEstimate {
  status: 'supported';
  hardware: string;
  modelRevision: string;
  modelPath: string;
  /** Physical GPUs covered by the validated telemetry. */
  gpuCount: number;
  /** Modeled units: eight-GPU chassis, or NVL72 compute trays. */
  chassisCount: number;
  /**
   * GPUs the units were evaluated for: chassisCount × 8 for chassis, × 4 for trays.
   * Exceeds gpuCount when extrapolated.
   */
  modeledGpuCount: number;
  measuredGpuWattsPerGpu: number;
  /**
   * Modeled AC for every full unit, summed. Each chassis is evaluated at its own
   * load because it owns its fans and PSUs. Trays share the rack's power shelves,
   * so the measured trays are folded into one rack of 18 trays matching their mean
   * compute-module input, the shelf efficiency curve is evaluated once at that
   * rack's DC load (as the source `gb200_nvl72_rack_power` does), and every tray
   * takes the same 1/18 share; the switch trays, shelves, and management switches
   * are thereby amortised over all 72 GPUs.
   */
  chassisAcWatts: number;
  /** chassisAcWatts ÷ modeledGpuCount: the plotted metric. */
  chassisAcWattsPerGpu: number;
  facilityWatts: number;
  /** Share of the modeled units attributable to the measured GPUs; equals the totals for full units. */
  deploymentAcWatts: number;
  deploymentFacilityWatts: number;
  pue: number;
  telemetryBasis: 'validated-v2' | 'validated-unversioned-single-node';
  /**
   * 'full': every unit had all of its GPUs measured. 'extrapolated': at least one
   * unit was partially allocated. For chassis and for the tray GPU-board share, the
   * model input is the measured per-GPU power × the unit's GPU count, assuming the
   * unmeasured GPUs run the same workload (the source README sweep's own n_gpu × W/GPU
   * input, not a proportional share of a unit evaluated at partial load). A module
   * sensor already covers the whole tray, idle GPUs included, so that reading is
   * never scaled; the label then records the modeled-versus-measured GPU count.
   */
  chassisBasis: 'full' | 'extrapolated';
}

export type SystemPowerEstimate =
  | { status: 'unsupported'; reason: SystemPowerUnsupportedReason; modelRevision: string }
  | (SupportedSystemPowerEstimate & { topologyBasis: 'single-node' | 'worker-hosts' })
  | (SupportedSystemPowerEstimate & {
      topologyBasis: 'nvl72-trays';
      /** Which measured reading fed every tray: the module sensor, or GPU board + Grace socket. */
      measuredBasis: RackMeasuredBasis;
      sensorKind: SystemPowerSensorKind;
    });

interface MeasuredUnit {
  /** GPUs on this chassis or tray covered by telemetry. */
  measuredGpus: number;
  /** Full-unit GPU-board watts handed to the source model. */
  gpuBoardWatts: number;
}

interface MeasuredWorker {
  role: string;
  gpus: number;
  watts: number;
}

interface CpuSideTelemetry {
  basis: RackMeasuredBasis;
  socketCount: number;
  /** Deployment totals over every Grace socket; each tray receives the mean. */
  graceTotalWatts: number;
  moduleTotalWatts: number | undefined;
}

interface UnitPower {
  acWatts: number;
  facilityWatts: number;
  modelPath: string;
  modelRevision: string;
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

function modelChassis(hardware: string, unit: MeasuredUnit, pue: number): UnitPower | null {
  const chassis = estimateChassisPower(hardware, unit.gpuBoardWatts, pue);
  return (
    chassis && {
      acWatts: chassis.chassisAcWatts,
      facilityWatts: chassis.facilityWatts,
      modelPath: chassis.modelPath,
      modelRevision: chassis.modelRevision,
    }
  );
}

/**
 * One tray's 1/18 share of a rack whose 18 trays all match the measured trays' mean.
 * The source model takes one compute-module figure per tray and evaluates the
 * power-shelf efficiency curve once at the resulting rack DC load, so heterogeneous
 * measured trays (prefill beside decode) are averaged before the call rather than
 * each evaluated as its own hypothetical rack. The producer publishes the Grace-side
 * and module readings as deployment totals, so their per-tray mean is `total / trays`.
 * The Grace CPU and LPDDR5X are never modelled: they are inside the measured reading.
 */
function modelTray(
  hardware: string,
  profile: (typeof SYSTEM_POWER_RACK_PROFILES)[SystemPowerRackHardware],
  meanGpuBoardWattsPerTray: number,
  cpu: CpuSideTelemetry,
  trayCount: number,
  pue: number,
): UnitPower | null {
  const input: RackMeasuredInput =
    cpu.moduleTotalWatts === undefined
      ? {
          basis: 'gpu-plus-grace',
          gpuBoardWattsPerTray: meanGpuBoardWattsPerTray,
          graceSocketWattsPerTray: cpu.graceTotalWatts / trayCount,
        }
      : { basis: 'module', moduleWattsPerTray: cpu.moduleTotalWatts / trayCount };
  const rack = estimateRackPower(hardware, input, pue);
  return (
    rack && {
      acWatts: rack.rackAcWatts / profile.computeTrayCount,
      facilityWatts: rack.facilityWatts / profile.computeTrayCount,
      modelPath: rack.modelPath,
      modelRevision: rack.modelRevision,
    }
  );
}

/**
 * Model the mean GPU telemetry on known eight-GPU chassis, or on NVL72 compute trays
 * whose Grace side is measured. This is f(mean power), not a time-integrated wall-power
 * measurement. Do not use display counts here: legacy ingest can encode TP * EP twice.
 */
export function modelSystemPower(
  row: BenchmarkRow,
  /** Facility PUE; defaults to 1.3 for air-cooled chassis and 1.1 for DLC NVL72 racks. */
  pue?: number,
  /** Opt in so AgentX estimates do not widen the ordinary 8K/1K chart policy. */
  allowAgenticPreview = false,
): SystemPowerEstimate {
  if (
    !(allowAgenticPreview && row.benchmark_type === 'agentic_traces') &&
    (row.benchmark_type !== 'single_turn' || row.isl !== 8192 || row.osl !== 1024)
  ) {
    return unavailable('workload');
  }
  if (typeof row.hardware !== 'string') return unavailable('hardware');
  const hardware = row.hardware.toLowerCase();
  const rack = Object.hasOwn(SYSTEM_POWER_RACK_PROFILES, hardware)
    ? SYSTEM_POWER_RACK_PROFILES[hardware as SystemPowerRackHardware]
    : null;
  if (!rack && !(SUPPORTED_SYSTEM_POWER_HARDWARE as readonly string[]).includes(hardware)) {
    return unavailable('hardware');
  }
  const facilityPue = pue ?? defaultSystemPue(hardware);
  const unitGpuCount = rack ? rack.gpusPerComputeTray : CHASSIS_GPU_COUNT;
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

  // NVL72: the CPU-side keys are sums over every Grace socket in the deployment,
  // integrated over the GPU window. The socket mean recovers the socket count the
  // same way the GPU mean recovers the GPU count. A module key that is present but
  // invalid never falls back to the Grace socket silently.
  let cpu: CpuSideTelemetry | null = null;
  if (rack) {
    const moduleTotal = m.avg_total_module_power_w;
    if (
      m.cpu_power_valid !== 1 ||
      !positive(m.avg_total_cpu_power_w) ||
      !positive(m.avg_cpu_socket_power_w) ||
      (moduleTotal !== undefined && !positive(moduleTotal))
    ) {
      return unavailable('cpu-telemetry');
    }
    const socketCount = Math.round(m.avg_total_cpu_power_w / m.avg_cpu_socket_power_w);
    if (
      !count(socketCount) ||
      !matchingWatts(m.avg_total_cpu_power_w, m.avg_cpu_socket_power_w * socketCount, socketCount)
    ) {
      return unavailable('cpu-telemetry');
    }
    cpu = {
      basis: moduleTotal === undefined ? 'gpu-plus-grace' : 'module',
      socketCount,
      graceTotalWatts: m.avg_total_cpu_power_w,
      moduleTotalWatts: moduleTotal,
    };
  }

  const units: MeasuredUnit[] = [];
  let topologyBasis: 'single-node' | 'worker-hosts';
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
    units.push({
      measuredGpus: gpuCount,
      // The producer's exact total avoids re-rounding a full unit through
      // the per-GPU mean.
      gpuBoardWatts:
        gpuCount === unitGpuCount ? m.avg_total_gpu_power_w : m.avg_power_w * unitGpuCount,
    });
  } else {
    // A role average across several hosts is insufficient for nonlinear
    // fan/PSU or shelf evaluation. Require one chassis or tray per measured
    // worker and a distinct host for every worker.
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
      units.push({
        measuredGpus: worker.num_gpus,
        gpuBoardWatts: worker.avg_power_w * unitGpuCount,
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
  // Every compute tray carries two Grace sockets; a different count is not a tray topology.
  if (rack && cpu && cpu.socketCount !== units.length * rack.graceSocketsPerComputeTray) {
    return unavailable('cpu-telemetry');
  }

  // Chassis own their fans and PSUs, so each is evaluated at its own load. Trays
  // share the rack's shelves, so one rack is evaluated at the mean tray and every
  // tray receives the same share (see modelTray).
  const trayModel =
    rack && cpu
      ? modelTray(
          hardware,
          rack,
          units.reduce((sum, unit) => sum + unit.gpuBoardWatts, 0) / units.length,
          cpu,
          units.length,
          facilityPue,
        )
      : null;
  const results = units.map((unit) => ({
    ...unit,
    model: rack && cpu ? trayModel : modelChassis(hardware, unit, facilityPue),
  }));
  if (results.some((r) => r.model === null)) return unavailable('model-domain');
  const first = results[0].model!;
  const modeledGpuCount = units.length * unitGpuCount;
  const extrapolated = units.some((c) => c.measuredGpus !== unitGpuCount);
  const chassisAcWatts = results.reduce((sum, r) => sum + r.model!.acWatts, 0);
  const facilityWatts = results.reduce((sum, r) => sum + r.model!.facilityWatts, 0);
  const share = (watts: (r: (typeof results)[number]) => number) =>
    results.reduce((sum, r) => sum + (watts(r) * r.measuredGpus) / unitGpuCount, 0);
  const deploymentAcWatts = extrapolated ? share((r) => r.model!.acWatts) : chassisAcWatts;
  const deploymentFacilityWatts = extrapolated
    ? share((r) => r.model!.facilityWatts)
    : facilityWatts;
  if (!positive(chassisAcWatts) || !positive(facilityWatts)) return unavailable('model-domain');
  const supported: SupportedSystemPowerEstimate = {
    status: 'supported',
    hardware,
    modelRevision: first.modelRevision,
    modelPath: first.modelPath,
    gpuCount,
    chassisCount: units.length,
    modeledGpuCount,
    measuredGpuWattsPerGpu: m.avg_power_w,
    chassisAcWatts,
    chassisAcWattsPerGpu: chassisAcWatts / modeledGpuCount,
    facilityWatts,
    deploymentAcWatts,
    deploymentFacilityWatts,
    pue: facilityPue,
    telemetryBasis: unversionedSingleNode ? 'validated-unversioned-single-node' : 'validated-v2',
    chassisBasis: extrapolated ? 'extrapolated' : 'full',
  };
  if (rack && cpu) {
    return {
      ...supported,
      topologyBasis: 'nvl72-trays',
      measuredBasis: cpu.basis,
      sensorKind: cpu.basis === 'module' ? 'module' : 'grace-socket',
    };
  }
  return { ...supported, topologyBasis };
}
