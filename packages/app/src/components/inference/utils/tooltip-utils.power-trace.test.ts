import { afterEach, describe, expect, it, vi } from 'vitest';

import type { HardwareConfig, InferenceData, OverlayData } from '@/components/inference/types';
import {
  generateOverlayTooltipContent,
  type OverlayTooltipConfig,
  type TooltipConfig,
} from '@/components/inference/utils/tooltipUtils';

// "View power trace" on pinned tooltips: the deep link from a measured-power
// scatter point to its per-second telemetry on the Timeline display.

const RUN_URL = 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/34716669498';
const AUDIT_NAME =
  'dsv4_8k1k_fp4_sglang_tp8-pp1-dcp1-pcp1-ep1-dpafalse_disagg-false_spec-none_conc64_b200-host-0123';
const ACTION = 'data-action="view-power-trace"';

const hardwareConfig = {
  b200: {
    name: 'b200',
    label: 'B200',
    suffix: '',
    gpu: 'B200',
    color: 'blue',
    power: 1000,
    costh: 5,
    costr: 1.25,
  },
} as unknown as HardwareConfig;

function measuredPoint(overrides: Partial<InferenceData> = {}): InferenceData {
  return {
    id: 980001,
    date: '2026-09-01',
    x: 60,
    y: 600,
    tp: 8,
    conc: 64,
    hwKey: 'b200',
    precision: 'fp4',
    benchmark_type: 'single_turn',
    run_url: RUN_URL,
    power_audit: { source: `power_validation_${AUDIT_NAME}.json` },
    tpPerGpu: { y: 400, roof: false },
    tpPerMw: { y: 50, roof: false },
    costh: { y: 1, roof: false },
    costr: { y: 1, roof: false },
    costhi: { y: 1, roof: false },
    costri: { y: 1, roof: false },
    ...overrides,
  } as InferenceData;
}

function config(overrides: Partial<TooltipConfig> = {}): TooltipConfig {
  return {
    data: measuredPoint(),
    isPinned: true,
    xLabel: 'Interactivity (tok/s/user)',
    yLabel: 'Measured Power per Chip (W)',
    selectedYAxisMetric: 'y_measuredAvgPower',
    hardwareConfig,
    ...overrides,
  };
}

function overlayConfig(overrides: Partial<OverlayTooltipConfig> = {}): OverlayTooltipConfig {
  return {
    ...config({ data: measuredPoint({ id: 0 }) }),
    overlayData: {
      label: 'powerx-timeline',
      hardwareConfig,
      data: [],
      runUrl: RUN_URL,
    } as unknown as OverlayData,
    ...overrides,
  };
}

describe('View power trace tooltip action', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders on pinned overlay tooltips whose points carry id 0', () => {
    const html = generateOverlayTooltipContent(overlayConfig());
    expect(html).toContain(`<a ${ACTION}`);
    expect(html).toContain('View power trace &rarr;');
    expect(html).not.toContain('data-action="view-logs"');
    expect(generateOverlayTooltipContent(overlayConfig({ isPinned: false }))).not.toContain(ACTION);
    expect(
      generateOverlayTooltipContent(overlayConfig({ selectedYAxisMetric: 'y_tpPerGpu' })),
    ).not.toContain(ACTION);
  });
});
