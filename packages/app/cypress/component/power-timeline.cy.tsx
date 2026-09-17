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
// by the `power_audit.source` file name and draws one trace per config: the
// whole job faint, the validated window emphasized, TDP dashed per hardware.

const RUN_ID = '34716669498';
const RUN_URL = `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${RUN_ID}`;
const OVERLAY_RUN_ID = '31415926535';
const OVERLAY_RUN_URL = `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${OVERLAY_RUN_ID}`;
const START_MS = Date.UTC(2026, 8, 12, 20, 20, 0);
const hwConfig = createMockHardwareConfig();

const resultName = (hardware: string, conc: number) =>
  `dsv4_8k1k_fp4_sglang_tp8-pp1-dcp1-pcp1-ep1-dpafalse_disagg-false_spec-none_conc${conc}_${hardware}-host-0123456789abcdef0123`;

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
      // Window covers the last 20 s of a 60 s job.
      window_start_unix: (START_MS + 40_000) / 1000,
      window_end_unix: (START_MS + 60_000) / 1000,
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
    pathname?: string;
    overlay?: Parameters<typeof PowerTimeline>[0]['overlayData'];
    unofficial?: Parameters<typeof createMockUnofficialRunContext>[0];
  } = {},
) {
  mountWithProviders(
    <PathnameContext.Provider value={options.pathname ?? '/inference'}>
      <div style={{ width: 1100, height: 700 }}>
        <PowerTimeline
          chartId="power-timeline-test"
          data={data}
          overlayData={options.overlay}
          yLabel="Measured Power per Chip over Time (W)"
        />
      </div>
    </PathnameContext.Provider>,
    {
      inference: {
        selectedModel: Model.DeepSeek_V4_Pro,
        selectedSequence: Sequence.EightK_OneK,
        selectedYAxisMetric: 'y_measuredPowerTimeline',
        hardwareConfig: hwConfig,
        activeHwTypes: new Set(['b200', 'h100']),
        hwTypesWithData: new Set(['b200', 'h100']),
      },
      unofficial: options.unofficial ?? {},
    },
  );
}

describe('PowerTimeline', () => {
  beforeEach(() => {
    cy.on('uncaught:exception', (error) => {
      if (error.message.includes('ResizeObserver loop')) return false;
    });
  });

  it('fetches one prefixed series request per run and draws the job with its window emphasized', () => {
    cy.intercept('GET', '/api/gpu-metrics*', { body: response }).as('series');
    mountTimeline([
      measuredPoint('b200', 16, 700),
      measuredPoint('b200', 64, 900),
      // Same run, no artifact uploaded (e.g. a disaggregated Dynamo row).
      measuredPoint('b200', 256, 950, {
        disagg: true,
        power_audit: { source: 'power_validation_dsv4_8k1k_fp4_dynamo-sglang_conc256.json' },
      }),
    ]);

    cy.wait('@series').then(({ request }) => {
      const url = new URL(request.url);
      expect(url.searchParams.get('runId')).to.eq(RUN_ID);
      expect(url.searchParams.get('series')).to.eq('power');
      expect(url.searchParams.get('prefix')).to.eq('dsv4_8k1k_fp4_');
    });

    cy.get('[data-testid="power-timeline-chart-svg"]').within(() => {
      cy.get('path.power-trace[data-segment="full"]').should('have.length', 2);
      cy.get('path.power-trace[data-segment="window"]')
        .should('have.length', 2)
        .each(($path) => {
          // The window segment is the emphasized one.
          expect(Number($path.attr('stroke-width'))).to.be.greaterThan(2);
          expect(Number($path.attr('opacity'))).to.eq(1);
        });
      cy.get('path.power-trace[data-hw="b200"]').should('have.length', 4);
      cy.get('.power-reference[data-reference="tdp"][data-watts="1000"]').should('exist');
      cy.get('.power-reference[data-reference="tdp"] text').should('contain.text', 'TDP 1000 W');
      cy.get('.power-reference[data-reference="utility"]').should('not.exist');
      cy.get('text.power-trace-label').should('have.length', 2);
      cy.get('text.power-trace-label').first().should('contain.text', 'c');
      cy.get('.x-axis-label, text').contains('Time (UTC)').should('exist');
    });
    cy.get('[data-testid="power-timeline-missing"]')
      .should('contain.text', '1 of 3 measured configs have no telemetry trace')
      .and('contain.text', '1 have no gpu_metrics artifact in their run')
      .and('contain.text', 'Not drawn: B200 PD · TP8 · c256');
    cy.get('[data-testid="power-timeline-source"] a')
      .should('have.attr', 'href', RUN_URL)
      .and('contain.text', `run ${RUN_ID}`);
    cy.get('[data-testid="power-timeline-empty"]').should('not.exist');

    // One line per GPU doubles the polylines; the all-in switch adds its reference.
    cy.get('[data-testid="power-timeline-per-gpu"]').click();
    cy.get('[data-testid="power-timeline-chart-svg"] path.power-trace[data-segment="full"]').should(
      'have.length',
      4,
    );
    cy.get('[data-testid="power-timeline-utility"]').click();
    cy.get(
      '[data-testid="power-timeline-chart-svg"] .power-reference[data-reference="utility"]',
    ).should('exist');

    // Elapsed axis relabels the x-axis and keeps every trace.
    cy.get('[data-testid="power-timeline-axis-elapsed"]').click();
    cy.get('[data-testid="power-timeline-chart-svg"]').within(() => {
      cy.get('text').contains('Time since telemetry start').should('exist');
      cy.get('path.power-trace[data-segment="full"]').should('have.length', 4);
    });
  });

  it('colours overlay-run traces by run and honours the overlay hardware filter', () => {
    const overlayPoint = measuredPoint('h200', 16, 500, {
      run_url: OVERLAY_RUN_URL,
      power_audit: {
        source: `power_validation_${resultName('h200', 16)}.json`,
        window_start_unix: (START_MS + 40_000) / 1000,
        window_end_unix: (START_MS + 60_000) / 1000,
      },
    });
    const overlayResponse: GpuPowerSeriesResponse = {
      runInfo: { ...response.runInfo, id: Number(OVERLAY_RUN_ID), url: OVERLAY_RUN_URL },
      series: [series('h200', 16, 500)],
    };
    cy.intercept('GET', `/api/gpu-metrics?runId=${RUN_ID}*`, { body: response }).as('official');
    cy.intercept('GET', `/api/gpu-metrics?runId=${OVERLAY_RUN_ID}*`, {
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

    cy.get('[data-testid="power-timeline-chart-svg"]').within(() => {
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

  it('reports a failed run and hides traces the legend has switched off', () => {
    cy.intercept('GET', '/api/gpu-metrics*', {
      statusCode: 500,
      body: { error: 'No gpu_metrics artifacts found for this run' },
    }).as('failed');
    mountTimeline([measuredPoint('b200', 16, 700)]);
    cy.wait('@failed');
    cy.get('[data-testid="power-timeline-status"] [role="alert"]').should(
      'contain.text',
      `Run ${RUN_ID}: No gpu_metrics artifacts found for this run`,
    );
    cy.get('[data-testid="power-timeline-chart-svg"] path.power-trace').should('not.exist');
    cy.get('[data-testid="power-timeline-empty"]').should('contain.text', 'No telemetry traces');
  });

  it('translates the toolbar, legend switches and status on /zh', () => {
    cy.intercept('GET', '/api/gpu-metrics*', { body: response }).as('series');
    mountTimeline([measuredPoint('b200', 16, 700)], { pathname: '/zh/inference' });
    cy.wait('@series');
    cy.get('[data-testid="power-timeline-toolbar"]').should('contain.text', '时间轴');
    cy.get('[data-testid="power-timeline-axis-wall"]').should('contain.text', '实际时刻');
    cy.get('[data-testid="chart-legend"]').should('contain.text', '每个 GPU 一条线');
    cy.get('[data-testid="power-timeline-status"]').should('contain.text', '遥测来源');
    cy.get('[data-testid="power-timeline-chart-svg"] text').contains('时间（UTC）').should('exist');
  });
});
