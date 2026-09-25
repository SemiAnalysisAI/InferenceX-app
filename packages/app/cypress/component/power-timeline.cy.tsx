import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';

import type { GpuPowerSeries, GpuPowerSeriesResponse } from '@/components/gpu-power/power-series';
import PowerTimeline from '@/components/inference/ui/PowerTimeline';
import type { InferenceData } from '@/components/inference/types';
import { Model, Precision, Sequence } from '@/lib/data-mappings';
import { overlayRunColor } from '@/lib/overlay-run-style';

import {
  createMockHardwareConfig,
  createMockInferenceData,
  createMockUnofficialRunContext,
} from '../support/mock-data';
import { mountWithProviders } from '../support/test-utils';

// PowerTimeline joins chart points to `gpu_metrics_<RESULT_FILENAME>` artifacts
// by the `power_audit.source` file name and draws one trace per config. Overlay
// runs keep their run colour and follow the overlay hardware filter.

const RUN_ID = '34716669498';
const RUN_URL = `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${RUN_ID}`;
const OVERLAY_RUN_ID = '31415926535';
const OVERLAY_RUN_URL = `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${OVERLAY_RUN_ID}`;
const START_MS = Date.UTC(2026, 8, 12, 20, 20, 0);
const hwConfig = createMockHardwareConfig();
const HW_TYPES = new Set(['b200', 'h100']);

const resultName = (hardware: string, conc: number) =>
  `dsv4_8k1k_fp4_sglang_tp8-pp1-dcp1-pcp1-ep1-dpafalse_disagg-false_spec-none_conc${conc}_${hardware}-host-0123456789abcdef0123`;
const WINDOW = {
  // Window covers the last 20 s of a 60 s job.
  window_start_unix: (START_MS + 40_000) / 1000,
  window_end_unix: (START_MS + 60_000) / 1000,
};

function measuredPoint(
  hwKey: string,
  conc: number,
  watts: number,
  overrides: Partial<InferenceData> = {},
): InferenceData {
  return createMockInferenceData({
    hwKey,
    conc,
    tp: 8,
    x: conc,
    y: watts,
    precision: Precision.FP4,
    run_url: RUN_URL,
    measuredAvgPower: { y: watts, roof: true },
    measuredPowerTimeline: { y: watts, roof: true },
    power_audit: {
      source: `power_validation_${resultName(hwKey.split('_')[0], conc)}.json`,
      ...WINDOW,
    },
    ...overrides,
  });
}

/** 61 one-second buckets: idle 200 W, ramps to `peak` inside the window. */
function series(hwKey: string, conc: number, peak: number, gpus = [0, 1]): GpuPowerSeries {
  const t = Array.from({ length: 61 }, (_, i) => i);
  return {
    artifact: `gpu_metrics_${resultName(hwKey.split('_')[0], conc)}`,
    startMs: START_MS,
    bucketSeconds: 1,
    gpus,
    t,
    power: gpus.map((gpu) => t.map((second) => (second >= 40 ? peak + gpu * 10 : 200 + gpu))),
  };
}

const response: GpuPowerSeriesResponse = {
  runInfo: {
    id: Number(RUN_ID),
    name: 'Run Sweep',
    branch: 'main',
    sha: 'abc123',
    createdAt: '2026-09-12T20:00:00Z',
    url: RUN_URL,
    conclusion: 'success',
    status: 'completed',
  },
  series: [series('b200', 16, 700), series('b200', 64, 900)],
};

function mountTimeline(
  data: InferenceData[],
  options: {
    overlay?: Parameters<typeof PowerTimeline>[0]['overlayData'];
    unofficial?: Parameters<typeof createMockUnofficialRunContext>[0];
  } = {},
) {
  mountWithProviders(
    <PathnameContext.Provider value="/inference">
      <div style={{ width: 1100, height: 700 }}>
        <PowerTimeline
          chartId="power-timeline-test"
          data={data}
          overlayData={options.overlay}
          yLabel="Measured Average Power per Chip over Time (W)"
        />
      </div>
    </PathnameContext.Provider>,
    {
      inference: {
        selectedModel: Model.DeepSeek_V4_Pro,
        selectedSequence: Sequence.EightK_OneK,
        selectedYAxisMetric: 'y_measuredPowerTimeline',
        hardwareConfig: hwConfig,
        activeHwTypes: new Set(HW_TYPES),
        hwTypesWithData: new Set(HW_TYPES),
      },
      unofficial: options.unofficial ?? {},
    },
  );
}

const svg = () => cy.get('[data-testid="power-timeline-chart-svg"]');

describe('PowerTimeline', () => {
  beforeEach(() => {
    cy.on('uncaught:exception', (error) => {
      if (error.message.includes('ResizeObserver loop')) return false;
    });
  });

  it('colours overlay-run traces by run and honours the overlay hardware filter', () => {
    const overlayPoint = measuredPoint('h200', 16, 500, {
      run_url: OVERLAY_RUN_URL,
      power_audit: {
        source: `power_validation_${resultName('h200', 16)}.json`,
        ...WINDOW,
      },
    });
    const overlayResponse: GpuPowerSeriesResponse = {
      runInfo: { ...response.runInfo, id: Number(OVERLAY_RUN_ID), url: OVERLAY_RUN_URL },
      series: [series('h200', 16, 500)],
    };
    cy.intercept('POST', `/api/gpu-metrics?runId=${RUN_ID}*`, { body: response }).as('official');
    cy.intercept('POST', `/api/gpu-metrics?runId=${OVERLAY_RUN_ID}*`, {
      body: overlayResponse,
    }).as('overlay');
    mountTimeline([measuredPoint('b200', 16, 700)], {
      overlay: {
        data: [overlayPoint],
        hardwareConfig: hwConfig,
        label: 'powerx-timeline',
        runUrl: OVERLAY_RUN_URL,
      },
      unofficial: createMockUnofficialRunContext({
        isUnofficialRun: true,
        unofficialRunInfos: [
          {
            id: Number(OVERLAY_RUN_ID),
            name: 'powerx-timeline',
            branch: 'powerx-timeline',
            sha: 'abc000',
            createdAt: '2026-09-12T00:00:00Z',
            url: OVERLAY_RUN_URL,
            conclusion: 'success',
            status: 'completed',
            isNonMainBranch: true,
          },
        ],
        runIndexByUrl: { [OVERLAY_RUN_URL]: 0, [OVERLAY_RUN_ID]: 0 },
        activeOverlayHwTypes: new Set(['h200']),
      }),
    });
    cy.wait(['@official', '@overlay']);

    svg().within(() => {
      cy.get('path.power-trace[data-run-index="0"][data-segment="window"]')
        .should('have.length', 1)
        .and('have.attr', 'stroke', overlayRunColor(0));
      cy.get('path.power-trace[data-hw="b200"][data-segment="window"]').should('have.length', 1);
      // Two runs: the axis defaults to elapsed time so traces overlap by phase.
      cy.get('text').contains('Time since telemetry start').should('exist');
      // Reference lines cover both hardware SKUs.
      cy.get('.power-reference[data-reference="tdp"]').should('have.length', 2);
    });
    cy.get('[data-testid="chart-legend"]').should('contain.text', '✕ powerx-timeline');
  });
});
