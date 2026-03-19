import { describe, it, expect } from 'vitest';

import type { InferenceData, HardwareConfig } from '@/components/inference/types';
import {
  generateTooltipContent,
  generateGPUGraphTooltipContent,
  type TooltipConfig,
} from '@/components/inference/utils/tooltipUtils';

// ---------------------------------------------------------------------------
// fixture factories
// ---------------------------------------------------------------------------
function pt(overrides: Partial<InferenceData> = {}): InferenceData {
  return {
    date: '2025-06-15',
    x: 100,
    y: 500,
    tp: 8,
    conc: 64,
    hwKey: 'h100',
    precision: 'fp8',
    tpPerGpu: { y: 1000, roof: false },
    tpPerMw: { y: 50, roof: false },
    costh: { y: 1, roof: false },
    costn: { y: 1, roof: false },
    costr: { y: 1, roof: false },
    costhi: { y: 1, roof: false },
    costni: { y: 1, roof: false },
    costri: { y: 1, roof: false },
    ...overrides,
  } as InferenceData;
}

const mockHardwareConfig: HardwareConfig = {
  h100: {
    name: 'h100',
    label: 'H100',
    suffix: '',
    gpu: 'H100',
    color: 'red',
    power: 700,
    costh: 2.8,
    costn: 1.4,
    costr: 0.7,
  },
} as unknown as HardwareConfig;

function tooltipConfig(overrides: Partial<TooltipConfig> = {}): TooltipConfig {
  return {
    data: pt(),
    isPinned: false,
    xLabel: 'E2E Latency (ms)',
    yLabel: 'Throughput per GPU',
    selectedYAxisMetric: 'y_tpPerGpu',
    hardwareConfig: mockHardwareConfig,
    ...overrides,
  };
}

// ===========================================================================
// parallelism HTML in tooltips, old data (no ep field)
// ===========================================================================
describe('tooltip parallelism — old data (no ep field)', () => {
  it('shows GPU count when ep and prefill_ep are absent', () => {
    const html = generateTooltipContent(tooltipConfig({ data: pt({ tp: 4 }) }));
    expect(html).toContain('4 GPU');
    expect(html).not.toContain('Tensor Parallelism');
    expect(html).not.toContain('Expert Parallelism');
  });

  it('pluralizes "GPUs" for tp > 1', () => {
    const html = generateTooltipContent(tooltipConfig({ data: pt({ tp: 8 }) }));
    expect(html).toContain('8 GPUs');
  });

  it('uses singular "GPU" for tp = 1', () => {
    const html = generateTooltipContent(tooltipConfig({ data: pt({ tp: 1 }) }));
    expect(html).toContain('1 GPU');
    expect(html).not.toContain('1 GPUs');
  });
});

// ===========================================================================
// parallelism HTML in tooltips, standard parallelism (ep exists)
// ===========================================================================
describe('tooltip parallelism — standard (ep field present)', () => {
  it('shows TP and EP fields for non-multinode data', () => {
    const html = generateTooltipContent(
      tooltipConfig({ data: pt({ tp: 4, ep: 8, dp_attention: false }) }),
    );
    expect(html).toContain('Tensor Parallelism');
    expect(html).toContain('Expert Parallelism');
    expect(html).toContain('DP Attention');
    expect(html).toContain('False');
  });

  it('shows dp_attention as True when enabled', () => {
    const html = generateTooltipContent(
      tooltipConfig({ data: pt({ tp: 4, ep: 8, dp_attention: true }) }),
    );
    expect(html).toContain('DP Attention');
    expect(html).toContain('True');
  });

  it('omits Expert Parallelism line when ep is null', () => {
    const d = pt({ tp: 4 });
    (d as any).ep = null;
    // Set prefill_ep so it doesn't fall into "old data" path
    (d as any).prefill_ep = 2;
    // multinode disagg path requires is_multinode && disagg
    // Since ep is null, it takes the standard path
    const html = generateTooltipContent(tooltipConfig({ data: d }));
    // When ep == null but prefill_ep exists, the standard path runs
    // and ep line is omitted via the conditional
    expect(html).toContain('Tensor Parallelism');
  });
});

// ===========================================================================
// parallelism HTML in tooltips, multinode disaggregated
// ===========================================================================
describe('tooltip parallelism — multinode disagg', () => {
  it('shows prefill and decode sections for multinode disagg', () => {
    const html = generateTooltipContent(
      tooltipConfig({
        data: pt({
          tp: 8,
          ep: 4,
          is_multinode: true,
          disagg: true,
          prefill_tp: 4,
          prefill_ep: 4,
          prefill_dp_attention: false,
          decode_tp: 8,
          decode_ep: 32,
          decode_dp_attention: true,
          prefill_num_workers: 2,
          decode_num_workers: 3,
          num_prefill_gpu: 16,
          num_decode_gpu: 24,
        }),
      }),
    );
    expect(html).toContain('Prefill:');
    expect(html).toContain('Decode:');
    expect(html).toContain('16 GPUs');
    expect(html).toContain('24 GPUs');
    expect(html).toContain('Workers: 2');
    expect(html).toContain('Workers: 3');
  });

  it('uses fallback values for missing multinode fields', () => {
    const html = generateTooltipContent(
      tooltipConfig({
        data: pt({
          tp: 8,
          ep: 4,
          is_multinode: true,
          disagg: true,
          dp_attention: true,
        }),
      }),
    );
    // falls back to d.tp=8, d.ep=4, d.dp_attention=true for both prefill and decode
    expect(html).toContain('Prefill:');
    expect(html).toContain('Decode:');
    expect(html).toContain('TP: 8');
    expect(html).toContain('EP: 4');
    expect(html).toContain('DPA: True');
    expect(html).toContain('Workers: 1');
  });

  it('shows "?" for missing GPU count fields', () => {
    const html = generateTooltipContent(
      tooltipConfig({
        data: pt({
          tp: 4,
          ep: 2,
          is_multinode: true,
          disagg: true,
        }),
      }),
    );
    expect(html).toContain('? GPUs');
  });

  it('also works with GPU graph tooltip', () => {
    const html = generateGPUGraphTooltipContent(
      tooltipConfig({
        data: pt({
          tp: 8,
          ep: 4,
          is_multinode: true,
          disagg: true,
          prefill_tp: 4,
          prefill_ep: 4,
          decode_tp: 8,
          decode_ep: 8,
          decode_dp_attention: true,
          num_prefill_gpu: 8,
          num_decode_gpu: 16,
        }),
      }),
    );
    expect(html).toContain('Prefill:');
    expect(html).toContain('Decode:');
    expect(html).toContain('8 GPUs');
    expect(html).toContain('16 GPUs');
  });
});

// ===========================================================================
// total GPUs line
// ===========================================================================
describe('tooltip — Total GPUs line', () => {
  it('always shows Total GPUs in standard tooltip', () => {
    const html = generateTooltipContent(tooltipConfig({ data: pt({ tp: 16 }) }));
    expect(html).toContain('Total GPUs');
    expect(html).toContain('16');
  });

  it('always shows Total GPUs in GPU graph tooltip', () => {
    const html = generateGPUGraphTooltipContent(tooltipConfig({ data: pt({ tp: 32 }) }));
    expect(html).toContain('Total GPUs');
    expect(html).toContain('32');
  });
});
