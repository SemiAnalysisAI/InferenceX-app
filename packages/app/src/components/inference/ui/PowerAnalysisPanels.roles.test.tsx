// @test-environment jsdom
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { describe, expect, it } from 'bun:test';

import type { AggDataEntry, InferenceData } from '@/components/inference/types';
import type { BenchmarkRow } from '@/lib/api/api';
import { modelSystemPower } from '@/lib/power/modeled-system-power';
import { $, $$, eventually, fakeLayout, isVisible, render } from '@/test/dom';
import { createMockInferenceData, withProviders } from '@/test/mock-providers';

import PowerAnalysisPanels from './PowerAnalysisPanels';

const metric = (y: number) => ({ y, roof: false });
const point = (overrides: Partial<InferenceData> = {}) =>
  createMockInferenceData({
    hwKey: 'b200_sglang',
    hw: 'B200',
    framework: 'sglang',
    precision: 'fp8',
    physicalChips: 4,
    tp: 4,
    decode_tp: 4,
    conc: 8,
    date: '2026-09-23',
    run_url: 'https://example.invalid/runs/900000001',
    benchmark_type: 'single_turn',
    mean_tpot_intvty: 20,
    output_tput_per_gpu: 50,
    measuredAvgPower: metric(400),
    measuredJPerOutputToken: metric(10),
    ...overrides,
  });
const OVERLAY_RUN_URL = 'https://example.invalid/runs/900000002';
// The Where view under a GPU role: a disaggregated chip's measured GPU layer splits into
// its prefill and decode pools, a disaggregated overlay run splits in its run colour, and
// an aggregated chip stays listed with its GPU layer whole.
const systemRow = (hardware: string, framework: string, gpuWatts: number) =>
  ({
    model: 'qwen3.5',
    hardware,
    framework,
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
    image: 'lmsysorg/sglang:v0.5.19-cu130',
    date: '2026-09-23',
    run_url: 'https://example.invalid/runs/900000001',
    metrics: {
      power_valid: 1,
      power_metric_schema_version: 2,
      avg_power_w: gpuWatts,
      avg_total_gpu_power_w: gpuWatts * 8,
      median_intvty: 100,
    },
  }) as unknown as BenchmarkRow;
const modeled = (
  hwKey: 'b200_sglang' | 'b200_vllm' | 'h200_sglang',
  id: number,
  x: number,
  watts: number,
  overrides: Partial<InferenceData> = {},
): InferenceData => {
  const framework = hwKey === 'b200_vllm' ? 'vllm' : 'sglang';
  return point({
    id,
    hwKey,
    hw: hwKey.startsWith('h200') ? 'H200' : 'B200',
    framework,
    physicalChips: 8,
    tp: 8,
    decode_tp: 8,
    conc: 2 ** (id % 4),
    x,
    benchmark_type: 'agentic_traces',
    measuredAvgPower: metric(watts),
    utilityModeledWatts: metric(1),
    modeledSystemPower: modelSystemPower(
      systemRow(hwKey.startsWith('h200') ? 'h200' : 'b200', framework, watts),
    ),
    ...overrides,
  } as Partial<InferenceData>);
};
const pools = {
  disagg: true,
  num_prefill_gpu: 4,
  num_decode_gpu: 4,
  measuredPrefillAvgPower: metric(300),
  measuredDecodeAvgPower: metric(500),
} satisfies Partial<InferenceData>;
const disaggChip = [
  modeled('b200_sglang', 40, 31.2, 420, pools),
  modeled('b200_sglang', 41, 24.8, 460, pools),
];
const aggregatedChip = [modeled('b200_vllm', 50, 30, 440), modeled('b200_vllm', 51, 26, 480)];
const overlayRun = [
  modeled('h200_sglang', 60, 28, 380, { ...pools, run_url: OVERLAY_RUN_URL }),
  modeled('h200_sglang', 61, 25, 400, { ...pools, run_url: OVERLAY_RUN_URL }),
];
const rows = '[data-testid="power-chip-compare-row"]';
const poolSegments = '[data-testid="power-chip-compare-segment"][data-pool]';
// Segments are drawn in the chart's bar layer; data-row names the row they belong to.
const segmentsOf = (row: HTMLElement, selector: string) =>
  $$(selector).filter((segment) => segment.dataset.row === row.dataset.key);

describe('PowerAnalysisPanels', () => {
  for (const [role, percentile, emphasis] of [
    ['split', 'p75', ['shown', 'shown']],
    ['decode', 'p90', ['dimmed', 'shown']],
  ] as const) {
    it(`splits the GPU layer by pool under role ${role} on the derived ${percentile.toUpperCase()} axis`, async () => {
      fakeLayout(1120);
      render(
        withProviders(
          <PathnameContext.Provider value="/infx/inference">
            <div style={{ width: '100%', maxWidth: 1120, padding: 12, boxSizing: 'border-box' }}>
              <PowerAnalysisPanels
                data={[...disaggChip, ...aggregatedChip, ...overlayRun]}
                overlayData={overlayRun}
                xField={`${percentile}_e2e_norm_intvty` as keyof AggDataEntry}
                xLabel="Interactivity (output tok/s/user)"
                chartId="power-analysis-test"
                role={role}
              />
            </div>
          </PathnameContext.Provider>,
          { inference: {}, unofficial: { runIndexByUrl: { [OVERLAY_RUN_URL]: 0 } } },
        ),
      );
      await eventually(() => expect($$(rows)).toHaveLength(3));
      const split = $$(`${rows}[data-role-split="split"]`);
      expect(split).toHaveLength(2);
      // The official disaggregated chip: prefill then decode, emphasis by role.
      const official = segmentsOf(split[0], poolSegments);
      expect(official.map((segment) => segment.dataset.pool)).toEqual(['prefill', 'decode']);
      expect(official.map((segment) => segment.dataset.poolEmphasis)).toEqual([...emphasis]);
      // The overlay run splits too, in its run colour.
      const overlay = segmentsOf(split[1], poolSegments);
      expect(overlay).toHaveLength(2);
      for (const segment of overlay)
        expect(segment.getAttribute('stroke')).toContain('--overlay-run-0');
      // The aggregated chip stays listed, its GPU layer whole.
      const whole = $$(`${rows}[data-role-split="whole"]`);
      expect(whole).toHaveLength(1);
      expect(segmentsOf(whole[0], poolSegments)).toHaveLength(0);
      expect(
        segmentsOf(whole[0], '[data-testid="power-chip-compare-segment"][data-band="gpu"]'),
      ).toHaveLength(1);
      expect($('[data-testid="power-chip-compare-unsplit"]', whole[0])?.textContent).toContain(
        'Aggregated',
      );
      expect(isVisible($('[data-testid="power-chip-compare-role-note"]'))).toBe(true);
    });
  }
});
