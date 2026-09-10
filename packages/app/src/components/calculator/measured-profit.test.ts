import { describe, expect, it } from 'vitest';

import type { TokenRevenuePricing } from '@/components/inference/types';
import type { BenchmarkRow } from '@/lib/api';
import { estimateChassisPower } from '@/lib/system-power-model';

import { compareMeasuredProfit } from './measured-profit';
import { estimateSkuProfit, HOURS_PER_YEAR } from './profit-estimator';
import type { GPUDataPoint, InterpolatedResult } from './types';

const PRICING: TokenRevenuePricing = {
  source: 'normalized',
  inputPerMillion: 1,
  cachedInputPerMillion: 0.1,
  outputPerMillion: 1,
};
const SPECS = { powerKwPerGpu: 1.71, costPerGpuHour: 1.73 };
const ASSUMPTIONS = { utilizationPct: 60, labCutPct: 30, basis: 'gw-year' as const };

// Same eight-GPU B200 power fixture as modeled-system-power.test.ts. Throughput
// is synthetic here to isolate financial arithmetic from catalog pricing.
function benchmark(overrides: Partial<BenchmarkRow> = {}): BenchmarkRow {
  return {
    id: 441192,
    model: 'qwen3.5',
    hardware: 'b200',
    framework: 'sglang',
    precision: 'fp8',
    spec_method: 'none',
    disagg: false,
    is_multinode: false,
    prefill_tp: 8,
    prefill_ep: 1,
    prefill_dp_attention: false,
    prefill_num_workers: 0,
    decode_tp: 8,
    decode_ep: 1,
    decode_dp_attention: false,
    decode_num_workers: 0,
    num_prefill_gpu: 8,
    num_decode_gpu: 8,
    benchmark_type: 'single_turn',
    isl: 8192,
    osl: 1024,
    conc: 1,
    offload_mode: 'off',
    image: null,
    date: '2026-09-08',
    run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/34175132645/attempts/1',
    metrics: {
      power_valid: 1,
      power_metric_schema_version: 2,
      avg_power_w: 349.859,
      avg_total_gpu_power_w: 2798.868,
      pp: 1,
      pcp_size: 1,
      median_intvty: 100,
      tput_per_gpu: 1000,
    },
    ...overrides,
  };
}

function result(row = benchmark()): InterpolatedResult {
  const point: GPUDataPoint = {
    hwKey: 'b200_sglang',
    interactivity: 100,
    throughput: row.metrics.tput_per_gpu,
    outputThroughput: 1000 / 9,
    inputThroughput: 8000 / 9,
    inputTokenShare: 8 / 9,
    concurrency: row.conc,
    tp: row.decode_tp,
    precision: row.precision,
    costh: 0,
    costr: 0,
    costhi: 0,
    costri: 0,
    costhOutput: 0,
    costrOutput: 0,
    tpPerMw: 0,
    inputTpPerMw: 0,
    outputTpPerMw: 0,
    benchmarkRow: row,
  };
  return {
    hwKey: point.hwKey,
    resultKey: point.hwKey,
    precision: row.precision,
    value: point.throughput,
    outputTputValue: point.outputThroughput,
    inputTputValue: point.inputThroughput,
    inputTokenShare: point.inputTokenShare,
    cost: 0,
    costInput: 0,
    costOutput: 0,
    tpPerMw: 0,
    inputTpPerMw: 0,
    outputTpPerMw: 0,
    concurrency: row.conc,
    nearestPoints: [point],
  };
}

const compare = (point = result(), target = 100) =>
  compareMeasuredProfit(point, SPECS, PRICING, ASSUMPTIONS, target);

describe('measured-power profit comparison', () => {
  it('applies Python facility output once, reserves headroom, and scales all bundled costs by complete deployments', () => {
    const point = result();
    const comparison = compare(point);
    expect(comparison.status).toBe('supported');
    if (comparison.status !== 'supported') throw new Error(comparison.reason);
    expect(comparison.baseline).toEqual(estimateSkuProfit(point, SPECS, PRICING, ASSUMPTIONS));
    const c = comparison.capacity;
    expect(comparison.modelSourceSha256).toBe(
      '89d94969ce1acfeee67784ad269c431415995f9b18996d4b28d213d34393864a',
    );
    expect(comparison.modelAssumptions).toMatchObject({ u_cpu: 0.2, u_ram: 0.2, pue: 1.3 });
    expect(comparison.sourcePoints[0].topology).toMatchObject({ decodeTp: 8, pp: 1, pcpSize: 1 });
    // Pinned Python output: 4837.2 W chassis AC, 6288.4 W facility at PUE 1.3.
    expect(c.chassisAcWattsPerDeployment).toBe(4837.2);
    expect(c.facilityWattsPerDeployment).toBe(6288.4);
    expect(c.planningWattsPerDeployment).toBeCloseTo(6917.24, 8);
    expect(c.provisionedWattsPerDeployment).toBe(13_680);
    expect(c.provisionedDeployments).toBe(Math.floor(1e9 / 13_680));
    expect(c.modeledDeployments).toBe(Math.floor(1e9 / 6917.24));
    expect(c.modeledGpus).toBe(c.modeledDeployments * 8);
    expect(c.expectedFleetFacilityWatts).toBe(c.modeledDeployments * 6288.4);
    expect(c.expectedFleetFacilityWatts).toBeLessThan(1e9 / 1.1);
    expect((c.modeledDeployments + 1) * c.planningWattsPerDeployment).toBeGreaterThan(1e9);
    expect(comparison.measured.gpuHours).toBe(c.modeledGpus * HOURS_PER_YEAR);
    expect(comparison.measured.revenue).toBeCloseTo(3.6 * 0.6 * comparison.measured.gpuHours, 3);
    expect(comparison.measured.tco).toBe(SPECS.costPerGpuHour * comparison.measured.gpuHours);
    expect(comparison.measured.profit).toBeCloseTo(
      comparison.measured.revenue * 0.7 - comparison.measured.tco,
      3,
    );
    expect(comparison.measured.tco / comparison.provisioned.tco).toBeCloseTo(
      c.modeledGpus / c.provisionedGpus,
      12,
    );
  });

  it('keeps AgentX unavailable and exposes absent telemetry independently', () => {
    const source = benchmark({ benchmark_type: 'agentic_traces', isl: null, osl: null });
    delete source.metrics.power_valid;
    const comparison = compare(result(source));
    expect(comparison).toMatchObject({ status: 'unavailable', reason: 'workload' });
    expect(comparison.sourcePoints[0]).toMatchObject({
      id: source.id,
      benchmarkType: 'agentic_traces',
      telemetryValid: false,
      measuredGpuWattsPerGpu: null,
      measuredTotalGpuWatts: null,
    });
    expect(comparison).not.toHaveProperty('measured');
  });

  it('never borrows power from an adjacent point, but admits an exact interior knot', () => {
    const point = result();
    point.nearestPoints.push({ ...point.nearestPoints[0], interactivity: 150 });
    expect(compare(point, 125)).toMatchObject({
      status: 'unavailable',
      reason: 'interpolated-operating-point',
    });
    expect(compare(point).status).toBe('supported');
    point.clamped = true;
    expect(compare(point).status).toBe('unavailable');
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid measured watts %s',
    (watts) => {
      const source = benchmark();
      source.metrics.avg_power_w = watts;
      expect(compare(result(source))).toMatchObject({ status: 'unavailable', reason: 'telemetry' });
    },
  );

  it('does not substitute models, extrapolate partial chassis, or omit separate CPU hosts', () => {
    expect(compare(result(benchmark({ hardware: 'gb300' })))).toMatchObject({ reason: 'hardware' });
    const source = benchmark({ prefill_tp: 4, decode_tp: 4 });
    source.metrics.avg_total_gpu_power_w = source.metrics.avg_power_w * 4;
    expect(compare(result(source))).toMatchObject({ reason: 'partial-chassis' });
    expect(
      compare(
        result(
          benchmark({
            workers: [
              { role: 'frontend', worker_idx: 0, num_gpus: 0, hosts: ['router'], avg_power_w: 0 },
            ],
          }),
        ),
      ),
    ).toMatchObject({ reason: 'unmodeled-host' });
  });

  it('keeps prefill and decode chassis together and uses fleet-wide total throughput', () => {
    const source = benchmark({
      disagg: true,
      is_multinode: true,
      num_prefill_gpu: 8,
      num_decode_gpu: 8,
      workers: [
        { role: 'prefill', worker_idx: 0, num_gpus: 8, hosts: ['prefill'], avg_power_w: 300 },
        { role: 'decode', worker_idx: 0, num_gpus: 8, hosts: ['decode'], avg_power_w: 700 },
      ],
    });
    Object.assign(source.metrics, {
      avg_power_w: 500,
      avg_total_gpu_power_w: 8000,
      prefill_avg_power_w: 300,
      decode_avg_power_w: 700,
    });
    const comparison = compare(result(source));
    expect(comparison.status).toBe('supported');
    if (comparison.status !== 'supported') throw new Error(comparison.reason);
    expect(comparison.capacity.gpusPerDeployment).toBe(16);
    expect(comparison.capacity.chassisPerDeployment).toBe(2);
    expect(comparison.capacity.facilityWattsPerDeployment).toBe(
      estimateChassisPower('b200', 2400, 1.3)!.facilityWatts +
        estimateChassisPower('b200', 5600, 1.3)!.facilityWatts,
    );
    expect(comparison.capacity.modeledGpus % 16).toBe(0);
    expect(comparison.measured.revenuePerGpuHour).toBeCloseTo(3.6, 12);
  });

  it('rejects mismatched throughput identity and missing source instead of falling back', () => {
    const point = result();
    point.nearestPoints[0].throughput = 2000;
    expect(compare(point)).toMatchObject({ reason: 'throughput-topology' });
    delete point.nearestPoints[0].benchmarkRow;
    expect(compare(point)).toMatchObject({ reason: 'missing-source' });
  });

  it('does not price a missing rate or zero deployable capacity', () => {
    const point = result();
    expect(
      compareMeasuredProfit(point, { ...SPECS, costPerGpuHour: 0 }, PRICING, ASSUMPTIONS, 100),
    ).toMatchObject({ reason: 'economics' });
    expect(
      compareMeasuredProfit(point, { ...SPECS, powerKwPerGpu: 1e9 }, PRICING, ASSUMPTIONS, 100),
    ).toMatchObject({ reason: 'no-capacity' });
    expect(
      compareMeasuredProfit(
        point,
        { ...SPECS, powerKwPerGpu: Number.MIN_VALUE },
        PRICING,
        ASSUMPTIONS,
        100,
      ),
    ).toMatchObject({ reason: 'no-capacity' });
    expect(
      compareMeasuredProfit(
        point,
        { ...SPECS, costPerGpuHour: Infinity },
        PRICING,
        ASSUMPTIONS,
        100,
      ),
    ).toMatchObject({ reason: 'economics' });
  });

  it('uses explicit finite fleet GPU-hours only on the GW basis', () => {
    const specs = { ...SPECS, gpuHours: 16 * HOURS_PER_YEAR };
    expect(estimateSkuProfit(result(), specs, PRICING, ASSUMPTIONS)).toMatchObject({
      gpuHours: specs.gpuHours,
      tco: 1.73 * specs.gpuHours,
    });
    expect(
      estimateSkuProfit(result(), specs, PRICING, { ...ASSUMPTIONS, basis: 'chip-hour' }),
    ).toMatchObject({ gpuHours: 1, tco: 1.73 });
  });

  it.each([0, -1, NaN, Infinity])(
    'rejects invalid explicit GPU-hours %s without a provisioned fallback',
    (gpuHours) => {
      expect(
        estimateSkuProfit(result(), { ...SPECS, gpuHours }, PRICING, ASSUMPTIONS),
      ).toMatchObject({ reason: 'no-power' });
    },
  );
});
