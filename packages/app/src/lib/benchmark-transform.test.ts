import { describe, it, expect, vi } from 'vitest';

import type { BenchmarkRow } from '@/lib/api';

import { rowToAggDataEntry, transformBenchmarkRows } from './benchmark-transform';

function makeRow(overrides: Partial<BenchmarkRow> = {}): BenchmarkRow {
  return {
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
      mean_intvty: 13.0,
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
  });

  it('defaults missing metrics to 0', () => {
    const entry = rowToAggDataEntry(makeRow({ metrics: {} }));
    expect(entry.tput_per_gpu).toBe(0);
    expect(entry.median_ttft).toBe(0);
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

  it('maps decode_tp to tp', () => {
    const entry = rowToAggDataEntry(makeRow({ decode_tp: 4 }));
    expect(entry.tp).toBe(4);
  });

  it('maps image field', () => {
    const entry = rowToAggDataEntry(makeRow({ image: 'test:v1' }));
    expect(entry.image).toBe('test:v1');

    const entryNull = rowToAggDataEntry(makeRow({ image: null }));
    expect(entryNull.image).toBeUndefined();
  });
});

describe('transformBenchmarkRows', () => {
  it('returns empty arrays for empty input', () => {
    const { chartData, hardwareConfig } = transformBenchmarkRows([]);
    expect(chartData).toHaveLength(2); // one per chart definition (e2e + interactivity)
    expect(chartData[0]).toHaveLength(0);
    expect(chartData[1]).toHaveLength(0);
    expect(Object.keys(hardwareConfig)).toHaveLength(0);
  });

  it('produces InferenceData with x, y, hwKey fields', () => {
    const rows = [makeRow()];
    const { chartData } = transformBenchmarkRows(rows);
    // At least one chart type should have data
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
    // hwKey should be constructed from hardware + framework
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
});

// ---------------------------------------------------------------------------
// Additional edge-case tests for rowToAggDataEntry
// ---------------------------------------------------------------------------

describe('rowToAggDataEntry — extended edge cases', () => {
  it('maps precision field from row', () => {
    const entry = rowToAggDataEntry(makeRow({ precision: 'fp4' }));
    expect(entry.precision).toBe('fp4');
  });

  it('initializes hwKey as empty string', () => {
    const entry = rowToAggDataEntry(makeRow());
    // hwKey is set to '' inside rowToAggDataEntry — it gets resolved later in transformBenchmarkRows
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
    // Test a few known models from DB_MODEL_TO_DISPLAY to verify the lookup works
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
          mean_intvty: 15.0,
          median_intvty: 14.2,
          std_intvty: 2.5,
          p99_intvty: 22.1,
        },
      }),
    );
    expect(entry.mean_intvty).toBe(15.0);
    expect(entry.median_intvty).toBe(14.2);
    expect(entry.std_intvty).toBe(2.5);
    expect(entry.p99_intvty).toBe(22.1);
  });
});

// ---------------------------------------------------------------------------
// Additional edge-case tests for transformBenchmarkRows
// ---------------------------------------------------------------------------

describe('transformBenchmarkRows — disaggregated configs', () => {
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
    // createChartDataPoint sets tp = num_prefill_gpu + num_decode_gpu when disagg is true
    const point = chartData.flat().find((p) => p.disagg === true);
    expect(point).toBeDefined();
    expect(point!.tp).toBe(4 + 12); // 16, not decode_tp=8
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
    // createChartDataPoint sets disagg to undefined when false, and omits GPU counts
    expect(point.disagg).toBeUndefined();
    expect(point.num_prefill_gpu).toBeUndefined();
    expect(point.num_decode_gpu).toBeUndefined();
  });
});

describe('transformBenchmarkRows — hardware key resolution', () => {
  it('constructs hwKey from hardware + framework', () => {
    const rows = [makeRow({ hardware: 'h200', framework: 'trt' })];
    const { chartData, hardwareConfig } = transformBenchmarkRows(rows);
    // getHardwareKey normalizes: h200 + trt => h200_trt
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

  it('handles AMD hardware with vllm framework', () => {
    const rows = [makeRow({ hardware: 'mi300x', framework: 'vllm' })];
    const { chartData, hardwareConfig } = transformBenchmarkRows(rows);
    const point = chartData.flat()[0];
    expect(point.hwKey).toBe('mi300x_vllm');
    expect(hardwareConfig).toHaveProperty('mi300x_vllm');
  });

  it('falls back to unknown config for completely unrecognized hardware', () => {
    // Suppress expected console warnings from getHardwareConfig
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const rows = [makeRow({ hardware: 'zzz999', framework: 'mystery' })];
    const { hardwareConfig } = transformBenchmarkRows(rows);
    const hwKeys = Object.keys(hardwareConfig);
    // Should still produce an entry — getHardwareConfig returns HARDWARE_CONFIG.unknown
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
    // All three rows produce the same hwKey, so hardwareConfig should have exactly 1 entry
    const hwKeys = Object.keys(hardwareConfig);
    expect(hwKeys).toHaveLength(1);
    expect(hwKeys[0]).toBe('h200_trt');

    // But all 3 data points should appear in each chart
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
          median_intvty: 25.0,
          median_e2el: 1.8,
          tput_per_gpu: 300,
          output_tput_per_gpu: 250,
          input_tput_per_gpu: 50,
        },
      }),
    ];
    const { chartData } = transformBenchmarkRows(rows);
    // Chart 0 is interactivity (x = median_intvty), Chart 1 is e2e (x = median_e2el)
    const interactivityPoint = chartData[0][0];
    const e2ePoint = chartData[1][0];
    expect(interactivityPoint.x).toBe(25.0);
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
          median_e2el: 2.0,
        },
      }),
    ];
    const { chartData } = transformBenchmarkRows(rows);
    // Both chart defs have y: "tput_per_gpu"
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
          median_e2el: 2.0,
        },
      }),
    ];
    const { chartData } = transformBenchmarkRows(rows);
    const point = chartData[0][0];
    // tpPerGpu should match tput_per_gpu from the entry
    expect(point.tpPerGpu).toBeDefined();
    expect(point.tpPerGpu.y).toBe(400);
    // tpPerMw should be computed from tput_per_gpu and power
    expect(point.tpPerMw).toBeDefined();
    expect(point.tpPerMw.y).toBeGreaterThan(0);
    // Cost fields should be computed
    expect(point.costh).toBeDefined();
    expect(point.costh.y).toBeGreaterThan(0);
    expect(point.costn).toBeDefined();
    expect(point.costn.y).toBeGreaterThan(0);
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
    // All points should have their hwKey set correctly
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
    // Suppress expected console warnings from getHardwareConfig fallback
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
