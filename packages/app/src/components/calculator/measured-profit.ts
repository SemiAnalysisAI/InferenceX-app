import type { TokenRevenuePricing } from '@/components/inference/types';
import {
  AIR_COOLED_SYSTEM_PUE,
  modelSystemPower,
  type SystemPowerEstimate,
  type SystemPowerUnsupportedReason,
} from '@/lib/modeled-system-power';
import { SYSTEM_POWER_MODEL_REVISION } from '@/lib/system-power-model';
import profileData from '@/lib/system-power-model.profiles.json';

import {
  estimateSkuProfit,
  HOURS_PER_YEAR,
  isProfitEstimatorRow,
  type ProfitEstimatorAssumptions,
  type ProfitEstimatorRow,
  type ProfitEstimatorSkipped,
  type ProfitEstimatorSpecs,
} from './profit-estimator';
import type { GPUDataPoint, InterpolatedResult } from './types';

export const POWER_HEADROOM_PCT = 10;
const UTILITY_BUDGET_WATTS = 1_000_000_000;
const positive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

function sourcePoint(point: GPUDataPoint) {
  const row = point.benchmarkRow;
  if (!row) return null;
  const m = row.metrics;
  const telemetryValid =
    m.power_valid === 1 &&
    (m.power_metric_schema_version === 2 ||
      (m.power_metric_schema_version === undefined && !row.disagg && !row.is_multinode)) &&
    positive(m.avg_power_w) &&
    positive(m.avg_total_gpu_power_w);
  return {
    id: row.id,
    model: row.model,
    hardware: row.hardware,
    framework: row.framework,
    precision: row.precision,
    benchmarkType: row.benchmark_type,
    isl: row.isl,
    osl: row.osl,
    concurrency: row.conc,
    interactivity: point.interactivity,
    throughputPerGpu: point.throughput,
    runUrl: row.run_url,
    date: row.date,
    topology: {
      disagg: row.disagg,
      isMultinode: row.is_multinode,
      prefillTp: row.prefill_tp,
      decodeTp: row.decode_tp,
      prefillEp: row.prefill_ep,
      decodeEp: row.decode_ep,
      numPrefillGpu: row.num_prefill_gpu,
      numDecodeGpu: row.num_decode_gpu,
      pp: m.pp ?? null,
      prefillPp: m.prefill_pp ?? null,
      decodePp: m.decode_pp ?? null,
      pcpSize: m.pcp_size ?? null,
      prefillPcpSize: m.prefill_pcp_size ?? null,
      decodePcpSize: m.decode_pcp_size ?? null,
      workers:
        row.workers?.map((worker) => ({
          role: worker.role,
          gpuCount: worker.num_gpus,
          hostCount: worker.hosts?.length ?? null,
          measuredGpuWattsPerGpu:
            telemetryValid && positive(worker.avg_power_w) ? worker.avg_power_w : null,
        })) ?? null,
    },
    powerValid: m.power_valid ?? null,
    powerSchemaVersion: m.power_metric_schema_version ?? null,
    telemetryValid,
    measuredGpuWattsPerGpu: telemetryValid ? m.avg_power_w : null,
    measuredTotalGpuWatts: telemetryValid ? m.avg_total_gpu_power_w : null,
  };
}

export type MeasuredProfitUnavailableReason =
  | SystemPowerUnsupportedReason
  | 'interpolated-operating-point'
  | 'missing-source'
  | 'throughput-topology'
  | 'partial-chassis'
  | 'unmodeled-host'
  | 'no-capacity'
  | 'economics';

interface ComparisonBase {
  provisionedKwPerGpu: number | null;
  baseline: ProfitEstimatorRow | ProfitEstimatorSkipped;
  sourcePoints: NonNullable<ReturnType<typeof sourcePoint>>[];
  modelRevision: string;
  modelPath: string | null;
  modelSourceSha256: string | null;
  modelAssumptions: Record<string, number | null> | null;
  pue: number;
  headroomPct: number;
  systemPower: SystemPowerEstimate | null;
}

export type MeasuredProfitComparison = ComparisonBase &
  (
    | { status: 'unavailable'; reason: MeasuredProfitUnavailableReason }
    | {
        status: 'supported';
        capacity: {
          gpusPerDeployment: number;
          chassisPerDeployment: number;
          provisionedWattsPerDeployment: number;
          chassisAcWattsPerDeployment: number;
          facilityWattsPerDeployment: number;
          planningWattsPerDeployment: number;
          provisionedDeployments: number;
          modeledDeployments: number;
          provisionedGpus: number;
          modeledGpus: number;
          expectedFleetFacilityWatts: number;
        };
        provisioned: ProfitEstimatorRow;
        measured: ProfitEstimatorRow;
      }
  );

/** Compare complete deployments at a measured operating point; never splice watts into a spline. */
export function compareMeasuredProfit(
  result: InterpolatedResult,
  specs: ProfitEstimatorSpecs,
  pricing: TokenRevenuePricing,
  assumptions: ProfitEstimatorAssumptions,
  targetInteractivity: number,
): MeasuredProfitComparison {
  const point = result.nearestPoints.find((p) => p.interactivity === targetInteractivity);
  const profile = Object.entries(profileData.profiles).find(
    ([hardware]) => hardware === result.hwKey.split(/[-_]/u)[0],
  )?.[1];
  const base: ComparisonBase = {
    provisionedKwPerGpu: positive(specs.powerKwPerGpu) ? specs.powerKwPerGpu : null,
    baseline: estimateSkuProfit(result, specs, pricing, assumptions),
    sourcePoints: (point ? [point] : result.nearestPoints)
      .map(sourcePoint)
      .filter((source) => source !== null),
    modelRevision: SYSTEM_POWER_MODEL_REVISION,
    modelPath: profile?.modelPath ?? null,
    modelSourceSha256: profile
      ? (Object.entries(profileData.sourceSha256).find(
          ([path]) => path === profile.modelPath,
        )?.[1] ?? null)
      : null,
    modelAssumptions: profile ? { ...profile.assumptions, pue: AIR_COOLED_SYSTEM_PUE } : null,
    pue: AIR_COOLED_SYSTEM_PUE,
    headroomPct: POWER_HEADROOM_PCT,
    systemPower: null,
  };
  const unavailable = (reason: MeasuredProfitUnavailableReason): MeasuredProfitComparison => ({
    ...base,
    status: 'unavailable',
    reason,
  });
  if (!point || result.clamped) return unavailable('interpolated-operating-point');
  const row = point.benchmarkRow;
  if (!row) return unavailable('missing-source');
  const model = modelSystemPower(row);
  base.systemPower = model;
  if (model.status === 'unsupported') return unavailable(model.reason);
  if (model.chassisBasis !== 'full') return unavailable('partial-chassis');
  if (row.workers?.some((worker) => worker.role === 'frontend' && worker.num_gpus === 0)) {
    return unavailable('unmodeled-host');
  }
  // The producer divides total throughput by TP×PP×PCP on one host, and by
  // prefill+decode GPUs across hosts. The model validates the former itself.
  if (
    !positive(row.metrics.tput_per_gpu) ||
    point.throughput !== row.metrics.tput_per_gpu ||
    !positive(result.value) ||
    Math.abs(result.value / point.throughput - 1) > 1e-9 ||
    result.hwKey.split(/[-_]/u)[0] !== row.hardware.toLowerCase() ||
    (row.is_multinode && row.num_prefill_gpu + row.num_decode_gpu !== model.gpuCount)
  ) {
    return unavailable('throughput-topology');
  }
  if (
    assumptions.basis !== 'gw-year' ||
    !positive(specs.powerKwPerGpu) ||
    !positive(specs.costPerGpuHour)
  ) {
    return unavailable('economics');
  }

  const provisionedWatts = specs.powerKwPerGpu * 1_000 * model.gpuCount;
  const facilityWatts = model.facilityWatts;
  const planningWatts = facilityWatts * (1 + POWER_HEADROOM_PCT / 100);
  const provisionedDeployments = Math.floor(UTILITY_BUDGET_WATTS / provisionedWatts);
  const modeledDeployments = Math.floor(UTILITY_BUDGET_WATTS / planningWatts);
  const provisionedGpus = provisionedDeployments * model.gpuCount;
  const modeledGpus = modeledDeployments * model.gpuCount;
  if (
    ![provisionedDeployments, modeledDeployments, provisionedGpus, modeledGpus].every(
      (count) => Number.isSafeInteger(count) && count > 0,
    )
  )
    return unavailable('no-capacity');
  const measuredPoint = {
    ...result,
    value: point.throughput,
    inputTokenShare: point.inputTokenShare,
    cacheHitRate: point.cacheHitRate,
  };
  const economics = (gpuCount: number) =>
    estimateSkuProfit(
      measuredPoint,
      { ...specs, gpuHours: gpuCount * HOURS_PER_YEAR },
      pricing,
      assumptions,
    );
  const provisioned = economics(provisionedGpus);
  const measured = economics(modeledGpus);
  if (!isProfitEstimatorRow(provisioned) || !isProfitEstimatorRow(measured)) {
    return unavailable('economics');
  }
  return {
    ...base,
    status: 'supported',
    capacity: {
      gpusPerDeployment: model.gpuCount,
      chassisPerDeployment: model.chassisCount,
      provisionedWattsPerDeployment: provisionedWatts,
      chassisAcWattsPerDeployment: model.chassisAcWatts,
      facilityWattsPerDeployment: facilityWatts,
      planningWattsPerDeployment: planningWatts,
      provisionedDeployments,
      modeledDeployments,
      provisionedGpus,
      modeledGpus,
      // Headroom reserves capacity; it is not consumed electricity. Bundled
      // $/GPU/hr stays unchanged because there is no separate electricity rate.
      expectedFleetFacilityWatts: facilityWatts * modeledDeployments,
    },
    provisioned,
    measured,
  };
}
