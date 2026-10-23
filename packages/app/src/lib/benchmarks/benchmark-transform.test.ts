import { MEASURED_POWER_METRIC_KEYS } from '@semianalysisai/inferencex-constants';
import { describe, it, expect, vi } from 'vitest';

import { getPointLabel } from '@/components/inference/utils/tooltipUtils';
import type { BenchmarkRow } from '@/lib/api/api';
import { dedupeAgenticHistoryRuns } from '@/lib/benchmarks/benchmark-run-selection';

import {
  applyUncachedTokenBasis,
  mergeRunScopedRows,
  rowToAggDataEntry,
  transformBenchmarkRows,
} from './benchmark-transform';

function makeRow(overrides: Partial<BenchmarkRow> = {}): BenchmarkRow {
  return {
    id: 1,
    hardware: 'h200',
    framework: 'trt',
    model: 'dsr1',
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
    offload_mode: 'off',
    isl: 1024,
    osl: 1024,
    conc: 64,
    image: 'nvcr.io/nvidia/tritonserver:25.01',
    metrics: {
      tput_per_gpu: 450.5,
      output_tput_per_gpu: 400.2,
      input_tput_per_gpu: 50.3,
      median_ttft: 0.15,
      p99_ttft: 0.35,
      mean_ttft: 0.16,
      std_ttft: 0.02,
      median_tpot: 0.012,
      p99_tpot: 0.018,
      mean_tpot: 0.013,
      std_tpot: 0.002,
      median_intvty: 12.5,
      p99_intvty: 18.2,
      mean_intvty: 13,
      std_intvty: 2.1,
      median_itl: 0.011,
      p99_itl: 0.016,
      mean_itl: 0.012,
      std_itl: 0.001,
      median_e2el: 2.3,
      p99_e2el: 3.1,
      mean_e2el: 2.4,
      std_e2el: 0.3,
    },
    date: '2026-03-01',
    run_url: null,
    ...overrides,
  };
}

describe('rowToAggDataEntry', () => {
  it('carries the curve snapshot identity of append-only rows and leaves legacy rows without one', () => {
    const stitched = rowToAggDataEntry(
      makeRow({ curve_date: '2026-09-20', curve_workflow_run_id: 35843506474 }),
    );
    expect([stitched.curve_date, stitched.curve_workflow_run_id]).toEqual([
      '2026-09-20',
      35843506474,
    ]);
    const legacy = rowToAggDataEntry(makeRow());
    expect([legacy.curve_date, legacy.curve_workflow_run_id]).toEqual([undefined, undefined]);
  });

  it.each([1, undefined])(
    'labels run 37181045340 in the official/overlay legend without changing data (DB id %s)',
    (id) => {
      const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-09T23:59:59-04:00'));
      try {
        const run_url =
          'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/37181045340/attempts/1';
        const row = makeRow({ id, hardware: 'mi355x', framework: 'mori-sglang', run_url });
        const active = transformBenchmarkRows([row]);
        expect(Object.keys(active.hardwareConfig)).toEqual(['mi355x_mori-sglang']);
        expect(active.hardwareConfig['mi355x_mori-sglang'].suffix).toBe('(UMBP MoRI SGLang)');
        for (const points of active.chartData) {
          expect(points[0]).toMatchObject({
            hwKey: 'mi355x_mori-sglang',
            framework: 'mori-sglang',
            run_url,
          });
        }
        clock.mockReturnValue(Date.parse('2026-10-10T00:00:00-04:00'));
        const expired = transformBenchmarkRows([row]);
        expect(expired.hardwareConfig['mi355x_mori-sglang'].suffix).toBe('(MoRI SGLang)');
        expect(expired.chartData).toEqual(active.chartData);
      } finally {
        clock.mockRestore();
      }
    },
  );

  it.each([1, undefined])(
    'keeps canonical identity but labels UMBP for official/overlay rows (DB id %s)',
    (id) => {
      const run_url =
        'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/34926284365/attempts/1';
      const row = makeRow({ id, hardware: 'mi355x', framework: 'mori-sglang', run_url });
      const { chartData, hardwareConfig } = transformBenchmarkRows([row]);
      expect(Object.keys(hardwareConfig)).toEqual(['mi355x_mori-sglang']);
      expect(hardwareConfig['mi355x_mori-sglang'].suffix).toBe('(MoRI UMBP SGLang)');
      for (const points of chartData) {
        expect(points).toHaveLength(1);
        expect(points[0]).toMatchObject({
          hwKey: 'mi355x_mori-sglang',
          framework: 'mori-sglang',
          run_url,
        });
      }
      const historical = transformBenchmarkRows([
        { ...row, run_url: run_url.replace('34926284365', '34926284364') },
      ]);
      expect(historical.hardwareConfig['mi355x_mori-sglang'].suffix).toBe('(MoRI SGLang)');
    },
  );

  it.each(['p75_power_w', 'p90_power_w'] as const)(
    'only exposes %s from validated schema-2 rows, including overlays without DB IDs',
    (metric) => {
      for (const id of [1, undefined]) {
        const row = makeRow({
          id,
          metrics: { power_valid: 1, power_metric_schema_version: 2, [metric]: 620 },
        });
        expect(rowToAggDataEntry(row)[metric]).toBe(620);
        const unavailableMetrics: Record<string, number>[] = [
          { power_valid: 0, power_metric_schema_version: 2, [metric]: 620 },
          { power_valid: 1, [metric]: 620 },
          { power_valid: 1, power_metric_schema_version: 3, [metric]: 620 },
          { avg_power_w: 500 },
        ];
        for (const metrics of unavailableMetrics) {
          expect(rowToAggDataEntry(makeRow({ id, metrics }))[metric]).toBeUndefined();
        }
      }
    },
  );
  it('preserves DCP and PCP metrics for point tooltips', () => {
    const entry = rowToAggDataEntry(
      makeRow({
        metrics: {
          prefill_dcp_size: 2,
          decode_dcp_size: 8,
          prefill_pcp_size: 4,
          decode_pcp_size: 1,
        },
      }),
    );

    expect(entry.prefill_dcp_size).toBe(2);
    expect(entry.decode_dcp_size).toBe(8);
    expect(entry.prefill_pcp_size).toBe(4);
    expect(entry.decode_pcp_size).toBe(1);
  });

  it('preserves DWDP width without rewriting tensor parallelism', () => {
    const entry = rowToAggDataEntry(
      makeRow({
        disagg: true,
        prefill_tp: 1,
        prefill_num_workers: 2,
        metrics: { prefill_dwdp_size: 8 },
      }),
    );
    expect(entry.prefill_dwdp_size).toBe(8);
    expect(entry.prefill_tp).toBe(1);
    expect(rowToAggDataEntry(makeRow()).prefill_dwdp_size).toBeUndefined();
  });

  it('mirrors aggregate artifact DCP and PCP widths into both topology roles', () => {
    const entry = rowToAggDataEntry(
      makeRow({
        metrics: {
          dcp_size: 8,
          pcp_size: 1,
        },
      }),
    );

    expect(entry.prefill_dcp_size).toBe(8);
    expect(entry.decode_dcp_size).toBe(8);
    expect(entry.prefill_pcp_size).toBe(1);
    expect(entry.decode_pcp_size).toBe(1);
  });

  it('maps hardware and framework fields', () => {
    const entry = rowToAggDataEntry(makeRow());
    expect(entry.hw).toBe('h200');
    expect(entry.framework).toBe('trt');
  });

  it('maps DB model key to display name', () => {
    const entry = rowToAggDataEntry(makeRow({ model: 'dsr1' }));
    expect(entry.model).toBe('DeepSeek-R1-0528');
  });

  it('passes through unknown model keys as-is', () => {
    const entry = rowToAggDataEntry(makeRow({ model: 'unknown_model' }));
    expect(entry.model).toBe('unknown_model');
  });

  it('maps metrics to AggDataEntry fields', () => {
    const entry = rowToAggDataEntry(makeRow());
    expect(entry.tput_per_gpu).toBe(450.5);
    expect(entry.median_ttft).toBe(0.15);
    expect(entry.p99_e2el).toBe(3.1);
    expect(entry.median_intvty).toBe(12.5);
    expect(entry.rawMetricKeys).toContain('median_ttft');
  });

  it('prefers full-response AgentX ITL and interactivity for artifact overlays', () => {
    const entry = rowToAggDataEntry(
      makeRow({
        benchmark_type: 'agentic_traces',
        metrics: {
          median_itl: 0.000003,
          median_intvty: 333_333,
          median_full_response_itl: 0.005,
          median_full_response_intvty: 200,
          std_full_response_itl: 0.001,
          std_full_response_intvty: 20,
        },
      }),
    );

    expect(entry.median_itl).toBe(0.005);
    expect(entry.median_tpot).toBe(0.005);
    expect(entry.median_intvty).toBe(200);
    expect(entry.std_itl).toBe(0.001);
    expect(entry.std_intvty).toBe(20);
  });

  it('defaults missing metrics to 0', () => {
    const entry = rowToAggDataEntry(makeRow({ metrics: {} }));
    expect(entry.tput_per_gpu).toBe(0);
    expect(entry.median_ttft).toBe(0);
    expect(entry.rawMetricKeys).toEqual([]);
  });

  it('maps disagg and GPU count fields', () => {
    const entry = rowToAggDataEntry(
      makeRow({ disagg: true, num_prefill_gpu: 4, num_decode_gpu: 12 }),
    );
    expect(entry.disagg).toBe(true);
    expect(entry.num_prefill_gpu).toBe(4);
    expect(entry.num_decode_gpu).toBe(12);
  });

  it('maps spec_method to spec_decoding', () => {
    const entry = rowToAggDataEntry(makeRow({ spec_method: 'mtp' }));
    expect(entry.spec_decoding).toBe('mtp');
  });

  it('maps aggregate decode_tp to tp when the decode-shaped side is populated', () => {
    const entry = rowToAggDataEntry(makeRow({ decode_tp: 4 }));
    expect(entry.tp).toBe(4);
  });

  it('uses one populated prefill-shaped topology for non-disaggregated multinode serving', () => {
    const base = makeRow();
    const entry = rowToAggDataEntry(
      makeRow({
        framework: 'dynamo-vllm',
        disagg: false,
        is_multinode: true,
        prefill_tp: 8,
        prefill_ep: 1,
        prefill_dp_attention: false,
        prefill_num_workers: 1,
        decode_tp: 0,
        decode_ep: 0,
        decode_dp_attention: false,
        decode_num_workers: 0,
        num_prefill_gpu: 16,
        num_decode_gpu: 0,
        metrics: { ...base.metrics, prefill_pp: 2, decode_pp: 1 },
      }),
    );

    expect(entry.disagg).toBe(false);
    expect(entry.is_multinode).toBe(true);
    expect(entry.tp).toBe(8);
    expect(entry.ep).toBe(1);
    expect(entry.pp).toBe(2);
    expect(entry.decode_tp).toBe(8);
    expect(entry.decode_ep).toBe(1);
    expect(entry.decode_pp).toBe(2);
  });

  it('surfaces pipeline parallelism from the metrics JSONB', () => {
    const base = makeRow();
    const entry = rowToAggDataEntry(
      makeRow({ metrics: { ...base.metrics, prefill_pp: 2, decode_pp: 2 } }),
    );
    expect(entry.pp).toBe(2);
    expect(entry.prefill_pp).toBe(2);
    expect(entry.decode_pp).toBe(2);
  });

  it('leaves pp undefined for rows predating the field', () => {
    const entry = rowToAggDataEntry(makeRow());
    expect(entry.pp).toBeUndefined();
    expect(entry.prefill_pp).toBeUndefined();
    expect(entry.decode_pp).toBeUndefined();
  });

  it('maps image field', () => {
    const entry = rowToAggDataEntry(makeRow({ image: 'test:v1' }));
    expect(entry.image).toBe('test:v1');

    const entryNull = rowToAggDataEntry(makeRow({ image: null }));
    expect(entryNull.image).toBeUndefined();
  });

  it('passes recipe fingerprint through to chart point identity', () => {
    const entry = rowToAggDataEntry(
      makeRow({
        recipe_fingerprint: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      }),
    );

    expect(entry.recipe_fingerprint).toBe(
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    );
  });

  it('passes runtime cache metadata through to chart points', () => {
    const entry = rowToAggDataEntry(
      makeRow({
        metrics: {
          kv_offloading: 'dram',
          kv_offload_backend: 'mooncake',
          kv_offload_backend_version: '0.3.11.post1',
          kv_p2p_transfer: 'nixl',
          router_name: 'vllm-router',
          router_version: '0.1.14',
        } as unknown as BenchmarkRow['metrics'],
      }),
    );

    expect(entry.kv_offloading).toBe('dram');
    expect(entry.kv_offload_backend).toBe('mooncake');
    expect(entry.kv_offload_backend_version).toBe('0.3.11.post1');
    expect(entry.kv_p2p_transfer).toBe('nixl');
    expect(entry.router_name).toBe('vllm-router');
    expect(entry.router_version).toBe('0.1.14');
  });

  it('passes through measured power telemetry fields when present', () => {
    const entry = rowToAggDataEntry(
      makeRow({
        metrics: {
          tput_per_gpu: 100,
          avg_power_w: 685.5,
          joules_per_output_token: 8.4,
        },
      }),
    );
    expect(entry.avg_power_w).toBe(685.5);
    expect(entry.joules_per_output_token).toBe(8.4);
  });

  it('passes through producer power_invalid_reasons on withheld rows', () => {
    const entry = rowToAggDataEntry(
      makeRow({
        metrics: { power_valid: 0 },
        power_invalid_reasons: ['thermal_throttle', 'sample_gap'],
      }),
    );
    expect(entry.power_invalid_reasons).toEqual(['thermal_throttle', 'sample_gap']);
  });

  it.each([
    ['legacy row without the field', {}],
    ['API null (SQL NULL column)', { power_invalid_reasons: null }],
    ['empty array', { power_invalid_reasons: [] }],
  ])('leaves power_invalid_reasons undefined for %s', (_name, overrides) => {
    const entry = rowToAggDataEntry(makeRow({ metrics: {}, ...overrides }));
    expect(entry.power_invalid_reasons).toBeUndefined();
  });

  it('passes through versioned whole-deployment joules per successful query', () => {
    const entry = rowToAggDataEntry(
      makeRow({
        metrics: {
          power_valid: 1,
          power_metric_schema_version: 2,
          joules_per_successful_query: 1542.75,
        },
      }),
    );

    expect(entry.joules_per_successful_query).toBe(1542.75);
  });

  it('leaves measured power fields undefined for rows that predate the metric', () => {
    const entry = rowToAggDataEntry(makeRow({ metrics: {} }));
    expect(entry.avg_power_w).toBeUndefined();
    expect(entry.joules_per_output_token).toBeUndefined();
  });

  it('passes through multinode / disagg role-split power scalars when present', () => {
    const entry = rowToAggDataEntry(
      makeRow({
        disagg: true,
        metrics: {
          tput_per_gpu: 100,
          power_valid: 1,
          power_metric_schema_version: 2,
          prefill_avg_power_w: 612.3,
          decode_avg_power_w: 701.5,
          joules_per_input_token: 1.2,
          joules_per_output_token: 9.7,
          joules_per_total_token: 0.8,
          prefill_joules_per_input_token: 0.4,
          decode_joules_per_output_token: 5.1,
        },
      }),
    );
    expect(entry.prefill_avg_power_w).toBe(612.3);
    expect(entry.decode_avg_power_w).toBe(701.5);
    expect(entry.joules_per_input_token).toBe(1.2);
    expect(entry.joules_per_output_token).toBe(9.7);
    expect(entry.joules_per_total_token).toBe(0.8);
    expect(entry.prefill_joules_per_input_token).toBe(0.4);
    expect(entry.decode_joules_per_output_token).toBe(5.1);
  });

  it('withholds ambiguous unversioned disagg joules while preserving role watts', () => {
    const entry = rowToAggDataEntry(
      makeRow({
        disagg: true,
        metrics: {
          avg_power_w: 650,
          joules_per_successful_query: 1542.75,
          prefill_avg_power_w: 612.3,
          decode_avg_power_w: 701.5,
          joules_per_input_token: 1.2,
          joules_per_output_token: 9.7,
          joules_per_total_token: 0.8,
        },
      }),
    );

    expect(entry.avg_power_w).toBe(650);
    expect(entry.prefill_avg_power_w).toBe(612.3);
    expect(entry.decode_avg_power_w).toBe(701.5);
    expect(entry.joules_per_input_token).toBeUndefined();
    expect(entry.joules_per_successful_query).toBeUndefined();
    expect(entry.joules_per_output_token).toBeUndefined();
    expect(entry.joules_per_total_token).toBeUndefined();
  });

  it('withholds disagg joules stamped with an unrecognized future schema version', () => {
    const entry = rowToAggDataEntry(
      makeRow({
        disagg: true,
        metrics: {
          power_valid: 1,
          power_metric_schema_version: 3,
          avg_power_w: 650,
          prefill_avg_power_w: 612.3,
          joules_per_input_token: 1.2,
          joules_per_successful_query: 42.5,
          joules_per_output_token: 9.7,
          joules_per_total_token: 0.8,
        },
      }),
    );

    expect(entry.avg_power_w).toBe(650);
    expect(entry.prefill_avg_power_w).toBe(612.3);
    expect(entry.joules_per_input_token).toBeUndefined();
    expect(entry.joules_per_successful_query).toBeUndefined();
    expect(entry.joules_per_output_token).toBeUndefined();
    expect(entry.joules_per_total_token).toBeUndefined();
  });

  it('treats explicit power_valid=0 as authoritative and scrubs all measured telemetry', () => {
    const workers = [{ role: 'agg', worker_idx: 0, num_gpus: 8, avg_power_w: 685.5 }];
    const row = makeRow({
      metrics: {
        power_valid: 0,
        power_metric_schema_version: 2,
        avg_power_w: 685.5,
        joules_per_successful_query: 1542.75,
        joules_per_input_token: 1.2,
        joules_per_output_token: 8.4,
        joules_per_total_token: 0.8,
        prefill_avg_power_w: 612.3,
        decode_avg_power_w: 701.5,
        prefill_joules_per_input_token: 0.4,
        decode_joules_per_output_token: 5.1,
        avg_temp_c: 68.4,
        peak_temp_c: 79.2,
        avg_util_pct: 88.5,
        avg_mem_used_mb: 71234.5,
      },
      workers,
    });
    const entry = rowToAggDataEntry(row);

    expect(entry.avg_power_w).toBeUndefined();
    expect(entry.joules_per_successful_query).toBeUndefined();
    expect(entry.joules_per_input_token).toBeUndefined();
    expect(entry.joules_per_output_token).toBeUndefined();
    expect(entry.joules_per_total_token).toBeUndefined();
    expect(entry.prefill_avg_power_w).toBeUndefined();
    expect(entry.decode_avg_power_w).toBeUndefined();
    expect(entry.prefill_joules_per_input_token).toBeUndefined();
    expect(entry.decode_joules_per_output_token).toBeUndefined();
    expect(entry.avg_temp_c).toBeUndefined();
    expect(entry.peak_temp_c).toBeUndefined();
    expect(entry.avg_util_pct).toBeUndefined();
    expect(entry.avg_mem_used_mb).toBeUndefined();
    expect(entry.workers).toBeUndefined();

    const { chartData } = transformBenchmarkRows([row]);
    const point = chartData.find((data) => data.length > 0)![0];
    expect(point.measuredJPerSuccessfulQuery).toBeUndefined();
    expect(point.measuredWhPerSuccessfulQuery).toBeUndefined();
    expect(point.measuredPowerPercentTdp).toBeUndefined();
  });

  it('withholds every MEASURED_POWER_METRIC_KEYS field when power_valid=0 (ETL parity)', () => {
    const metrics: BenchmarkRow['metrics'] = { power_valid: 0 };
    for (const key of MEASURED_POWER_METRIC_KEYS) metrics[key] = 123.45;
    const entry = rowToAggDataEntry(
      makeRow({
        metrics,
        workers: [{ role: 'agg', worker_idx: 0, num_gpus: 8, avg_power_w: 123.45 }],
      }),
    );

    for (const key of MEASURED_POWER_METRIC_KEYS) {
      expect((entry as unknown as Record<string, unknown>)[key]).toBeUndefined();
    }
    expect(entry.workers).toBeUndefined();
  });

  it('keeps measured telemetry compatible when a legacy row omits power_valid', () => {
    const workers = [{ role: 'agg', worker_idx: 0, num_gpus: 8, avg_power_w: 560 }];
    const row = makeRow({
      metrics: {
        avg_power_w: 560,
        joules_per_successful_query: 1800,
        avg_temp_c: 68.4,
        peak_temp_c: 79.2,
        avg_util_pct: 88.5,
        avg_mem_used_mb: 71234.5,
      },
      workers,
    });
    const entry = rowToAggDataEntry(row);

    expect(entry.avg_power_w).toBe(560);
    expect(entry.joules_per_successful_query).toBe(1800);
    expect(entry.avg_temp_c).toBe(68.4);
    expect(entry.peak_temp_c).toBe(79.2);
    expect(entry.avg_util_pct).toBe(88.5);
    expect(entry.avg_mem_used_mb).toBe(71234.5);
    expect(entry.workers).toEqual(workers);

    const { chartData } = transformBenchmarkRows([row]);
    const point = chartData.find((data) => data.length > 0)![0];
    expect(point.measuredJPerSuccessfulQuery?.y).toBe(1800);
    expect(point.measuredWhPerSuccessfulQuery?.y).toBe(0.5);
    expect(point.measuredPowerPercentTdp?.y).toBe(80);
  });

  it('certifies a validated non-disagg row (no schema version required)', () => {
    const entry = rowToAggDataEntry(
      makeRow({
        metrics: {
          power_valid: 1,
          avg_power_w: 685.5,
        },
      }),
    );
    expect(entry.power_tier).toBe('certified');
  });

  it('certifies a validated disagg row stamped with schema v2', () => {
    const entry = rowToAggDataEntry(
      makeRow({
        disagg: true,
        metrics: {
          power_valid: 1,
          power_metric_schema_version: 2,
          avg_power_w: 650,
          joules_per_output_token: 9.7,
        },
      }),
    );
    expect(entry.power_tier).toBe('certified');
  });

  it('classifies a no-verdict row with telemetry as legacy', () => {
    const entry = rowToAggDataEntry(
      makeRow({
        metrics: {
          avg_power_w: 560,
          joules_per_successful_query: 1800,
        },
      }),
    );
    expect(entry.power_tier).toBe('legacy');
    expect(entry.avg_power_w).toBe(560);
  });

  it('classifies a validated disagg row without schema v2 as legacy', () => {
    const entry = rowToAggDataEntry(
      makeRow({
        disagg: true,
        metrics: {
          power_valid: 1,
          avg_power_w: 650,
          prefill_avg_power_w: 612.3,
          joules_per_output_token: 9.7,
        },
      }),
    );
    expect(entry.power_tier).toBe('legacy');
    expect(entry.prefill_avg_power_w).toBe(612.3);
    expect(entry.joules_per_output_token).toBeUndefined();
  });

  it('leaves power_tier absent for explicit power_valid=0 and telemetry-free rows', () => {
    const invalid = rowToAggDataEntry(
      makeRow({
        metrics: {
          power_valid: 0,
          avg_power_w: 685.5,
          joules_per_output_token: 8.4,
        },
      }),
    );
    expect(invalid.power_tier).toBeUndefined();

    const noTelemetry = rowToAggDataEntry(makeRow({ metrics: {} }));
    expect(noTelemetry.power_tier).toBeUndefined();
  });

  it('carries power_tier onto transformed chart points', () => {
    const legacyRow = makeRow({ id: 1, metrics: { avg_power_w: 560 } });
    const certifiedRow = makeRow({
      id: 2,
      conc: 128,
      metrics: { power_valid: 1, avg_power_w: 685.5 },
    });
    const { chartData } = transformBenchmarkRows([legacyRow, certifiedRow]);
    const points = chartData.find((data) => data.length > 0)!;
    expect(points.map((p) => p.power_tier)).toEqual(['legacy', 'certified']);
  });

  it('passes through per-worker measured power array intact', () => {
    const workers = [
      {
        role: 'prefill' as const,
        worker_idx: 0,
        num_gpus: 4,
        avg_power_w: 588.4,
      },
      {
        role: 'prefill' as const,
        worker_idx: 1,
        num_gpus: 4,
        avg_power_w: 601.2,
      },
      {
        role: 'decode' as const,
        worker_idx: 0,
        num_gpus: 8,
        avg_power_w: 712.1,
      },
      { role: 'frontend' as const, worker_idx: 0, num_gpus: 0, avg_power_w: 0 },
    ];
    const entry = rowToAggDataEntry(makeRow({ workers }));
    expect(entry.workers).toEqual(workers);
  });

  it('defensively drops a non-array workers payload', () => {
    const entry = rowToAggDataEntry(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeRow({ workers: 'oops' as any }),
    );
    expect(entry.workers).toBeUndefined();
  });

  it('leaves multinode role-split scalars and workers undefined for legacy rows', () => {
    const entry = rowToAggDataEntry(makeRow({ metrics: {} }));
    expect(entry.prefill_avg_power_w).toBeUndefined();
    expect(entry.decode_avg_power_w).toBeUndefined();
    expect(entry.joules_per_input_token).toBeUndefined();
    expect(entry.workers).toBeUndefined();
  });

  it('passes through cluster-wide temp/util/mem scalars when present', () => {
    const entry = rowToAggDataEntry(
      makeRow({
        metrics: {
          tput_per_gpu: 100,
          avg_temp_c: 68.4,
          peak_temp_c: 79.2,
          avg_util_pct: 88.5,
          avg_mem_used_mb: 71234.5,
        },
      }),
    );
    expect(entry.avg_temp_c).toBe(68.4);
    expect(entry.peak_temp_c).toBe(79.2);
    expect(entry.avg_util_pct).toBe(88.5);
    expect(entry.avg_mem_used_mb).toBe(71234.5);
  });

  it('leaves cluster-wide temp/util/mem fields undefined when absent (legacy rows)', () => {
    const entry = rowToAggDataEntry(makeRow({ metrics: {} }));
    expect(entry.avg_temp_c).toBeUndefined();
    expect(entry.peak_temp_c).toBeUndefined();
    expect(entry.avg_util_pct).toBeUndefined();
    expect(entry.avg_mem_used_mb).toBeUndefined();
  });

  it('preserves new optional WorkerPower fields (hosts, telemetry) on workers entries', () => {
    const workers = [
      {
        role: 'prefill' as const,
        worker_idx: 0,
        hosts: ['pn0'],
        num_gpus: 4,
        avg_power_w: 612.3,
        avg_temp_c: 71.2,
        peak_temp_c: 78,
        avg_util_pct: 92.1,
        avg_mem_used_mb: 65432,
      },
      {
        role: 'decode' as const,
        worker_idx: 0,
        hosts: ['dn0', 'dn1', 'dn2', 'dn3'],
        num_gpus: 16,
        avg_power_w: 712.1,
      },
    ];
    const entry = rowToAggDataEntry(makeRow({ workers }));
    expect(entry.workers).toEqual(workers);
    expect(entry.workers![0].hosts).toEqual(['pn0']);
    expect(entry.workers![0].avg_temp_c).toBe(71.2);
    expect(entry.workers![1].hosts).toEqual(['dn0', 'dn1', 'dn2', 'dn3']);
    expect(entry.workers![1].avg_temp_c).toBeUndefined();
  });
});

describe('rowToAggDataEntry — agentic measured power', () => {
  const agenticPowerMetrics = {
    tput_per_gpu: 100,
    power_valid: 1,
    power_metric_schema_version: 2,
    avg_power_w: 685.5,
    prefill_avg_power_w: 612.3,
    decode_avg_power_w: 701.5,
    joules_per_input_token: 1.2,
    joules_per_output_token: 9.7,
    joules_per_total_token: 0.8,
    joules_per_successful_query: 1542.75,
    prefill_joules_per_input_token: 0.4,
    decode_joules_per_output_token: 5.1,
    avg_temp_c: 68.4,
    peak_temp_c: 79.2,
    avg_util_pct: 88.5,
    avg_mem_used_mb: 71234.5,
  };
  const agenticWorkers = [
    {
      role: 'prefill' as const,
      worker_idx: 0,
      hosts: ['pn0'],
      num_gpus: 8,
      avg_power_w: 612.3,
      avg_temp_c: 68.4,
      avg_util_pct: 88.5,
    },
    { role: 'decode' as const, worker_idx: 0, hosts: ['dn0'], num_gpus: 8, avg_power_w: 701.5 },
  ];
  const agenticPowerRow = (metricOverrides: Record<string, number> = {}) =>
    makeRow({
      benchmark_type: 'agentic_traces',
      isl: null,
      osl: null,
      disagg: true,
      metrics: { ...agenticPowerMetrics, ...metricOverrides },
      workers: agenticWorkers,
    });

  it('passes the full measured-power payload through for a validated agentic disagg row', () => {
    const entry = rowToAggDataEntry(agenticPowerRow());

    expect(entry.benchmark_type).toBe('agentic_traces');
    expect(entry.power_valid).toBe(1);
    expect(entry.power_metric_schema_version).toBe(2);
    expect(entry.power_tier).toBe('certified');
    expect(entry.avg_power_w).toBe(685.5);
    expect(entry.prefill_avg_power_w).toBe(612.3);
    expect(entry.decode_avg_power_w).toBe(701.5);
    expect(entry.joules_per_input_token).toBe(1.2);
    expect(entry.joules_per_output_token).toBe(9.7);
    expect(entry.joules_per_total_token).toBe(0.8);
    expect(entry.joules_per_successful_query).toBe(1542.75);
    expect(entry.prefill_joules_per_input_token).toBe(0.4);
    expect(entry.decode_joules_per_output_token).toBe(5.1);
    expect(entry.avg_temp_c).toBe(68.4);
    expect(entry.peak_temp_c).toBe(79.2);
    expect(entry.avg_util_pct).toBe(88.5);
    expect(entry.avg_mem_used_mb).toBe(71234.5);
    expect(entry.workers).toEqual(agenticWorkers);
  });

  it('carries agentic role energy onto chart points as the new role-local axes', () => {
    const { chartData } = transformBenchmarkRows([agenticPowerRow()]);
    const point = chartData.find((data) => data.length > 0)![0];
    expect(point.measuredPrefillJPerInputToken?.y).toBe(0.4);
    expect(point.measuredDecodeJPerOutputToken?.y).toBe(5.1);
    expect(point.workers).toEqual(agenticWorkers);
  });

  it('scrubs all measured telemetry (including workers) on an agentic power_valid=0 row', () => {
    const row = agenticPowerRow({ power_valid: 0 });
    const entry = rowToAggDataEntry(row);

    expect(entry.avg_power_w).toBeUndefined();
    expect(entry.prefill_avg_power_w).toBeUndefined();
    expect(entry.decode_avg_power_w).toBeUndefined();
    expect(entry.joules_per_input_token).toBeUndefined();
    expect(entry.joules_per_output_token).toBeUndefined();
    expect(entry.joules_per_total_token).toBeUndefined();
    expect(entry.joules_per_successful_query).toBeUndefined();
    expect(entry.prefill_joules_per_input_token).toBeUndefined();
    expect(entry.decode_joules_per_output_token).toBeUndefined();
    expect(entry.avg_temp_c).toBeUndefined();
    expect(entry.peak_temp_c).toBeUndefined();
    expect(entry.avg_util_pct).toBeUndefined();
    expect(entry.avg_mem_used_mb).toBeUndefined();
    expect(entry.workers).toBeUndefined();
    expect(entry.power_tier).toBeUndefined();

    const { chartData } = transformBenchmarkRows([row]);
    const point = chartData.find((data) => data.length > 0)![0];
    expect(point.measuredPrefillJPerInputToken).toBeUndefined();
    expect(point.measuredDecodeJPerOutputToken).toBeUndefined();
    expect(point.workers).toBeUndefined();
  });
});

describe('applyUncachedTokenBasis', () => {
  const agenticEntry = (metrics: Record<string, number>) => {
    const entry = rowToAggDataEntry(
      makeRow({
        benchmark_type: 'agentic_traces',
        metrics: {
          tput_per_gpu: 900,
          output_tput_per_gpu: 600,
          input_tput_per_gpu: 300,
          ...metrics,
        },
      }),
    );
    return entry;
  };

  it('drops the theoretical prefix share from total and input throughput', () => {
    const entry = agenticEntry({ theoretical_cache_hit_rate: 0.8 });
    expect(applyUncachedTokenBasis(entry)).toBe(true);
    expect(entry.input_tput_per_gpu).toBeCloseTo(60);
    expect(entry.tput_per_gpu).toBeCloseTo(660);
    expect(entry.output_tput_per_gpu).toBe(600);
  });

  it('rescales measured joules per input and total token to the uncached counts', () => {
    const entry = agenticEntry({ theoretical_cache_hit_rate: 0.8 });
    entry.joules_per_input_token = 1;
    entry.joules_per_total_token = 2;
    applyUncachedTokenBasis(entry);
    expect(entry.joules_per_input_token).toBeCloseTo(5);
    expect(entry.joules_per_total_token).toBeCloseTo((2 * 900) / 660);
  });

  it('withholds per-input-token energy when every input token is cacheable', () => {
    const entry = agenticEntry({ theoretical_cache_hit_rate: 1 });
    entry.joules_per_input_token = 1;
    applyUncachedTokenBasis(entry);
    expect(entry.input_tput_per_gpu).toBe(0);
    expect(entry.tput_per_gpu).toBeCloseTo(600);
    expect(entry.joules_per_input_token).toBeUndefined();
  });

  it('rejects agentic entries without a valid rate or input throughput', () => {
    expect(applyUncachedTokenBasis(agenticEntry({}))).toBe(false);
    expect(applyUncachedTokenBasis(agenticEntry({ theoretical_cache_hit_rate: 1.2 }))).toBe(false);
    expect(
      applyUncachedTokenBasis(
        agenticEntry({ theoretical_cache_hit_rate: 0.5, input_tput_per_gpu: 0 }),
      ),
    ).toBe(false);
  });

  it('leaves fixed-sequence entries unchanged', () => {
    const entry = rowToAggDataEntry(makeRow());
    expect(applyUncachedTokenBasis(entry)).toBe(true);
    expect(entry.tput_per_gpu).toBe(450.5);
    expect(entry.input_tput_per_gpu).toBe(50.3);
  });
});

describe('transformBenchmarkRows', () => {
  it('rescales every token metric on the uncached basis and drops points it cannot rescale', () => {
    const agentic = (id: number, metrics: Record<string, number>) =>
      makeRow({
        id,
        benchmark_type: 'agentic_traces',
        metrics: {
          tput_per_gpu: 900,
          output_tput_per_gpu: 600,
          input_tput_per_gpu: 300,
          ...metrics,
        },
      });
    const rows = [agentic(1, { theoretical_cache_hit_rate: 0.8 }), agentic(2, {})];
    const total = transformBenchmarkRows(rows).chartData[0];
    const uncached = transformBenchmarkRows(rows, 'median', undefined, 'uncached').chartData[0];
    expect(total).toHaveLength(2);
    expect(uncached).toHaveLength(1);
    const before = total.find((p) => p.id === 1)!;
    const after = uncached[0];
    expect(after.tpPerGpu.y).toBeCloseTo(660);
    expect(after.inputTputPerGpu?.y).toBeCloseTo(60);
    expect(after.outputTputPerGpu?.y).toBe(before.outputTputPerGpu?.y);
    expect(after.costh.y).toBeCloseTo((before.costh.y * 900) / 660);
  });

  it('returns empty arrays for empty input', () => {
    const { chartData, hardwareConfig } = transformBenchmarkRows([]);
    expect(chartData).toHaveLength(2);
    expect(chartData[0]).toHaveLength(0);
    expect(chartData[1]).toHaveLength(0);
    expect(Object.keys(hardwareConfig)).toHaveLength(0);
  });

  it('produces InferenceData with x, y, hwKey fields', () => {
    const rows = [makeRow()];
    const { chartData } = transformBenchmarkRows(rows);
    const hasData = chartData.some((d) => d.length > 0);
    expect(hasData).toBe(true);

    const firstPoint = chartData.find((d) => d.length > 0)![0];
    expect(firstPoint.x).toBeDefined();
    expect(firstPoint.y).toBeDefined();
    expect(firstPoint.hwKey).toBeDefined();
    expect(typeof firstPoint.hwKey).toBe('string');
  });

  it('builds hardware config from rows', () => {
    const rows = [makeRow({ hardware: 'h200', framework: 'trt' })];
    const { hardwareConfig } = transformBenchmarkRows(rows);
    expect(Object.keys(hardwareConfig).length).toBeGreaterThan(0);
    const hwKeys = Object.keys(hardwareConfig);
    expect(hwKeys.some((k) => k.includes('h200'))).toBe(true);
  });

  it('produces two chart arrays (e2e and interactivity)', () => {
    const rows = [makeRow()];
    const { chartData } = transformBenchmarkRows(rows);
    expect(chartData).toHaveLength(2);
  });

  it('sets date on all data points', () => {
    const rows = [makeRow()];
    const { chartData } = transformBenchmarkRows(rows);
    for (const chart of chartData) {
      for (const point of chart) {
        expect(point.date).toBe('2026-03-01');
      }
    }
  });

  it('handles multiple rows with different hardware', () => {
    const rows = [
      makeRow({ hardware: 'h200', framework: 'trt' }),
      makeRow({ hardware: 'mi300x', framework: 'vllm', conc: 32 }),
    ];
    const { hardwareConfig } = transformBenchmarkRows(rows);
    const hwKeys = Object.keys(hardwareConfig);
    expect(hwKeys.length).toBeGreaterThanOrEqual(2);
  });

  it('folds pp into the total GPU count and the point label (overlay path)', () => {
    const base = makeRow();
    const rows = [
      makeRow({
        num_prefill_gpu: 0,
        num_decode_gpu: 0,
        metrics: { ...base.metrics, prefill_pp: 2, decode_pp: 2 },
      }),
    ];
    const { chartData } = transformBenchmarkRows(rows);
    const point = chartData.find((d) => d.length > 0)![0];
    expect(point.tp).toBe(16);
    expect(point.pp).toBe(2);
    expect(getPointLabel(point)).toBe('TP8PP2');
  });

  it('keeps total GPU count and label unchanged when pp is absent', () => {
    const { chartData } = transformBenchmarkRows([makeRow()]);
    const point = chartData.find((d) => d.length > 0)![0];
    expect(point.tp).toBe(8);
    expect(getPointLabel(point)).toBe('TP8');
  });

  it('labels M3 mtp configs with the "M3 EAGLE" suffix', () => {
    const rows = [
      makeRow({
        model: 'minimaxm3',
        hardware: 'h100',
        framework: 'vllm',
        spec_method: 'mtp',
      }),
    ];
    const { hardwareConfig } = transformBenchmarkRows(rows);
    const entry = hardwareConfig['h100_vllm_mtp'];
    expect(entry).toBeDefined();
    expect(entry.suffix).toBe('(vLLM, M3 EAGLE)');
  });

  it('keeps the generic MTP suffix for non-M3 mtp configs', () => {
    const rows = [
      makeRow({
        model: 'dsr1',
        hardware: 'h200',
        framework: 'sglang',
        spec_method: 'mtp',
      }),
    ];
    const { hardwareConfig } = transformBenchmarkRows(rows);
    const entry = hardwareConfig['h200_sglang_mtp'];
    expect(entry).toBeDefined();
    expect(entry.suffix).toBe('(SGLang, MTP)');
  });
});

describe('rowToAggDataEntry — extended edge cases', () => {
  it('maps precision field from row', () => {
    const entry = rowToAggDataEntry(makeRow({ precision: 'fp4' }));
    expect(entry.precision).toBe('fp4');
  });

  it('initializes hwKey as empty string', () => {
    const entry = rowToAggDataEntry(makeRow());
    expect(entry.hwKey).toBe('');
  });

  it('maps conc from row.conc', () => {
    const entry = rowToAggDataEntry(makeRow({ conc: 128 }));
    expect(entry.conc).toBe(128);
  });

  it('maps all ITL metric fields', () => {
    const entry = rowToAggDataEntry(
      makeRow({
        metrics: {
          mean_itl: 0.045,
          median_itl: 0.042,
          std_itl: 0.005,
          p99_itl: 0.088,
        },
      }),
    );
    expect(entry.mean_itl).toBe(0.045);
    expect(entry.median_itl).toBe(0.042);
    expect(entry.std_itl).toBe(0.005);
    expect(entry.p99_itl).toBe(0.088);
  });

  it('defaults all ITL metrics to 0 when missing', () => {
    const entry = rowToAggDataEntry(makeRow({ metrics: {} }));
    expect(entry.mean_itl).toBe(0);
    expect(entry.median_itl).toBe(0);
    expect(entry.std_itl).toBe(0);
    expect(entry.p99_itl).toBe(0);
  });

  it('maps all output and input throughput fields', () => {
    const entry = rowToAggDataEntry(
      makeRow({
        metrics: {
          tput_per_gpu: 500,
          output_tput_per_gpu: 420,
          input_tput_per_gpu: 80,
        },
      }),
    );
    expect(entry.tput_per_gpu).toBe(500);
    expect(entry.output_tput_per_gpu).toBe(420);
    expect(entry.input_tput_per_gpu).toBe(80);
  });

  it('defaults throughput metrics to 0 when missing', () => {
    const entry = rowToAggDataEntry(makeRow({ metrics: {} }));
    expect(entry.output_tput_per_gpu).toBe(0);
    expect(entry.input_tput_per_gpu).toBe(0);
  });

  it('maps prefill parallelism fields', () => {
    const entry = rowToAggDataEntry(
      makeRow({
        disagg: true,
        prefill_tp: 4,
        prefill_ep: 2,
        prefill_dp_attention: true,
        prefill_num_workers: 3,
      }),
    );
    expect(entry.prefill_tp).toBe(4);
    expect(entry.prefill_ep).toBe(2);
    expect(entry.prefill_dp_attention).toBe(true);
    expect(entry.prefill_num_workers).toBe(3);
  });

  it('maps decode parallelism fields', () => {
    const entry = rowToAggDataEntry(
      makeRow({
        decode_tp: 2,
        decode_ep: 4,
        decode_dp_attention: true,
        decode_num_workers: 6,
      }),
    );
    expect(entry.decode_tp).toBe(2);
    expect(entry.decode_ep).toBe(4);
    expect(entry.decode_dp_attention).toBe(true);
    expect(entry.decode_num_workers).toBe(6);
  });

  it('maps ep from decode_ep and dp_attention from decode_dp_attention', () => {
    const entry = rowToAggDataEntry(makeRow({ decode_ep: 8, decode_dp_attention: true }));
    expect(entry.ep).toBe(8);
    expect(entry.dp_attention).toBe(true);
  });

  it('maps is_multinode field', () => {
    const entryTrue = rowToAggDataEntry(makeRow({ is_multinode: true }));
    expect(entryTrue.is_multinode).toBe(true);

    const entryFalse = rowToAggDataEntry(makeRow({ is_multinode: false }));
    expect(entryFalse.is_multinode).toBe(false);
  });

  it('maps date field', () => {
    const entry = rowToAggDataEntry(makeRow({ date: '2026-02-15' }));
    expect(entry.date).toBe('2026-02-15');
  });

  it('maps all known DB model keys to their display names', () => {
    const llama = rowToAggDataEntry(makeRow({ model: 'llama70b' }));
    expect(llama.model).toBe('Llama-3.3-70B-Instruct-FP8');

    const qwen = rowToAggDataEntry(makeRow({ model: 'qwen3.5' }));
    expect(qwen.model).toBe('Qwen-3.5-397B-A17B');
  });

  it('maps all e2el metric fields', () => {
    const entry = rowToAggDataEntry(
      makeRow({
        metrics: {
          mean_e2el: 3.5,
          median_e2el: 3.2,
          std_e2el: 0.4,
          p99_e2el: 5.1,
        },
      }),
    );
    expect(entry.mean_e2el).toBe(3.5);
    expect(entry.median_e2el).toBe(3.2);
    expect(entry.std_e2el).toBe(0.4);
    expect(entry.p99_e2el).toBe(5.1);
  });

  it('maps all TPOT metric fields', () => {
    const entry = rowToAggDataEntry(
      makeRow({
        metrics: {
          mean_tpot: 0.025,
          median_tpot: 0.022,
          std_tpot: 0.003,
          p99_tpot: 0.041,
        },
      }),
    );
    expect(entry.mean_tpot).toBe(0.025);
    expect(entry.median_tpot).toBe(0.022);
    expect(entry.std_tpot).toBe(0.003);
    expect(entry.p99_tpot).toBe(0.041);
  });

  it('maps all TTFT metric fields', () => {
    const entry = rowToAggDataEntry(
      makeRow({
        metrics: {
          mean_ttft: 0.22,
          median_ttft: 0.19,
          std_ttft: 0.03,
          p99_ttft: 0.45,
        },
      }),
    );
    expect(entry.mean_ttft).toBe(0.22);
    expect(entry.median_ttft).toBe(0.19);
    expect(entry.std_ttft).toBe(0.03);
    expect(entry.p99_ttft).toBe(0.45);
  });

  it('maps all interactivity metric fields', () => {
    const entry = rowToAggDataEntry(
      makeRow({
        metrics: {
          mean_intvty: 15,
          median_intvty: 14.2,
          std_intvty: 2.5,
          p99_intvty: 22.1,
        },
      }),
    );
    expect(entry.mean_intvty).toBe(15);
    expect(entry.median_intvty).toBe(14.2);
    expect(entry.std_intvty).toBe(2.5);
    expect(entry.p99_intvty).toBe(22.1);
  });
});

describe('transformBenchmarkRows — deployment topology', () => {
  it('renders multinode aggregate TP8PP2 as 16 total GPUs without prefill/decode roles', () => {
    const base = makeRow();
    const { chartData } = transformBenchmarkRows([
      makeRow({
        framework: 'dynamo-vllm',
        disagg: false,
        is_multinode: true,
        prefill_tp: 8,
        prefill_ep: 1,
        prefill_num_workers: 1,
        decode_tp: 0,
        decode_ep: 0,
        decode_num_workers: 0,
        num_prefill_gpu: 16,
        num_decode_gpu: 0,
        metrics: { ...base.metrics, prefill_pp: 2, decode_pp: 1 },
      }),
    ]);
    const point = chartData.flat()[0];

    expect(point.tp).toBe(16);
    expect(point.decode_tp).toBe(8);
    expect(point.pp).toBe(2);
    expect(point.is_multinode).toBe(true);
    expect(point.disagg).toBeUndefined();
    expect(getPointLabel(point)).toContain('TP8PP2');
  });

  it('uses sum of prefill + decode GPUs as tp for disaggregated configs', () => {
    const rows = [
      makeRow({
        hardware: 'h200',
        framework: 'dynamo-trt',
        disagg: true,
        num_prefill_gpu: 4,
        num_decode_gpu: 12,
        decode_tp: 8,
      }),
    ];
    const { chartData } = transformBenchmarkRows(rows);
    const point = chartData.flat().find((p) => p.disagg === true);
    expect(point).toBeDefined();
    expect(point!.tp).toBe(4 + 12);
  });

  it('sets disagg fields on data points when disagg is true', () => {
    const rows = [
      makeRow({
        hardware: 'b200',
        framework: 'dynamo-trt',
        disagg: true,
        num_prefill_gpu: 2,
        num_decode_gpu: 6,
      }),
    ];
    const { chartData } = transformBenchmarkRows(rows);
    const point = chartData.flat().find((p) => p.disagg === true);
    expect(point).toBeDefined();
    expect(point!.num_prefill_gpu).toBe(2);
    expect(point!.num_decode_gpu).toBe(6);
  });

  it('omits disagg fields on data points when disagg is false', () => {
    const rows = [makeRow({ disagg: false, num_prefill_gpu: 8, num_decode_gpu: 8 })];
    const { chartData } = transformBenchmarkRows(rows);
    const point = chartData.flat()[0];
    expect(point.disagg).toBeUndefined();
    expect(point.num_prefill_gpu).toBeUndefined();
    expect(point.num_decode_gpu).toBeUndefined();
  });
});

describe('transformBenchmarkRows — hardware key resolution', () => {
  it('constructs hwKey from hardware + framework', () => {
    const rows = [makeRow({ hardware: 'h200', framework: 'trt' })];
    const { chartData, hardwareConfig } = transformBenchmarkRows(rows);
    const point = chartData.flat()[0];
    expect(point.hwKey).toBe('h200_trt');
    expect(hardwareConfig).toHaveProperty('h200_trt');
  });

  it('appends _mtp suffix when spec_method is mtp', () => {
    const rows = [makeRow({ hardware: 'h200', framework: 'trt', spec_method: 'mtp' })];
    const { chartData, hardwareConfig } = transformBenchmarkRows(rows);
    const point = chartData.flat()[0];
    expect(point.hwKey).toBe('h200_trt_mtp');
    expect(hardwareConfig).toHaveProperty('h200_trt_mtp');
  });

  it('groups none, MTP, and EAGLE agentic points into one hardware series', () => {
    const rows = [
      makeRow({
        benchmark_type: 'agentic_traces',
        hardware: 'h200',
        framework: 'trt',
        spec_method: 'none',
      }),
      makeRow({
        benchmark_type: 'agentic_traces',
        hardware: 'h200',
        framework: 'trt',
        spec_method: 'mtp',
      }),
      makeRow({
        benchmark_type: 'agentic_traces',
        hardware: 'h200',
        framework: 'trt',
        spec_method: 'eagle',
      }),
    ];

    const { chartData, hardwareConfig } = transformBenchmarkRows(rows);
    expect(Object.keys(hardwareConfig)).toEqual(['h200_trt']);
    expect(chartData[0].map((point) => point.hwKey)).toEqual(['h200_trt', 'h200_trt', 'h200_trt']);
    expect(chartData[0].map((point) => point.spec_decoding)).toEqual(['none', 'mtp', 'eagle']);
  });

  it('keeps one mixed-spec agentic series identity across comparison dates', () => {
    const rows = dedupeAgenticHistoryRuns([
      makeRow({
        id: 1,
        benchmark_type: 'agentic_traces',
        spec_method: 'none',
        conc: 8,
        date: '2026-06-01',
        workflow_run_id: 30,
        run_started_at: '2026-06-01T10:00:00Z',
      }),
      makeRow({
        id: 2,
        benchmark_type: 'agentic_traces',
        spec_method: 'mtp',
        conc: 16,
        date: '2026-06-01',
        workflow_run_id: 30,
        run_started_at: '2026-06-01T10:00:00Z',
      }),
      makeRow({
        id: 3,
        benchmark_type: 'agentic_traces',
        spec_method: 'eagle',
        conc: 32,
        date: '2026-06-02',
        workflow_run_id: 31,
        run_started_at: '2026-06-02T10:00:00Z',
      }),
      makeRow({
        id: 4,
        benchmark_type: 'agentic_traces',
        spec_method: 'none',
        conc: 64,
        date: '2026-06-02',
        workflow_run_id: 31,
        run_started_at: '2026-06-02T10:00:00Z',
      }),
    ]);

    const { chartData, hardwareConfig } = transformBenchmarkRows(rows);
    const pointsByDate = Object.groupBy(chartData[0], (point) => point.date);

    expect(Object.keys(hardwareConfig)).toEqual(['h200_trt']);
    expect(pointsByDate['2026-06-01']?.map((point) => point.spec_decoding)).toEqual([
      'none',
      'mtp',
    ]);
    expect(pointsByDate['2026-06-02']?.map((point) => point.spec_decoding)).toEqual([
      'eagle',
      'none',
    ]);
    expect(new Set(chartData[0].map((point) => point.hwKey))).toEqual(new Set(['h200_trt']));
  });

  it('handles AMD hardware with vllm framework', () => {
    const rows = [makeRow({ hardware: 'mi300x', framework: 'vllm' })];
    const { chartData, hardwareConfig } = transformBenchmarkRows(rows);
    const point = chartData.flat()[0];
    expect(point.hwKey).toBe('mi300x_vllm');
    expect(hardwareConfig).toHaveProperty('mi300x_vllm');
  });

  it('falls back to unknown config for completely unrecognized hardware', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const rows = [makeRow({ hardware: 'zzz999', framework: 'mystery' })];
    const { hardwareConfig } = transformBenchmarkRows(rows);
    const hwKeys = Object.keys(hardwareConfig);
    expect(hwKeys.length).toBe(1);
    const config = hardwareConfig[hwKeys[0]];
    expect(config.label).toBe('Unknown');

    warnSpy.mockRestore();
    infoSpy.mockRestore();
  });
});

describe('transformBenchmarkRows — hardware config caching', () => {
  it('deduplicates hardware config for rows with the same hwKey', () => {
    const rows = [
      makeRow({ hardware: 'h200', framework: 'trt', conc: 16 }),
      makeRow({ hardware: 'h200', framework: 'trt', conc: 64 }),
      makeRow({ hardware: 'h200', framework: 'trt', conc: 128 }),
    ];
    const { hardwareConfig, chartData } = transformBenchmarkRows(rows);
    const hwKeys = Object.keys(hardwareConfig);
    expect(hwKeys).toHaveLength(1);
    expect(hwKeys[0]).toBe('h200_trt');

    for (const chart of chartData) {
      expect(chart).toHaveLength(3);
    }
  });

  it('creates separate config entries for different frameworks on same GPU', () => {
    const rows = [
      makeRow({ hardware: 'h100', framework: 'vllm' }),
      makeRow({ hardware: 'h100', framework: 'dynamo-trt', conc: 32 }),
    ];
    const { hardwareConfig } = transformBenchmarkRows(rows);
    const hwKeys = Object.keys(hardwareConfig);
    expect(hwKeys).toContain('h100_vllm');
    expect(hwKeys).toContain('h100_dynamo-trt');
    expect(hwKeys).toHaveLength(2);
  });
});

describe('transformBenchmarkRows — data point values', () => {
  it('sets x to median_intvty for interactivity chart and median_e2el for e2e chart', () => {
    const rows = [
      makeRow({
        metrics: {
          median_intvty: 25,
          median_e2el: 1.8,
          tput_per_gpu: 300,
          output_tput_per_gpu: 250,
          input_tput_per_gpu: 50,
        },
      }),
    ];
    const { chartData } = transformBenchmarkRows(rows);
    const interactivityPoint = chartData[0][0];
    const e2ePoint = chartData[1][0];
    expect(interactivityPoint.x).toBe(25);
    expect(e2ePoint.x).toBe(1.8);
  });

  it('sets y to tput_per_gpu for both chart types (default y metric)', () => {
    const rows = [
      makeRow({
        metrics: {
          tput_per_gpu: 600,
          output_tput_per_gpu: 500,
          input_tput_per_gpu: 100,
          median_intvty: 20,
          median_e2el: 2,
        },
      }),
    ];
    const { chartData } = transformBenchmarkRows(rows);
    expect(chartData[0][0].y).toBe(600);
    expect(chartData[1][0].y).toBe(600);
  });

  it('includes roofline metric fields (tpPerGpu, tpPerMw, cost) on data points', () => {
    const rows = [
      makeRow({
        hardware: 'h100',
        framework: 'vllm',
        metrics: {
          tput_per_gpu: 400,
          output_tput_per_gpu: 350,
          input_tput_per_gpu: 50,
          median_intvty: 15,
          median_e2el: 2,
        },
      }),
    ];
    const { chartData } = transformBenchmarkRows(rows);
    const point = chartData[0][0];
    expect(point.tpPerGpu).toBeDefined();
    expect(point.tpPerGpu.y).toBe(400);
    expect(point.tpPerMw).toBeDefined();
    expect(point.tpPerMw.y).toBeGreaterThan(0);
    expect(point.costh).toBeDefined();
    expect(point.costh.y).toBeGreaterThan(0);
    expect(point.costr).toBeDefined();
    expect(point.costr.y).toBeGreaterThan(0);
  });

  it('sets outputTputPerGpu and inputTputPerGpu when values are non-zero', () => {
    const rows = [
      makeRow({
        metrics: {
          tput_per_gpu: 500,
          output_tput_per_gpu: 420,
          input_tput_per_gpu: 80,
          median_intvty: 18,
          median_e2el: 2.5,
        },
      }),
    ];
    const { chartData } = transformBenchmarkRows(rows);
    const point = chartData[0][0];
    expect(point.outputTputPerGpu).toBeDefined();
    expect(point.outputTputPerGpu!.y).toBe(420);
    expect(point.inputTputPerGpu).toBeDefined();
    expect(point.inputTputPerGpu!.y).toBe(80);
  });

  it('groups data points by hwKey within each chart', () => {
    const rows = [
      makeRow({ hardware: 'h200', framework: 'trt', conc: 16 }),
      makeRow({ hardware: 'h200', framework: 'trt', conc: 64 }),
      makeRow({ hardware: 'mi300x', framework: 'vllm', conc: 32 }),
    ];
    const { chartData } = transformBenchmarkRows(rows);
    for (const chart of chartData) {
      const h200Points = chart.filter((p) => p.hwKey === 'h200_trt');
      const mi300xPoints = chart.filter((p) => p.hwKey === 'mi300x_vllm');
      expect(h200Points).toHaveLength(2);
      expect(mi300xPoints).toHaveLength(1);
    }
  });
});

describe('transformBenchmarkRows — spec decoding variants', () => {
  it('does not append suffix when spec_method is none', () => {
    const rows = [makeRow({ hardware: 'h200', framework: 'trt', spec_method: 'none' })];
    const { chartData } = transformBenchmarkRows(rows);
    expect(chartData.flat()[0].hwKey).toBe('h200_trt');
  });

  it('appends non-mtp spec_method as suffix', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const rows = [makeRow({ hardware: 'h200', framework: 'trt', spec_method: 'eagle' })];
    const { chartData } = transformBenchmarkRows(rows);
    expect(chartData.flat()[0].hwKey).toBe('h200_trt_eagle');

    warnSpy.mockRestore();
    infoSpy.mockRestore();
  });
});

describe('transformBenchmarkRows — dp_attention narrowing', () => {
  it('narrows string dp_attention "true" to boolean true', () => {
    const rows = [makeRow({ decode_dp_attention: 'true' as unknown as boolean })];
    const { chartData } = transformBenchmarkRows(rows);
    const point = chartData.flat()[0];
    expect(point.decode_dp_attention).toBe(true);
  });

  it('narrows string dp_attention "false" to boolean false', () => {
    const rows = [makeRow({ decode_dp_attention: 'false' as unknown as boolean })];
    const { chartData } = transformBenchmarkRows(rows);
    const point = chartData.flat()[0];
    expect(point.decode_dp_attention).toBe(false);
  });

  it('narrows boolean dp_attention true directly', () => {
    const rows = [makeRow({ decode_dp_attention: true })];
    const { chartData } = transformBenchmarkRows(rows);
    const point = chartData.flat()[0];
    expect(point.decode_dp_attention).toBe(true);
  });
});

describe('mergeRunScopedRows', () => {
  const vllmRun = (over: Partial<BenchmarkRow> = {}) =>
    makeRow({
      model: 'dsv4',
      hardware: 'b300',
      framework: 'vllm',
      precision: 'fp4',
      ...over,
    });
  const sglangBase = (over: Partial<BenchmarkRow> = {}) =>
    makeRow({
      model: 'dsv4',
      hardware: 'b300',
      framework: 'sglang',
      precision: 'fp4',
      ...over,
    });

  it('pins configs the run covers to the run rows, replacing base rows', () => {
    const runRows = [vllmRun({ id: 10, conc: 32 }), vllmRun({ id: 11, conc: 64 })];
    const baseRows = [vllmRun({ id: 90, conc: 32 }), vllmRun({ id: 91, conc: 128 })];
    const merged = mergeRunScopedRows(runRows, baseRows);
    expect(merged.map((r) => r.id).toSorted((a, b) => a - b)).toEqual([10, 11]);
  });

  it('carries forward configs the run does not cover (the same-day other-framework curve)', () => {
    const runRows = [vllmRun({ id: 10 })];
    const baseRows = [
      vllmRun({ id: 90 }),
      sglangBase({ id: 91 }),
      sglangBase({ id: 92, conc: 128 }),
    ];
    const merged = mergeRunScopedRows(runRows, baseRows);
    expect(merged.map((r) => r.id).toSorted((a, b) => a - b)).toEqual([10, 91, 92]);
  });

  it('keeps base rows of other hardware / precision / model untouched', () => {
    const runRows = [vllmRun({ id: 10 })];
    const baseRows = [
      vllmRun({ id: 90, hardware: 'b200' }),
      vllmRun({ id: 91, precision: 'fp8' }),
      vllmRun({ id: 92, model: 'kimik2.5' }),
    ];
    const merged = mergeRunScopedRows(runRows, baseRows);
    expect(merged.map((r) => r.id).toSorted((a, b) => a - b)).toEqual([10, 90, 91, 92]);
  });

  it('carries forward sibling topologies when an append run touches only one', () => {
    const runRows = [vllmRun({ id: 10, decode_tp: 8, conc: 128 })];
    const baseRows = [
      vllmRun({ id: 90, decode_tp: 8, conc: 64 }),
      vllmRun({ id: 91, decode_tp: 4, conc: 32 }),
    ];

    const merged = mergeRunScopedRows(runRows, baseRows);

    expect(merged.map((r) => r.id).toSorted((a, b) => a - b)).toEqual([10, 91]);
  });

  it('carries forward sibling recipe variants at the same topology and concurrency', () => {
    const runRows = [
      vllmRun({
        id: 10,
        conc: 64,
        recipe_fingerprint: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      }),
    ];
    const baseRows = [
      vllmRun({
        id: 90,
        conc: 64,
        recipe_fingerprint: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      }),
    ];

    const merged = mergeRunScopedRows(runRows, baseRows);

    expect(merged.map((r) => r.id).toSorted((a, b) => a - b)).toEqual([10, 90]);
  });

  it('scopes per benchmark_type — an agentic run does not hide fixed-seq carry-forward', () => {
    const runRows = [vllmRun({ id: 10, benchmark_type: 'agentic_traces' })];
    const baseRows = [
      vllmRun({ id: 90, benchmark_type: 'agentic_traces' }),
      vllmRun({ id: 91, benchmark_type: 'single_turn' }),
    ];
    const merged = mergeRunScopedRows(runRows, baseRows);
    expect(merged.map((r) => r.id).toSorted((a, b) => a - b)).toEqual([10, 91]);
  });

  it('returns base rows unchanged when the run produced nothing', () => {
    const baseRows = [vllmRun({ id: 90 }), sglangBase({ id: 91 })];
    expect(mergeRunScopedRows([], baseRows)).toBe(baseRows);
  });
});

describe('rowToAggDataEntry — agentic interactivity invariant', () => {
  const agentic = (metrics: Record<string, number>) =>
    rowToAggDataEntry(
      makeRow({
        benchmark_type: 'agentic_traces',
        isl: null,
        osl: null,
        metrics,
      }),
    );

  it('overrides an artifact-supplied (fast-tail) *_intvty with 1/*_itl', () => {
    const entry = agentic({
      p90_itl: 0.0893,
      p90_intvty: 23.91,
      p75_itl: 0.0692,
      p75_intvty: 19,
    });
    expect(entry.p90_intvty).toBeCloseTo(1 / 0.0893, 6);
    expect(entry.p75_intvty).toBeCloseTo(1 / 0.0692, 6);
    expect(entry.p90_intvty).not.toBeCloseTo(23.91, 1);
  });

  it('derives intvty from itl when the artifact omits intvty entirely', () => {
    const entry = agentic({ p90_itl: 0.1, p95_itl: 0.2 });
    expect(entry.p90_intvty).toBeCloseTo(10, 6);
    expect(entry.p95_intvty).toBeCloseTo(5, 6);
  });

  it('does not invert interactivity for single_turn rows', () => {
    const entry = rowToAggDataEntry(makeRow({ metrics: { p90_itl: 0.05, p90_intvty: 999 } }));
    expect(entry.p90_intvty).toBe(999);
  });

  it('DROPS a stale artifact *_intvty when the matching *_itl is absent (overlay mirror of the ETL fix)', () => {
    const entry = agentic({ p90_intvty: 42, p95_itl: 0.2 });
    expect(entry.p90_intvty).toBe(0);
    expect(entry.p95_intvty).toBeCloseTo(5, 6);
  });

  it('DROPS a stale artifact *_intvty when the matching *_itl is zero/invalid', () => {
    const entry = agentic({ p90_itl: 0, p90_intvty: 42 });
    expect(entry.p90_intvty).toBe(0);
  });
});

describe('rowToAggDataEntry — id coercion', () => {
  it('coerces a stringified bigint id to a number', () => {
    const entry = rowToAggDataEntry(makeRow({ id: '206863' as unknown as number }));
    expect(entry.id).toBe(206863);
  });

  it('yields undefined (not NaN) for a missing id — overlay rows have no persisted id', () => {
    const entry = rowToAggDataEntry(makeRow({ id: undefined as unknown as number }));
    expect(entry.id).toBeUndefined();
  });

  it('yields undefined for a non-positive or non-numeric id', () => {
    expect(rowToAggDataEntry(makeRow({ id: 0 })).id).toBeUndefined();
    expect(rowToAggDataEntry(makeRow({ id: 'abc' as unknown as number })).id).toBeUndefined();
  });
});

describe('mergeRunScopedRows — AgentX snapshots own all offload variants', () => {
  const agenticRow = (over: Partial<BenchmarkRow> = {}) =>
    makeRow({
      model: 'dsr1',
      hardware: 'b300',
      framework: 'vllm',
      precision: 'fp4',
      benchmark_type: 'agentic_traces',
      isl: null,
      osl: null,
      ...over,
    });

  it('a full run snapshot replaces old points across offload variants', () => {
    const runRows = [agenticRow({ id: 10, offload_mode: 'on' })];
    const baseRows = [
      agenticRow({ id: 90, offload_mode: 'on' }),
      agenticRow({ id: 91, offload_mode: 'off' }),
    ];
    const merged = mergeRunScopedRows(runRows, baseRows);
    expect(merged.map((r) => r.id).toSorted((a, b) => a - b)).toEqual([10]);
  });

  it('a run covering both offload variants pins both', () => {
    const runRows = [
      agenticRow({ id: 10, offload_mode: 'on' }),
      agenticRow({ id: 11, offload_mode: 'off' }),
    ];
    const baseRows = [
      agenticRow({ id: 90, offload_mode: 'on' }),
      agenticRow({ id: 91, offload_mode: 'off' }),
    ];
    const merged = mergeRunScopedRows(runRows, baseRows);
    expect(merged.map((r) => r.id).toSorted((a, b) => a - b)).toEqual([10, 11]);
  });
});
