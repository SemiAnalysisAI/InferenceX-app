import { afterEach, describe, expect, it, vi } from 'vitest';

import type { HardwareConfig, InferenceData, OverlayData } from '@/components/inference/types';
import {
  generateGPUGraphTooltipContent,
  generateOverlayTooltipContent,
  generateTooltipContent,
  showsPowerTraceAction,
  type OverlayTooltipConfig,
  type TooltipConfig,
} from '@/components/inference/utils/tooltipUtils';

// "View power trace" on pinned tooltips: the deep link from a measured-power
// scatter point to its per-second telemetry on the Timeline display.

const RUN_URL = 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/34716669498';
const AUDIT_NAME =
  'dsv4_8k1k_fp4_sglang_tp8-pp1-dcp1-pcp1-ep1-dpafalse_disagg-false_spec-none_conc64_b200-host-0123';
const ACTION = 'data-action="view-power-trace"';
const TELEMETRY_ACTION = 'data-action="view-power-telemetry"';

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

describe('showsPowerTraceAction', () => {
  it('needs a measured metric other than the timeline and a resolvable trace key', () => {
    const point = measuredPoint();
    expect(showsPowerTraceAction(point, 'y_measuredAvgPower')).toBe(true);
    expect(showsPowerTraceAction(point, 'y_measuredJPerOutputToken')).toBe(true);
    expect(showsPowerTraceAction(point, 'y_measuredPowerTimeline')).toBe(false);
    expect(showsPowerTraceAction(point, 'y_tpPerGpu')).toBe(false);
    expect(
      showsPowerTraceAction(measuredPoint({ power_audit: undefined }), 'y_measuredAvgPower'),
    ).toBe(false);
    expect(showsPowerTraceAction(measuredPoint({ run_url: undefined }), 'y_measuredAvgPower')).toBe(
      false,
    );
  });
});

describe('View power trace tooltip action', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders on a pinned measured-power point, after the other point actions', () => {
    const html = generateTooltipContent(config({ hasLog: true }));
    expect(html).toContain(`<a ${ACTION}`);
    expect(html).toContain('View power trace &rarr;');
    expect(html.indexOf('data-action="view-logs"')).toBeLessThan(html.indexOf(ACTION));
  });

  it('is absent while hovering (not pinned)', () => {
    expect(generateTooltipContent(config({ isPinned: false }))).not.toContain(ACTION);
  });

  it('is absent on non-measured metrics and on the timeline itself', () => {
    expect(generateTooltipContent(config({ selectedYAxisMetric: 'y_tpPerGpu' }))).not.toContain(
      ACTION,
    );
    expect(
      generateTooltipContent(config({ selectedYAxisMetric: 'y_measuredPowerTimeline' })),
    ).not.toContain(ACTION);
  });

  it('is absent when the point has no telemetry provenance', () => {
    expect(
      generateTooltipContent(config({ data: measuredPoint({ power_audit: undefined }) })),
    ).not.toContain(ACTION);
    expect(
      generateTooltipContent(config({ data: measuredPoint({ run_url: undefined }) })),
    ).not.toContain(ACTION);
  });

  it('renders alone for a point without persisted id, keeping charts/logs gated on the id', () => {
    const html = generateTooltipContent(
      config({ data: measuredPoint({ id: 0 }), hasLog: true, hasTrace: true }),
    );
    expect(html).toContain(ACTION);
    expect(html).not.toContain('data-action="view-logs"');
    expect(html).not.toContain('data-action="view-charts"');
    expect(html).toContain('display: grid; gap: 6px; margin-top: 8px;');
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

  it('uses the Chinese label on /zh tooltips', () => {
    expect(generateTooltipContent(config({ locale: 'zh' }))).toContain('查看功耗曲线 &rarr;');
    expect(generateOverlayTooltipContent(overlayConfig({ locale: 'zh' }))).toContain(
      '查看功耗曲线 &rarr;',
    );
  });

  it('falls back to "#" without a window and otherwise deep-links the current page to the timeline', () => {
    expect(generateTooltipContent(config())).toContain(`${ACTION} href="#"`);

    // The address bar is canonicalised by the share-link store: the default
    // model and the stale metric go, unrelated params stay, the override wins.
    vi.stubGlobal('window', {
      location: new URL(
        'http://localhost:3000/inference?g_model=DeepSeek-V4-Pro&i_metric=y_measuredAvgPower&utm_source=x',
      ),
    });
    const html = generateTooltipContent(config());
    const href = /data-action="view-power-trace" href="(?<href>[^"]+)"/u.exec(html)?.groups?.href;
    expect(href).toBeDefined();
    const url = new URL(href!);
    expect(url.origin).toBe('http://localhost:3000');
    expect(url.pathname).toBe('/inference');
    expect(url.searchParams.get('utm_source')).toBe('x');
    expect(url.searchParams.has('g_model')).toBe(false);
    expect(url.searchParams.get('i_metric')).toBe('y_measuredPowerTimeline');
  });

  it('never renders on the GPU graph tooltip, which has no in-place timeline', () => {
    expect(generateGPUGraphTooltipContent(config({ hasLog: true }))).not.toContain(ACTION);
  });
});

describe('View PowerX point telemetry action', () => {
  for (const [chart, generate] of [
    ['scatter', generateTooltipContent],
    ['GPU comparison', generateGPUGraphTooltipContent],
  ] as const) {
    it(`opens from a pinned ordinary ${chart} point without requiring logs or artifact provenance`, () => {
      const html = generate(
        config({
          showPowerTelemetry: true,
          data: measuredPoint({ power_audit: undefined, run_url: undefined }),
        }),
      );
      expect(html).toMatch(/<button\b[^>]*data-action="view-power-telemetry"/u);
      expect(html).not.toMatch(/<a\b[^>]*data-action="view-power-telemetry"/u);
      expect(html).toContain('PowerX');
    });

    it(`keeps ${chart} telemetry hidden until enabled and pinned`, () => {
      expect(generate(config())).not.toContain(TELEMETRY_ACTION);
      expect(generate(config({ showPowerTelemetry: false }))).not.toContain(TELEMETRY_ACTION);
      expect(generate(config({ showPowerTelemetry: true, isPinned: false }))).not.toContain(
        TELEMETRY_ACTION,
      );
    });

    it.each([undefined, 0, -1, 1.5, Number.NaN])(
      `does not offer a DB lookup for invalid ${chart} point ID %s`,
      (id) => {
        expect(
          generate(config({ showPowerTelemetry: true, data: measuredPoint({ id }) })),
        ).not.toContain(TELEMETRY_ACTION);
      },
    );
  }

  it('uses the Chinese action label', () => {
    expect(generateTooltipContent(config({ showPowerTelemetry: true, locale: 'zh' }))).toMatch(
      /查看\s*PowerX/u,
    );
  });

  it.each([0, 980001])('keeps overlay ID %s on its run-backed trace, never the DB action', (id) => {
    const html = generateOverlayTooltipContent(
      overlayConfig({ showPowerTelemetry: true, data: measuredPoint({ id }) }),
    );
    expect(html).not.toContain(TELEMETRY_ACTION);
    expect(html).toContain(ACTION);
  });
});
