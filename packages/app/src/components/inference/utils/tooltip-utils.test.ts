import { describe, it, expect } from 'vitest';

import type { HardwareConfig, InferenceData } from '@/components/inference/types';
import {
  getPointLabel,
  generateTooltipContent,
  generateOverlayTooltipContent,
  generateGPUGraphTooltipContent,
  type TooltipConfig,
  type OverlayTooltipConfig,
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
  b200: {
    name: 'b200',
    label: 'B200',
    suffix: '(TRT)',
    gpu: 'B200',
    color: 'blue',
    power: 1000,
    costh: 5,
    costn: 2.5,
    costr: 1.25,
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
// getPointLabel
// ===========================================================================
describe('getPointLabel', () => {
  it('returns tp as string when no ep field', () => {
    expect(getPointLabel(pt({ tp: 8 }))).toBe('8');
  });

  it('returns "TEP8" when tp === ep and dp_attention is false', () => {
    expect(getPointLabel(pt({ tp: 8, ep: 8, dp_attention: false }))).toBe('TEP8');
  });

  it('returns "DEP8" when tp === ep and dp_attention is true', () => {
    expect(getPointLabel(pt({ tp: 8, ep: 8, dp_attention: true }))).toBe('DEP8');
  });

  it('returns "EP4" when ep > 1 and ep !== tp', () => {
    expect(getPointLabel(pt({ tp: 2, ep: 4 }))).toBe('EP4');
  });

  it('returns "DPAEP4" when ep > 1, ep !== tp, dp_attention is true', () => {
    expect(getPointLabel(pt({ tp: 2, ep: 4, dp_attention: true }))).toBe('DPAEP4');
  });

  it('returns "TP4" when ep is 1', () => {
    expect(getPointLabel(pt({ tp: 4, ep: 1 }))).toBe('TP4');
  });

  it('returns "DPATP4" when ep is 1 and dp_attention is true', () => {
    expect(getPointLabel(pt({ tp: 4, ep: 1, dp_attention: true }))).toBe('DPATP4');
  });

  it('returns multinode disagg format', () => {
    const result = getPointLabel(
      pt({
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
        decode_num_workers: 1,
      }),
    );
    expect(result).toBe('2xTEP4+1xDPAEP32');
  });

  it('uses fallback values for multinode disagg when specific fields are undefined', () => {
    const result = getPointLabel(
      pt({
        tp: 8,
        ep: 4,
        is_multinode: true,
        disagg: true,
      }),
    );
    // falls back to d.tp=8 and d.ep=4 for both prefill and decode
    // configSegmentLabel(8, 4, undefined): ep>1 && tp!==ep → "EP4"
    expect(result).toBe('1xEP4+1xEP4');
  });

  it('returns tp string when ep is explicitly undefined', () => {
    const d = pt({ tp: 4 });
    // ensure ep and prefill_ep are not set
    delete (d as any).ep;
    delete (d as any).prefill_ep;
    expect(getPointLabel(d)).toBe('4');
  });
});

// ===========================================================================
// generateTooltipContent
// ===========================================================================
describe('generateTooltipContent', () => {
  it('includes hardware display label from config', () => {
    const html = generateTooltipContent(tooltipConfig());
    expect(html).toContain('H100');
  });

  it('shows "Click elsewhere to dismiss" when isPinned is true', () => {
    const html = generateTooltipContent(tooltipConfig({ isPinned: true }));
    expect(html).toContain('Click elsewhere to dismiss');
  });

  it('does not show dismiss text when isPinned is false', () => {
    const html = generateTooltipContent(tooltipConfig({ isPinned: false }));
    expect(html).not.toContain('Click elsewhere to dismiss');
  });

  it('includes date, xLabel, and yLabel', () => {
    const html = generateTooltipContent(tooltipConfig());
    expect(html).toContain('2025-06-15');
    expect(html).toContain('E2E Latency (ms)');
    expect(html).toContain('Throughput per GPU');
  });

  it('includes image field when present', () => {
    const html = generateTooltipContent(tooltipConfig({ data: pt({ image: 'vllm-v0.6.0' }) }));
    expect(html).toContain('vllm-v0.6.0');
    expect(html).toContain('Image:');
  });

  it('omits image section when no image', () => {
    const html = generateTooltipContent(tooltipConfig());
    expect(html).not.toContain('Image:');
  });

  it('includes output throughput when metric is y_tpPerGpu and field exists', () => {
    const html = generateTooltipContent(
      tooltipConfig({
        selectedYAxisMetric: 'y_tpPerGpu',
        data: pt({ outputTputPerGpu: { y: 500, roof: false } }),
      }),
    );
    expect(html).toContain('Output Token Throughput per GPU');
  });

  it('omits output throughput when metric is not y_tpPerGpu', () => {
    const html = generateTooltipContent(
      tooltipConfig({
        selectedYAxisMetric: 'y_costh',
        data: pt({ outputTputPerGpu: { y: 500, roof: false } }),
      }),
    );
    expect(html).not.toContain('Output Token Throughput per GPU');
  });

  it('includes input throughput when metric is y_tpPerGpu and field exists', () => {
    const html = generateTooltipContent(
      tooltipConfig({
        selectedYAxisMetric: 'y_tpPerGpu',
        data: pt({ inputTputPerGpu: { y: 200, roof: false } }),
      }),
    );
    expect(html).toContain('Input Token Throughput per GPU');
  });

  it('includes precision in uppercase', () => {
    const html = generateTooltipContent(tooltipConfig({ data: pt({ precision: 'fp8' }) }));
    expect(html).toContain('FP8');
  });

  it('falls back to hwKey when hardware config entry is missing', () => {
    const html = generateTooltipContent(tooltipConfig({ data: pt({ hwKey: 'unknown_gpu' }) }));
    expect(html).toContain('unknown_gpu');
  });

  it('sets user-select to "text" when pinned', () => {
    const html = generateTooltipContent(tooltipConfig({ isPinned: true }));
    expect(html).toContain('user-select: text');
  });

  it('sets user-select to "none" when not pinned', () => {
    const html = generateTooltipContent(tooltipConfig({ isPinned: false }));
    expect(html).toContain('user-select: none');
  });

  it('shows "Track Over Time" button when pinned and not tracked', () => {
    const html = generateTooltipContent(tooltipConfig({ isPinned: true, isTracked: false }));
    expect(html).toContain('data-action="track-over-time"');
    expect(html).toContain('Track Over Time');
    expect(html).not.toContain('Untrack Over Time');
  });

  it('shows "Untrack Over Time" button when pinned and already tracked', () => {
    const html = generateTooltipContent(tooltipConfig({ isPinned: true, isTracked: true }));
    expect(html).toContain('data-action="track-over-time"');
    expect(html).toContain('Untrack Over Time');
  });

  it('does not show Track Over Time button when not pinned', () => {
    const html = generateTooltipContent(tooltipConfig({ isPinned: false }));
    expect(html).not.toContain('data-action="track-over-time"');
    expect(html).not.toContain('Track Over Time');
  });

  it('defaults isTracked to false when not provided', () => {
    const html = generateTooltipContent(tooltipConfig({ isPinned: true }));
    expect(html).toContain('Track Over Time');
    expect(html).not.toContain('Untrack Over Time');
  });
});

// ===========================================================================
// generateOverlayTooltipContent
// ===========================================================================
describe('generateOverlayTooltipContent', () => {
  function overlayConfig(overrides: Partial<OverlayTooltipConfig> = {}): OverlayTooltipConfig {
    return {
      ...tooltipConfig(),
      overlayData: {
        label: 'feature-branch',
        hardwareConfig: mockHardwareConfig,
        data: [],
        runUrl: 'https://example.com',
      } as any,
      ...overrides,
    };
  }

  it('includes red border style', () => {
    const html = generateOverlayTooltipContent(overlayConfig());
    expect(html).toContain('border: 2px solid #dc2626');
  });

  it('includes "UNOFFICIAL RUN" label', () => {
    const html = generateOverlayTooltipContent(overlayConfig());
    expect(html).toContain('UNOFFICIAL RUN');
  });

  it('includes branch label from overlayData', () => {
    const html = generateOverlayTooltipContent(overlayConfig());
    expect(html).toContain('feature-branch');
  });

  it('uses overlayData.hardwareConfig for display label', () => {
    const html = generateOverlayTooltipContent(overlayConfig({ data: pt({ hwKey: 'b200' }) }));
    expect(html).toContain('B200');
  });

  it('includes concurrency info', () => {
    const html = generateOverlayTooltipContent(overlayConfig());
    expect(html).toContain('Concurrency');
    expect(html).toContain('64');
  });
});

// ===========================================================================
// generateGPUGraphTooltipContent
// ===========================================================================
describe('generateGPUGraphTooltipContent', () => {
  it('includes "GPU Config:" label', () => {
    const html = generateGPUGraphTooltipContent(tooltipConfig());
    expect(html).toContain('GPU Config:');
  });

  it('includes date and axis values', () => {
    const html = generateGPUGraphTooltipContent(tooltipConfig());
    expect(html).toContain('2025-06-15');
    expect(html).toContain('E2E Latency (ms)');
    expect(html).toContain('Throughput per GPU');
  });

  it('shows input/output throughput when metric is y_tpPerGpu', () => {
    const html = generateGPUGraphTooltipContent(
      tooltipConfig({
        selectedYAxisMetric: 'y_tpPerGpu',
        data: pt({
          inputTputPerGpu: { y: 200, roof: false },
          outputTputPerGpu: { y: 500, roof: false },
        }),
      }),
    );
    expect(html).toContain('Input Token Throughput per GPU');
    expect(html).toContain('Output Token Throughput per GPU');
  });

  it('omits throughput fields when metric is not y_tpPerGpu', () => {
    const html = generateGPUGraphTooltipContent(
      tooltipConfig({
        selectedYAxisMetric: 'y_costh',
        data: pt({
          inputTputPerGpu: { y: 200, roof: false },
          outputTputPerGpu: { y: 500, roof: false },
        }),
      }),
    );
    expect(html).not.toContain('Input Token Throughput per GPU');
    expect(html).not.toContain('Output Token Throughput per GPU');
  });

  it('includes precision in uppercase', () => {
    const html = generateGPUGraphTooltipContent(tooltipConfig({ data: pt({ precision: 'bf16' }) }));
    expect(html).toContain('BF16');
  });
});
