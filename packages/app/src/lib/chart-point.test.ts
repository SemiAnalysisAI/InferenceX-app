import { describe, it, expect, vi } from 'vitest';

import type * as ConstantsModule from '@/lib/constants';
import { createChartDataPoint, getNestedYValue } from '@/lib/chart-point';
import { entry, pt } from '@/lib/chart-test-fixtures';

// mock constants so createChartDataPoint doesn't call the real HARDWARE_CONFIG
// during module initialisation.
vi.mock('@/lib/constants', async (importOriginal) => {
  const actual = await importOriginal<typeof ConstantsModule>();
  return {
    ...actual,
    getHardwareConfig: vi.fn(() => ({ label: 'H100', suffix: '' })),
    getGpuSpecs: vi.fn(() => ({ power: 700, costh: 2.8, costn: 1.4, costr: 0.7 })),
  };
});

// ===========================================================================
// getNestedYValue
// ===========================================================================
describe('getNestedYValue', () => {
  const point = pt(1, 5, 'h100', { tpPerGpuY: 42, costhY: 7 });

  it('returns the flat value for a plain key', () => {
    expect(getNestedYValue(point, 'y')).toBe(5);
    expect(getNestedYValue(point, 'x')).toBe(1);
  });

  it('extracts nested y-value with dot notation (tpPerGpu.y)', () => {
    expect(getNestedYValue(point, 'tpPerGpu.y')).toBe(42);
  });

  it('extracts nested y-value for costh.y', () => {
    expect(getNestedYValue(point, 'costh.y')).toBe(7);
  });

  it('returns 0 when the nested sub-key does not exist', () => {
    expect(getNestedYValue(point, 'tpPerGpu.missing' as never)).toBe(0);
  });

  it('returns 0 when the top-level key does not exist', () => {
    expect(getNestedYValue(point, 'nonExistentField' as never)).toBe(0);
  });

  it('returns 0 when the top-level key maps to a non-object for dot notation', () => {
    // 'x' is a number, not an object; x.y makes no sense
    expect(getNestedYValue(point, 'x.y' as never)).toBe(0);
  });
});

// ===========================================================================
// createChartDataPoint
// ===========================================================================
describe('createChartDataPoint', () => {
  it('sets date, x, y, and hwKey on the returned point', () => {
    const e = entry({ median_e2el: 200, tput_per_gpu: 500 });
    const point = createChartDataPoint('2025-06-15', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.date).toBe('2025-06-15');
    expect(point.x).toBe(200);
    expect(point.y).toBe(500);
    expect(point.hwKey).toBe('h100');
  });

  it('computes tp from prefill+decode GPU counts when disagg is true', () => {
    const e = entry({ disagg: true, num_prefill_gpu: 4, num_decode_gpu: 2, tp: 99 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.tp).toBe(6); // 4 + 2, not the original tp=99
  });

  it('uses original tp when disagg is false', () => {
    const e = entry({ disagg: false, tp: 8 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.tp).toBe(8);
  });

  it('sets tpPerGpu roofline metric from tput_per_gpu', () => {
    const e = entry({ tput_per_gpu: 2000 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.tpPerGpu).toEqual({ y: 2000, roof: false });
  });

  it('sets outputTputPerGpu when output_tput_per_gpu > 0', () => {
    const e = entry({ output_tput_per_gpu: 800 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.outputTputPerGpu).toEqual({ y: 800, roof: false });
  });

  it('omits outputTputPerGpu when output_tput_per_gpu is 0', () => {
    const e = entry({ output_tput_per_gpu: 0 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.outputTputPerGpu).toBeUndefined();
  });

  it('sets inputTputPerGpu when input_tput_per_gpu > 0', () => {
    const e = entry({ input_tput_per_gpu: 300 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.inputTputPerGpu).toEqual({ y: 300, roof: false });
  });

  it('computes tpPerMw from throughput and hardware power', () => {
    // tpPerMw = (tput_per_gpu * 1000) / power = (1000 * 1000) / 700
    const e = entry({ tput_per_gpu: 1000 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.tpPerMw.y).toBeCloseTo((1000 * 1000) / 700, 5);
  });

  it('computes inputTputPerMw when input_tput_per_gpu > 0', () => {
    // inputTputPerMw = (input_tput_per_gpu * 1000) / power = (300 * 1000) / 700
    const e = entry({ input_tput_per_gpu: 300 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.inputTputPerMw).toBeDefined();
    expect(point.inputTputPerMw!.y).toBeCloseTo((300 * 1000) / 700, 5);
    expect(point.inputTputPerMw!.roof).toBe(false);
  });

  it('omits inputTputPerMw when input_tput_per_gpu is 0', () => {
    const e = entry({ input_tput_per_gpu: 0 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.inputTputPerMw).toBeUndefined();
  });

  it('computes outputTputPerMw when output_tput_per_gpu > 0', () => {
    // outputTputPerMw = (output_tput_per_gpu * 1000) / power = (800 * 1000) / 700
    const e = entry({ output_tput_per_gpu: 800 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.outputTputPerMw).toBeDefined();
    expect(point.outputTputPerMw!.y).toBeCloseTo((800 * 1000) / 700, 5);
    expect(point.outputTputPerMw!.roof).toBe(false);
  });

  it('omits outputTputPerMw when output_tput_per_gpu is 0', () => {
    const e = entry({ output_tput_per_gpu: 0 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.outputTputPerMw).toBeUndefined();
  });

  it('computes cost fields (costh, costn, costr) from hardware config and throughput', () => {
    // tokensPerHour = (tput_per_gpu * 3600) / 1_000_000 = (1000 * 3600) / 1e6 = 3.6
    // costh.y = hwConfig.costh / tokensPerHour = 2.8 / 3.6
    const e = entry({ tput_per_gpu: 1000 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.costh.y).toBeCloseTo(2.8 / 3.6, 5);
    expect(point.costn.y).toBeCloseTo(1.4 / 3.6, 5);
    expect(point.costr.y).toBeCloseTo(0.7 / 3.6, 5);
  });

  it('sets cost fields to 0 when throughput is 0', () => {
    const e = entry({ tput_per_gpu: 0 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.costh.y).toBe(0);
    expect(point.costn.y).toBe(0);
    expect(point.costr.y).toBe(0);
  });

  it('computes output cost fields when output_tput_per_gpu > 0', () => {
    const e = entry({ output_tput_per_gpu: 500 });
    // outputTokensPerHour = (500 * 3600) / 1e6 = 1.8
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.costhOutput!.y).toBeCloseTo(2.8 / 1.8, 5);
    expect(point.costnOutput!.y).toBeCloseTo(1.4 / 1.8, 5);
    expect(point.costrOutput!.y).toBeCloseTo(0.7 / 1.8, 5);
  });

  it('computes input cost fields when input_tput_per_gpu > 0', () => {
    const e = entry({ input_tput_per_gpu: 200 });
    // inputTokensPerHour = (200 * 3600) / 1e6 = 0.72
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.costhi.y).toBeCloseTo(2.8 / 0.72, 5);
    expect(point.costni.y).toBeCloseTo(1.4 / 0.72, 5);
    expect(point.costri.y).toBeCloseTo(0.7 / 0.72, 5);
  });

  it('narrows dp_attention string "true" to boolean true', () => {
    const e = entry({ dp_attention: 'true' });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.dp_attention).toBe(true);
  });

  it('narrows dp_attention boolean false to false', () => {
    const e = entry({ dp_attention: false });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.dp_attention).toBe(false);
  });

  it('sets dp_attention to undefined when not present', () => {
    const e = entry();
    delete (e as any).dp_attention;
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.dp_attention).toBeUndefined();
  });

  it('sets disagg fields only when disagg is true', () => {
    const e = entry({ disagg: true, num_prefill_gpu: 4, num_decode_gpu: 2 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.disagg).toBe(true);
    expect(point.num_prefill_gpu).toBe(4);
    expect(point.num_decode_gpu).toBe(2);
  });

  it('sets disagg fields to undefined when disagg is false', () => {
    const e = entry({ disagg: false, num_prefill_gpu: 4, num_decode_gpu: 2 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.disagg).toBeUndefined();
    expect(point.num_prefill_gpu).toBeUndefined();
    expect(point.num_decode_gpu).toBeUndefined();
  });

  it('passes through image field when present', () => {
    const e = entry({ image: 'vllm-v0.6.0' });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.image).toBe('vllm-v0.6.0');
  });

  it('sets image to undefined when not in entry', () => {
    const e = entry();
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.image).toBeUndefined();
  });

  it('defaults x to 0 when xKey field is missing', () => {
    const e = entry();
    delete (e as any).nonexistent_field;
    const point = createChartDataPoint(
      '2025-01-01',
      e,
      'nonexistent_field' as any,
      'tput_per_gpu',
      'h100',
    );
    expect(point.x).toBe(0);
  });
});

// ===========================================================================
// createChartDataPoint — energy (Joules) fields
// ===========================================================================
describe('createChartDataPoint energy fields', () => {
  it('computes jTotal from hardware power and tput_per_gpu', () => {
    // jTotal = (power * 1000) / tput_per_gpu = (700 * 1000) / 2000 = 350
    // Note: mock getGpuSpecs returns power=700
    const e = entry({ tput_per_gpu: 2000 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.jTotal).toBeDefined();
    expect(point.jTotal!.y).toBeCloseTo((700 * 1000) / 2000, 5);
    expect(point.jTotal!.roof).toBe(false);
  });

  it('sets jTotal.y to 0 when tput_per_gpu is 0', () => {
    const e = entry({ tput_per_gpu: 0 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.jTotal!.y).toBe(0);
  });

  it('computes jOutput when output_tput_per_gpu > 0', () => {
    // jOutput = (power * 1000) / output_tput_per_gpu = (700 * 1000) / 400 = 1750
    const e = entry({ output_tput_per_gpu: 400 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.jOutput).toBeDefined();
    expect(point.jOutput!.y).toBeCloseTo((700 * 1000) / 400, 5);
  });

  it('omits jOutput when output_tput_per_gpu is 0', () => {
    const e = entry({ output_tput_per_gpu: 0 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.jOutput).toBeUndefined();
  });

  it('computes jInput when input_tput_per_gpu > 0', () => {
    // jInput = (power * 1000) / input_tput_per_gpu = (700 * 1000) / 150 ≈ 4666.67
    const e = entry({ input_tput_per_gpu: 150 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.jInput).toBeDefined();
    expect(point.jInput!.y).toBeCloseTo((700 * 1000) / 150, 5);
  });

  it('omits jInput when input_tput_per_gpu is 0', () => {
    const e = entry({ input_tput_per_gpu: 0 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.jInput).toBeUndefined();
  });
});

// ===========================================================================
// createChartDataPoint — measured power / energy fields (from runner telemetry)
// ===========================================================================
describe('createChartDataPoint measured power fields', () => {
  it('emits measuredAvgPower when avg_power_w is present on the entry', () => {
    const e = entry({ avg_power_w: 685.5 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.measuredAvgPower).toBeDefined();
    expect(point.measuredAvgPower!.y).toBe(685.5);
    expect(point.measuredAvgPower!.roof).toBe(false);
  });

  it('emits measuredJPerOutputToken when joules_per_output_token is present', () => {
    const e = entry({ joules_per_output_token: 8.4 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.measuredJPerOutputToken).toBeDefined();
    expect(point.measuredJPerOutputToken!.y).toBe(8.4);
  });

  it('omits both fields when neither is on the entry', () => {
    // Legacy runs predating aggregate_power.py.
    const point = createChartDataPoint(
      '2025-01-01',
      entry(),
      'median_e2el',
      'tput_per_gpu',
      'h100',
    );
    expect(point.measuredAvgPower).toBeUndefined();
    expect(point.measuredJPerOutputToken).toBeUndefined();
  });

  it('emits one and omits the other when only one is present', () => {
    // Defensive: aggregator can patch only avg_power_w if total_output_tokens=0.
    const e = entry({ avg_power_w: 500 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.measuredAvgPower).toBeDefined();
    expect(point.measuredJPerOutputToken).toBeUndefined();
  });

  it('preserves a zero measured power value (not falsy-coerced away)', () => {
    // Guards against a refactor switching the gate from typeof===number to truthiness.
    const e = entry({ avg_power_w: 0 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.measuredAvgPower).toBeDefined();
    expect(point.measuredAvgPower!.y).toBe(0);
  });

  it('emits measuredJPerTotalToken when joules_per_total_token is present', () => {
    const e = entry({ joules_per_total_token: 0.93 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.measuredJPerTotalToken).toBeDefined();
    expect(point.measuredJPerTotalToken!.y).toBe(0.93);
    expect(point.measuredJPerTotalToken!.roof).toBe(false);
  });

  it('emits J/output and J/total independently — different denominators', () => {
    // 8k1k workload: J/output ≈ 9 × J/total (input is ~8x output, so output/total ≈ 1/9).
    const e = entry({ joules_per_output_token: 2.04, joules_per_total_token: 0.23 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.measuredJPerOutputToken!.y).toBe(2.04);
    expect(point.measuredJPerTotalToken!.y).toBe(0.23);
  });

  it('omits measuredJPerTotalToken on rows that predate the field', () => {
    // Rows ingested before joules_per_total_token was added still have avg_power_w
    // and joules_per_output_token. The new field must be absent (not 0) so the
    // chart correctly drops them from the J/total view rather than plotting fake data.
    const e = entry({ avg_power_w: 458, joules_per_output_token: 2.04 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.measuredAvgPower).toBeDefined();
    expect(point.measuredJPerOutputToken).toBeDefined();
    expect(point.measuredJPerTotalToken).toBeUndefined();
  });
});

// ===========================================================================
// createChartDataPoint — per-stage measured power / energy (disagg prefill/decode)
// ===========================================================================
describe('createChartDataPoint per-stage measured power fields', () => {
  it('emits measuredPrefillAvgPower when prefill_avg_power_w is present', () => {
    const e = entry({ prefill_avg_power_w: 920.3 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.measuredPrefillAvgPower).toBeDefined();
    expect(point.measuredPrefillAvgPower!.y).toBe(920.3);
    expect(point.measuredPrefillAvgPower!.roof).toBe(false);
  });

  it('emits measuredDecodeAvgPower when decode_avg_power_w is present', () => {
    const e = entry({ decode_avg_power_w: 612.1 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.measuredDecodeAvgPower).toBeDefined();
    expect(point.measuredDecodeAvgPower!.y).toBe(612.1);
    expect(point.measuredDecodeAvgPower!.roof).toBe(false);
  });

  it('emits measuredJPerInputToken when joules_per_input_token is present', () => {
    const e = entry({ joules_per_input_token: 0.27 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.measuredJPerInputToken).toBeDefined();
    expect(point.measuredJPerInputToken!.y).toBe(0.27);
    expect(point.measuredJPerInputToken!.roof).toBe(false);
  });

  it('omits all per-stage fields on legacy rows predating per-stage attribution', () => {
    // Single-node / pre-disagg runs emit avg_power_w only, no prefill/decode split.
    const e = entry({ avg_power_w: 685.5 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.measuredPrefillAvgPower).toBeUndefined();
    expect(point.measuredDecodeAvgPower).toBeUndefined();
    expect(point.measuredJPerInputToken).toBeUndefined();
  });

  it('emits prefill and decode independently — the disagg per-stage split', () => {
    // GB300 disagg: prefill GPUs run compute-bound (higher W) than decode GPUs.
    const e = entry({ prefill_avg_power_w: 948, decode_avg_power_w: 631 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.measuredPrefillAvgPower!.y).toBe(948);
    expect(point.measuredDecodeAvgPower!.y).toBe(631);
    expect(point.measuredPrefillAvgPower!.y).toBeGreaterThan(point.measuredDecodeAvgPower!.y);
  });

  it('preserves a zero per-stage power value (not falsy-coerced away)', () => {
    // Same typeof===number gate as total power — 0 W must survive, not be dropped.
    const e = entry({ prefill_avg_power_w: 0, decode_avg_power_w: 0 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.measuredPrefillAvgPower).toBeDefined();
    expect(point.measuredPrefillAvgPower!.y).toBe(0);
    expect(point.measuredDecodeAvgPower).toBeDefined();
    expect(point.measuredDecodeAvgPower!.y).toBe(0);
  });

  it('carries total and per-stage power together on a full disagg row', () => {
    const e = entry({
      avg_power_w: 853,
      prefill_avg_power_w: 948,
      decode_avg_power_w: 631,
      joules_per_input_token: 0.18,
      joules_per_output_token: 1.64,
    });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.measuredAvgPower!.y).toBe(853);
    expect(point.measuredPrefillAvgPower!.y).toBe(948);
    expect(point.measuredDecodeAvgPower!.y).toBe(631);
    expect(point.measuredJPerInputToken!.y).toBe(0.18);
    expect(point.measuredJPerOutputToken!.y).toBe(1.64);
  });
});

// ===========================================================================
// createChartDataPoint — boolean narrowing for prefill/decode dp_attention, is_multinode
// ===========================================================================
describe('createChartDataPoint boolean narrowing', () => {
  it('narrows prefill_dp_attention string "true" to boolean true', () => {
    const e = entry({ prefill_dp_attention: 'true' });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.prefill_dp_attention).toBe(true);
  });

  it('narrows prefill_dp_attention boolean true to true', () => {
    const e = entry({ prefill_dp_attention: true });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.prefill_dp_attention).toBe(true);
  });

  it('narrows prefill_dp_attention string "false" to false', () => {
    const e = entry({ prefill_dp_attention: 'false' });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.prefill_dp_attention).toBe(false);
  });

  it('sets prefill_dp_attention to undefined when field is null/undefined', () => {
    const e = entry();
    delete (e as any).prefill_dp_attention;
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.prefill_dp_attention).toBeUndefined();
  });

  it('narrows decode_dp_attention string "true" to boolean true', () => {
    const e = entry({ decode_dp_attention: 'true' });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.decode_dp_attention).toBe(true);
  });

  it('narrows decode_dp_attention boolean false to false', () => {
    const e = entry({ decode_dp_attention: false });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.decode_dp_attention).toBe(false);
  });

  it('sets decode_dp_attention to undefined when field is absent', () => {
    const e = entry();
    delete (e as any).decode_dp_attention;
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.decode_dp_attention).toBeUndefined();
  });

  it('narrows is_multinode truthy value to true', () => {
    const e = entry({ is_multinode: true });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.is_multinode).toBe(true);
  });

  it('narrows is_multinode false to false', () => {
    const e = entry({ is_multinode: false });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.is_multinode).toBe(false);
  });

  it('sets is_multinode to undefined when field is absent', () => {
    const e = entry();
    delete (e as any).is_multinode;
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.is_multinode).toBeUndefined();
  });
});

// ===========================================================================
// createChartDataPoint — output cost fields with zero output throughput
// ===========================================================================
describe('createChartDataPoint output cost edge cases', () => {
  it('sets output cost fields to 0 when output_tput_per_gpu is 0', () => {
    const e = entry({ output_tput_per_gpu: 0 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.costhOutput!.y).toBe(0);
    expect(point.costnOutput!.y).toBe(0);
    expect(point.costrOutput!.y).toBe(0);
  });

  it('sets input cost fields to 0 when input_tput_per_gpu is 0', () => {
    const e = entry({ input_tput_per_gpu: 0 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.costhi.y).toBe(0);
    expect(point.costni.y).toBe(0);
    expect(point.costri.y).toBe(0);
  });

  it('computes all 9 cost fields correctly for a point with all throughput types', () => {
    const e = entry({
      tput_per_gpu: 1000,
      output_tput_per_gpu: 500,
      input_tput_per_gpu: 200,
    });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');

    // Total: tokensPerHour = (1000 * 3600) / 1e6 = 3.6
    expect(point.costh.y).toBeCloseTo(2.8 / 3.6, 5);
    expect(point.costn.y).toBeCloseTo(1.4 / 3.6, 5);
    expect(point.costr.y).toBeCloseTo(0.7 / 3.6, 5);

    // Output: outputTokensPerHour = (500 * 3600) / 1e6 = 1.8
    expect(point.costhOutput!.y).toBeCloseTo(2.8 / 1.8, 5);
    expect(point.costnOutput!.y).toBeCloseTo(1.4 / 1.8, 5);
    expect(point.costrOutput!.y).toBeCloseTo(0.7 / 1.8, 5);

    // Input: inputTokensPerHour = (200 * 3600) / 1e6 = 0.72
    expect(point.costhi.y).toBeCloseTo(2.8 / 0.72, 5);
    expect(point.costni.y).toBeCloseTo(1.4 / 0.72, 5);
    expect(point.costri.y).toBeCloseTo(0.7 / 0.72, 5);
  });
});
