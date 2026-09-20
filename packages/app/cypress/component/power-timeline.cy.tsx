import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';

import type {
  GpuPowerDevice,
  GpuPowerSeries,
  GpuPowerSeriesResponse,
} from '@/components/gpu-power/power-series';
import PowerTimeline from '@/components/inference/ui/PowerTimeline';
import type { InferenceData } from '@/components/inference/types';
import {
  requestPowerTraceFocus,
  traceKeyForPoint,
} from '@/components/inference/utils/powerTimeline';
import { Model, Precision, Sequence } from '@/lib/data-mappings';
import { overlayRunColor } from '@/lib/overlay-run-style';

import {
  createMockHardwareConfig,
  createMockInferenceData,
  createMockUnofficialRunContext,
} from '../support/mock-data';
import { mountWithProviders } from '../support/test-utils';

// PowerTimeline joins chart points to `gpu_metrics_<RESULT_FILENAME>` artifacts
// (or to the series the API cuts out of a `power_audit_*` bundle) by the
// `power_audit.source` file name and draws one trace per config: the whole job
// faint, the validated window emphasized, TDP dashed per hardware. Bundle
// series carry worker roles, which unlock the prefill / decode pool mode.

const RUN_ID = '34716669498';
const RUN_URL = `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${RUN_ID}`;
const OVERLAY_RUN_ID = '31415926535';
const OVERLAY_RUN_URL = `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${OVERLAY_RUN_ID}`;
const START_MS = Date.UTC(2026, 8, 12, 20, 20, 0);
const hwConfig = {
  ...createMockHardwareConfig(),
  gb200: {
    name: 'gb200',
    label: 'GB200 NVL72',
    suffix: '',
    gpu: "NVIDIA 'Blackwell' GB200 NVL72",
  },
};
const HW_TYPES = new Set(['b200', 'h100', 'gb200']);

const resultName = (hardware: string, conc: number) =>
  `dsv4_8k1k_fp4_sglang_tp8-pp1-dcp1-pcp1-ep1-dpafalse_disagg-false_spec-none_conc${conc}_${hardware}-host-0123456789abcdef0123`;

// A Slurm / Dynamo disaggregated sweep: one bundle per sweep, one validation
// file per concurrency inside it, DCGM device ids as `<hostname>/<GPU-uuid>`.
const DISAGG_RESULT =
  'qwen3.5_8k1k_fp8_dynamo-sglang_prefill-tp4-pp1-dcp1-pcp1-ep1-dpfalse-nw1_decode-tp4-pp1-dcp1-pcp1-e-5b35252b29d80b104d11';
const disaggSource = (conc: number) =>
  `power_validation_${DISAGG_RESULT}_sa-bench_isl_8192_osl_1024_conc${conc}_gpus_8_ctx_4_gen_4.json`;
const HOST = 'watchtower-navy-cn01';
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

function disaggPoint(
  conc: number,
  watts: number,
  overrides: Partial<InferenceData> = {},
): InferenceData {
  return measuredPoint('gb200', conc, watts, {
    tp: 4,
    disagg: true,
    power_audit: { source: disaggSource(conc), ...WINDOW },
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

/**
 * Bundle-cut series: 4 prefill + 4 decode devices. Prefill idles at 300 W and
 * works at 900 W (+row), decode at 250 W and 700 W (+row), so the pool sums in
 * the window are 3606 W and 2822 W.
 */
function poolSeries(conc: number): GpuPowerSeries {
  const t = Array.from({ length: 61 }, (_, i) => i);
  const devices: GpuPowerDevice[] = Array.from({ length: 8 }, (_, i) => ({
    id: `${HOST}/GPU-${String(i).padStart(8, '0')}-d62f-0ff2-b4e5-e36f6fac8f1b`,
    role: i < 4 ? 'prefill' : 'decode',
  }));
  return {
    artifact: `power_audit_${DISAGG_RESULT}`,
    source: disaggSource(conc),
    startMs: START_MS,
    bucketSeconds: 1,
    gpus: devices.map((_, i) => i),
    t,
    power: devices.map((device, i) =>
      t.map((second) => {
        const prefill = device.role === 'prefill';
        return second >= 40 ? (prefill ? 900 : 700) + i : prefill ? 300 : 250;
      }),
    ),
    devices,
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

/** A single-node B200 config and a disaggregated GB200 config from the same run. */
const poolResponse: GpuPowerSeriesResponse = {
  runInfo: response.runInfo,
  series: [series('b200', 16, 700), poolSeries(8)],
};

const GB200_TDP = HW_REGISTRY.gb200?.tdp || HW_REGISTRY.b200.tdp;

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

    svg().within(() => {
      cy.get('path.power-trace[data-segment="full"]').should('have.length', 2);
      cy.get('path.power-trace[data-segment="window"]')
        .should('have.length', 2)
        .each(($path) => {
          // The window segment is the emphasized one.
          expect(Number($path.attr('stroke-width'))).to.be.greaterThan(2);
          expect(Number($path.attr('opacity'))).to.eq(1);
        });
      cy.get('path.power-trace[data-hw="b200"]').should('have.length', 4);
      // Mean mode carries no pool attributes or dashes.
      cy.get('path.power-trace[data-pool]').should('not.exist');
      cy.get('path.power-trace[stroke-dasharray]').should('not.exist');
      cy.get('.power-reference[data-reference="tdp"][data-watts="1000"]').should('exist');
      cy.get('.power-reference[data-reference="tdp"] text').should('contain.text', 'TDP 1000 W');
      cy.get('.power-reference[data-reference="utility"]').should('not.exist');
      cy.get('text.power-trace-label').should('have.length', 2);
      cy.get('text.power-trace-label').first().should('contain.text', 'c');
      cy.get('.x-axis-label, text').contains('Time (UTC)').should('exist');
    });
    cy.get('[data-testid="power-timeline-missing"]')
      .should('contain.text', '1 of 3 measured configs have no telemetry trace')
      .and('contain.text', '1 have no gpu_metrics artifact or power-audit bundle in their run')
      .and('contain.text', 'Not drawn: B200 PD · TP8 · c256');
    cy.get('[data-testid="power-timeline-source"] a')
      .should('have.attr', 'href', RUN_URL)
      .and('contain.text', `run ${RUN_ID}`);
    cy.get('[data-testid="power-timeline-empty"]').should('not.exist');
    // No trace carries worker roles, so the pools switch is not offered.
    cy.get('[data-testid="power-timeline-pools"]').should('not.exist');
    cy.get('[data-testid="power-timeline-focus"]').should('not.exist');

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
    svg().within(() => {
      cy.get('text').contains('Time since telemetry start').should('exist');
      cy.get('path.power-trace[data-segment="full"]').should('have.length', 4);
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

  it('sums prefill and decode pools against pool-sized TDP references in pool mode', () => {
    cy.intercept('GET', '/api/gpu-metrics*', { body: poolResponse }).as('series');
    mountTimeline([measuredPoint('b200', 16, 700), disaggPoint(8, 800)]);
    cy.wait('@series');

    // Mean mode treats the bundle-cut trace like any other: one line, per-GPU TDP.
    svg().within(() => {
      cy.get('path.power-trace[data-hw="gb200"][data-segment="full"]').should('have.length', 1);
      cy.get('path.power-trace[data-pool]').should('not.exist');
      cy.get(`.power-reference[data-reference="tdp"][data-watts="${GB200_TDP}"]`).should('exist');
      cy.get('.power-reference[data-pool]').should('not.exist');
    });
    cy.get('[data-testid="power-timeline-missing"]').should('not.exist');

    cy.get('[data-testid="power-timeline-pools"]').should('exist').click();
    cy.get('[data-testid="power-timeline-per-gpu"]').should('have.attr', 'data-state', 'unchecked');
    svg().within(() => {
      // One dashed line per pool, full job plus window emphasis.
      cy.get('path.power-trace[data-pool="prefill"]')
        .should('have.length', 2)
        .each(($path) => expect($path.attr('stroke-dasharray')).to.eq('7 3'));
      cy.get('path.power-trace[data-pool="decode"]')
        .should('have.length', 2)
        .each(($path) => expect($path.attr('stroke-dasharray')).to.eq('2 3'));
      // The single-node trace falls back to its whole deployment as one solid pool.
      cy.get('path.power-trace[data-hw="b200"][data-pool="all"]')
        .should('have.length', 2)
        .and('not.have.attr', 'stroke-dasharray');
      cy.get('path.power-trace[data-hw="gb200"][data-segment="window"]').should('have.length', 2);

      // References scale to the pool: 4 GPUs × rated TDP per role, 2 × for the B200 pair.
      cy.get('.power-reference[data-reference="tdp"][data-pool="prefill"]')
        .should('have.attr', 'data-watts', String(4 * GB200_TDP))
        .find('text')
        .should('contain.text', `GB200 NVL72 prefill ×4 TDP ${4 * GB200_TDP} W`);
      cy.get('.power-reference[data-reference="tdp"][data-pool="decode"]')
        .should('have.attr', 'data-watts', String(4 * GB200_TDP))
        .find('text')
        .should('contain.text', 'decode ×4 TDP');
      cy.get('.power-reference[data-reference="tdp"][data-pool="all"]')
        .should('have.attr', 'data-watts', String(2 * HW_REGISTRY.b200.tdp))
        .find('text')
        .should('contain.text', 'B200 all GPUs ×2 TDP');
      cy.get('.power-reference[data-reference="tdp"]').should('have.length', 3);

      // End labels name the pool; the axis reads pool watts.
      cy.get('text.power-trace-label[data-pool="prefill"]').should('contain.text', 'c8 · prefill');
      cy.get('text.power-trace-label[data-pool="decode"]').should('contain.text', 'c8 · decode');
      cy.get('text.power-trace-label[data-hw="b200"]').should('contain.text', 'c16 · all GPUs');
      cy.get('text').contains('GPU pool power (W)').should('exist');
    });

    // Hover a prefill hit point: the B200 pool stream comes first (61 buckets), then prefill.
    cy.get('[data-testid="power-timeline-chart-svg"] circle.point').eq(61).trigger('mouseenter');
    cy.get('[data-chart-tooltip]')
      .should('contain.text', 'GB200 NVL72 · PD · TP4 · c8')
      .and('contain.text', 'Pool: prefill · 4 GPUs')
      .and(
        'contain.text',
        `Pool power: 1,200 W (${Math.round((1200 / (4 * GB200_TDP)) * 100)}% pool TDP)`,
      )
      .and('contain.text', 'Mean per GPU: 300.0 W · min 300.0 W · max 300.0 W')
      .and('contain.text', 'Before window');

    // The all-in switch also scales to the pool.
    cy.get('[data-testid="power-timeline-utility"]').click();
    svg()
      .find('.power-reference[data-reference="utility"][data-pool="prefill"]')
      .should('have.attr', 'data-watts', String(4 * Math.round(HW_REGISTRY.gb200.power * 1000)));

    // Per-GPU and pools are mutually exclusive; per-GPU restores the per-GPU TDP line.
    cy.get('[data-testid="power-timeline-per-gpu"]').click();
    cy.get('[data-testid="power-timeline-pools"]').should('have.attr', 'data-state', 'unchecked');
    svg().within(() => {
      cy.get('path.power-trace[data-pool]').should('not.exist');
      cy.get('path.power-trace[data-hw="gb200"][data-segment="full"]').should('have.length', 8);
      cy.get(`.power-reference[data-reference="tdp"][data-watts="${GB200_TDP}"]`).should('exist');
      cy.get('text').contains('Measured Average Power per Chip over Time (W)').should('exist');
    });
  });

  it('draws an overlay-run pool trace in the run colour', () => {
    const overlayPoint = disaggPoint(8, 800, { run_url: OVERLAY_RUN_URL });
    const overlayResponse: GpuPowerSeriesResponse = {
      runInfo: { ...response.runInfo, id: Number(OVERLAY_RUN_ID), url: OVERLAY_RUN_URL },
      series: [poolSeries(8)],
    };
    cy.intercept('GET', `/api/gpu-metrics?runId=${RUN_ID}*`, { body: response }).as('official');
    cy.intercept('GET', `/api/gpu-metrics?runId=${OVERLAY_RUN_ID}*`, {
      body: overlayResponse,
    }).as('overlay');
    mountTimeline([measuredPoint('b200', 16, 700)], {
      overlay: {
        data: [overlayPoint],
        hardwareConfig: hwConfig,
        label: 'powerx-pools',
        runUrl: OVERLAY_RUN_URL,
      },
      unofficial: createMockUnofficialRunContext({
        isUnofficialRun: true,
        unofficialRunInfos: [
          {
            id: Number(OVERLAY_RUN_ID),
            name: 'powerx-pools',
            branch: 'powerx-pools',
            sha: 'abc000',
            createdAt: '2026-09-12T00:00:00Z',
            url: OVERLAY_RUN_URL,
            conclusion: 'success',
            status: 'completed',
            isNonMainBranch: true,
          },
        ],
        runIndexByUrl: { [OVERLAY_RUN_URL]: 0, [OVERLAY_RUN_ID]: 0 },
        activeOverlayHwTypes: new Set(['gb200']),
      }),
    });
    cy.wait(['@official', '@overlay']);

    cy.get('[data-testid="power-timeline-pools"]').click();
    svg().within(() => {
      cy.get('path.power-trace[data-run-index="0"][data-pool="prefill"][data-segment="window"]')
        .should('have.length', 1)
        .and('have.attr', 'stroke', overlayRunColor(0))
        .and('have.attr', 'stroke-dasharray', '7 3');
      cy.get('path.power-trace[data-run-index="0"][data-pool="decode"]').should('have.length', 2);
      cy.get('.power-reference[data-reference="tdp"][data-pool="prefill"] line').should(
        'have.attr',
        'stroke',
        overlayRunColor(0),
      );
      // The official trace keeps its hardware colour and solid all-GPU pool.
      cy.get('path.power-trace[data-hw="b200"][data-pool="all"][data-segment="window"]')
        .should('have.length', 1)
        .and('not.have.attr', 'stroke', overlayRunColor(0));
      cy.get('path.power-trace[data-hw="b200"][data-pool="all"][stroke-dasharray]').should(
        'not.exist',
      );
      cy.get('.power-reference[data-reference="tdp"][data-pool="all"] line').should(
        'not.have.attr',
        'stroke',
        overlayRunColor(0),
      );
    });
    cy.get('[data-testid="chart-legend"]').should('contain.text', '✕ powerx-pools');
  });

  it('focuses the deep-linked trace, opens pool mode for it and clears on request', () => {
    const disagg = disaggPoint(8, 800);
    requestPowerTraceFocus(traceKeyForPoint(disagg)!);
    cy.intercept('GET', '/api/gpu-metrics*', { body: poolResponse }).as('series');
    mountTimeline([measuredPoint('b200', 16, 700), disagg]);
    cy.wait('@series');

    cy.get('[data-testid="power-timeline-focus"]').should(
      'contain.text',
      'Focused on GB200 NVL72 · PD · TP4 · c8',
    );
    // A pooled trace opens in pool mode without touching the switch.
    cy.get('[data-testid="power-timeline-pools"]').should('have.attr', 'data-state', 'checked');
    svg().within(() => {
      cy.get('path.power-trace[data-pool="prefill"]').should('exist');
      cy.get('path.power-trace[data-hw="gb200"][data-segment="window"]').each(($path) =>
        expect($path.attr('opacity')).to.eq('1'),
      );
      cy.get('text.power-trace-label[data-hw="gb200"]').each(($label) =>
        expect($label.attr('opacity')).to.eq('1'),
      );
      // Every other trace dims: labels to 0.2, lines to 15 % of their weight.
      cy.get('text.power-trace-label[data-hw="b200"]').should('have.attr', 'opacity', '0.2');
      cy.get('path.power-trace[data-hw="b200"][data-segment="window"]').should(
        'have.attr',
        'opacity',
        '0.15',
      );
    });

    cy.get('[data-testid="power-timeline-focus-clear"]').should('contain.text', 'Show all').click();
    cy.get('[data-testid="power-timeline-focus"]').should('not.exist');
    svg().within(() => {
      cy.get('text.power-trace-label[data-hw="b200"]').should('have.attr', 'opacity', '1');
      cy.get('path.power-trace[data-hw="b200"][data-segment="window"]').should(
        'have.attr',
        'opacity',
        '1',
      );
      // Pool mode stays: clearing the focus only restores the other traces.
      cy.get('path.power-trace[data-pool="prefill"]').should('exist');
    });
  });

  it('translates the pool switch, pool labels and focus chip on /zh', () => {
    const disagg = disaggPoint(8, 800);
    requestPowerTraceFocus(traceKeyForPoint(disagg)!);
    cy.intercept('GET', '/api/gpu-metrics*', { body: poolResponse }).as('series');
    mountTimeline([disagg], { pathname: '/zh/inference' });
    cy.wait('@series');

    cy.get('[data-testid="chart-legend"]').should('contain.text', '预填充 / 解码 GPU 池');
    cy.get('[data-testid="power-timeline-pools"]').should('have.attr', 'data-state', 'checked');
    svg().within(() => {
      cy.get('text').contains('GPU 池功耗（W）').should('exist');
      cy.get('text.power-trace-label[data-pool="prefill"]').should('contain.text', 'c8 · 预填充');
      cy.get('text.power-trace-label[data-pool="decode"]').should('contain.text', 'c8 · 解码');
      cy.get('.power-reference[data-reference="tdp"][data-pool="decode"] text').should(
        'contain.text',
        `GB200 NVL72 解码 ×4 TDP ${4 * GB200_TDP} W`,
      );
    });
    cy.get('[data-testid="power-timeline-focus"]')
      .should('contain.text', '聚焦：GB200 NVL72 · PD · TP4 · c8')
      .find('[data-testid="power-timeline-focus-clear"]')
      .should('contain.text', '显示全部');
    cy.get('[data-testid="power-timeline-status"]').should('contain.text', 'GPU 池模式');

    cy.get('[data-testid="power-timeline-chart-svg"] circle.point').first().trigger('mouseenter');
    cy.get('[data-chart-tooltip]')
      .should('contain.text', 'GPU 池： 预填充 · 4 个 GPU')
      .and('contain.text', '池功耗： 1,200 W')
      .and('contain.text', '池 TDP');
  });
});
