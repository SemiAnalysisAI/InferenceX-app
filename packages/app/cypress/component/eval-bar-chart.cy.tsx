import EvalBarChartD3 from '@/components/evaluation/ui/BarChartD3';
import { mountWithProviders } from '../support/test-utils';
import { createMockEvaluationChartData } from '../support/mock-data';
import { Model, Precision } from '@/lib/data-mappings';
import { normalizeEvalHardwareKey } from '@/lib/chart-utils';
import { overlayRunColor } from '@/lib/overlay-run-style';

describe('EvalBarChartD3', () => {
  it('shows skeleton during loading with no data', () => {
    mountWithProviders(<EvalBarChartD3 />, {
      evaluation: {
        loading: true,
        isEvaluationDataSettled: false,
        chartData: [],
        error: null,
      },
      unofficial: {},
    });
    // Skeleton elements are rendered (Skeleton component uses data-slot="skeleton")
    cy.get('[data-slot="skeleton"]').should('have.length.greaterThan', 0);
  });

  it('shows an error message when the evaluation-data query fails', () => {
    mountWithProviders(<EvalBarChartD3 />, {
      evaluation: {
        error: 'Failed to fetch',
        isError: true,
        isEvaluationDataError: true,
        chartData: [],
        loading: false,
      },
      unofficial: {},
    });
    cy.contains('Failed to load eval data.').should('be.visible');
  });

  it('shows empty state when chartData is empty and selections are made', () => {
    mountWithProviders(<EvalBarChartD3 />, {
      evaluation: {
        error: null,
        chartData: [],
        loading: false,
        selectedBenchmark: 'mmlu',
        selectedModel: Model.DeepSeek_R1,
        selectedRunDate: '2025-03-01',
        availableDates: ['2025-03-01'],
        modelHasEvalData: true,
      },
      unofficial: {},
    });
    cy.contains('No evaluation data available').should('be.visible');
  });

  it('renders SVG with chart elements when data is provided', () => {
    const mockData = [
      createMockEvaluationChartData({
        configLabel: 'B200 (TRTLLM)\nTP8 FP4',
        hwKey: 'b200_trt' as any,
        score: 0.875,
        scoreError: 0.012,
        errorMin: 0.863,
        errorMax: 0.887,
      }),
      createMockEvaluationChartData({
        configId: 2,
        configLabel: 'H100\nTP8 FP8',
        hwKey: 'h100' as any,
        score: 0.845,
        scoreError: 0.015,
        errorMin: 0.83,
        errorMax: 0.86,
        precision: Precision.FP8,
        framework: 'vllm',
      }),
    ];
    mountWithProviders(
      <div style={{ width: 900, height: 700 }}>
        <EvalBarChartD3 />
      </div>,
      {
        evaluation: {
          chartData: mockData,
          unfilteredChartData: mockData,
          enabledHardware: new Set(['b200_trt', 'h100']),
          hwTypesWithData: new Set(['b200_trt', 'h100']),
          loading: false,
          error: null,
        },
        unofficial: {},
      },
    );

    // SVG should be rendered inside the chart container
    cy.get('#evaluation-chart svg').should('exist');

    // Points (circles) should render for the mean scores
    cy.get('#evaluation-chart svg circle').should('have.length.greaterThan', 0);
  });

  it('renders legend items for each configuration', () => {
    const mockData = [
      createMockEvaluationChartData({
        configLabel: 'B200 (TRTLLM)\nTP8 FP4',
        hwKey: 'b200_trt' as any,
      }),
      createMockEvaluationChartData({
        configId: 2,
        configLabel: 'H100\nTP8 FP8',
        hwKey: 'h100' as any,
        precision: Precision.FP8,
      }),
    ];
    mountWithProviders(
      <div style={{ width: 900, height: 700 }}>
        <EvalBarChartD3 />
      </div>,
      {
        evaluation: {
          chartData: mockData,
          unfilteredChartData: mockData,
          enabledHardware: new Set(['b200_trt', 'h100']),
          hwTypesWithData: new Set(['b200_trt', 'h100']),
          loading: false,
          error: null,
        },
        unofficial: {},
      },
    );

    cy.get('.sidebar-legend').should('exist');
    cy.get('.sidebar-legend li').should('have.length', 2);
  });

  it('Show Labels switch is present in the legend', () => {
    const mockData = [createMockEvaluationChartData()];
    mountWithProviders(
      <div style={{ width: 900, height: 700 }}>
        <EvalBarChartD3 />
      </div>,
      {
        evaluation: {
          chartData: mockData,
          unfilteredChartData: mockData,
          loading: false,
          error: null,
        },
        unofficial: {},
      },
    );

    cy.contains('Show Labels').should('exist');
    cy.contains('High Contrast').should('exist');
  });

  for (const includeOfficial of [false, true]) {
    it(`renders interactive unofficial markers with a portaled tooltip (${includeOfficial ? 'with' : 'without'} official rows)`, () => {
      // Evaluation-only run that originally displayed its error bar and legend
      // entry, but no marker because the tooltip is no longer an SVG sibling.
      const run = {
        id: 33769499103,
        name: 'Run Sweep - Validate vLLM P/D cache-source metrics on GB300',
        branch: 'codex/h100-minimaxm3-disagg-source',
        sha: 'b41d05864fa0f17674b36b8eb89cfaa21c58468b',
        createdAt: '2026-09-03T14:53:27Z',
        url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/33769499103',
        conclusion: '',
        status: 'in_progress',
        isNonMainBranch: true,
      };
      const score = 0.9658832448824868;
      const scoreError = 0.005000212600773283;
      const unofficialRow = createMockEvaluationChartData({
        hardware: 'gb300',
        hwKey: normalizeEvalHardwareKey('gb300', 'dynamo-vllm', 'mtp'),
        configLabel: 'GB300 NVL72 (Dynamo vLLM, MTP)\nC256 P(4/4/T/1) D(16/16/T/1)',
        model: Model.DeepSeek_V4_Pro,
        benchmark: 'gsm8k',
        framework: 'dynamo-vllm',
        score,
        scoreError,
        minScore: score,
        maxScore: score,
        errorMin: score - scoreError,
        errorMax: score + scoreError,
        date: '2026-09-03',
        runUrl: run.url,
        conc: 256,
      });
      const officialRows = includeOfficial
        ? [
            createMockEvaluationChartData({
              score: 0.95,
              scoreError: 0.01,
              errorMin: 0.94,
              errorMax: 0.96,
            }),
          ]
        : [];
      const overlayHardware = new Set([String(unofficialRow.hwKey)]);
      mountWithProviders(
        <div style={{ width: 1000 }}>
          <EvalBarChartD3 />
        </div>,
        {
          evaluation: {
            selectedModel: Model.DeepSeek_V4_Pro,
            selectedBenchmark: 'gsm8k',
            chartData: officialRows,
            unfilteredChartData: officialRows,
            unofficialChartData: [unofficialRow],
          },
          unofficial: {
            isUnofficialRun: true,
            unofficialRunInfo: run,
            unofficialRunInfos: [run],
            runIndexByUrl: { [run.url]: 0 },
            activeOverlayHwTypes: overlayHardware,
            allOverlayHwTypes: overlayHardware,
          },
        },
      );

      const marker = '#evaluation-chart .unofficial-eval-point';
      const tooltip = 'body > [data-chart-tooltip="evaluation-chart"]';
      cy.get(tooltip).should('have.length', 1);
      cy.get('#evaluation-chart [data-chart-tooltip]').should('not.exist');
      cy.get(marker).should('have.length', 1).and('be.visible');
      cy.get(`${marker} .unofficial-eval-x`).should('have.attr', 'stroke', overlayRunColor(0));
      cy.get(`${marker} .unofficial-score-label`).should('have.text', '0.966');
      cy.get('#evaluation-chart .unofficial-error-bar').should('have.length', 1);
      cy.get('#evaluation-chart .point').should('have.length', officialRows.length);

      // The group's bounds include its score label; target the visible marker.
      cy.get(`${marker} .unofficial-eval-x`).trigger('mouseenter').trigger('mousemove');
      // Hover tooltips ignore pointer events, so Cypress's fixed-position
      // hit test sees the chart underneath. Check their rendered state directly.
      cy.get(tooltip)
        .should('have.css', 'display', 'block')
        .and('have.css', 'opacity', '1')
        .and('contain.text', run.branch);
      cy.get(`${marker} .unofficial-eval-x`).trigger('mouseleave');
      cy.get(tooltip).should('not.be.visible');

      cy.get(`${marker} .unofficial-eval-x`).click();
      cy.get(tooltip)
        .should('be.visible')
        .and('have.css', 'pointer-events', 'auto')
        .and('contain.text', '0.9659')
        .and('contain.text', 'Click elsewhere to dismiss');
      cy.get(`${tooltip} a`).should('have.attr', 'href', run.url);

      cy.get(marker)
        .invoke('attr', 'transform')
        .then((initialTransform) => {
          cy.get('#evaluation-chart [data-testid="d3-chart-svg"]').then(($svg) => {
            const svg = $svg[0];
            const bounds = svg.getBoundingClientRect();
            svg.dispatchEvent(
              new WheelEvent('wheel', {
                deltaY: -240,
                clientX: bounds.x + bounds.width / 2,
                clientY: bounds.y + bounds.height / 2,
                shiftKey: true,
                bubbles: true,
                cancelable: true,
              }),
            );
          });
          cy.get(marker).invoke('attr', 'transform').should('not.equal', initialTransform);
        });
      cy.get(tooltip).should('not.be.visible');
    });
  }
});
