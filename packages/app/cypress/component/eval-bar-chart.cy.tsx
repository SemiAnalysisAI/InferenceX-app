import EvalBarChartD3 from '@/components/evaluation/ui/BarChartD3';
import EvaluationTable from '@/components/evaluation/ui/EvaluationTable';
import { mountWithProviders } from '../support/test-utils';
import { createMockEvaluationChartData } from '../support/mock-data';
import { Model, Precision } from '@/lib/catalog/data-mappings';
import { normalizeEvalHardwareKey } from '@/lib/charts/chart-utils';
import { overlayRunColor } from '@/lib/charts/overlay-run-style';

describe('EvalBarChartD3', () => {
  it('omits default DP in table cells while preserving DP8 and physical chip counts', () => {
    const runUrl = 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/30864013158';
    const tpu = {
      hwKey: 'tpuv7_vllm',
      hardware: 'tpuv7',
      framework: 'vllm',
      model: Model.Qwen3_5,
      precision: Precision.FP8,
      physicalChips: 4,
      numPrefillGpu: 4,
      numDecodeGpu: 4,
    };
    const data = [
      createMockEvaluationChartData({
        ...tpu,
        configLabel: 'TPU7x tensor parallel',
        tp: 8,
        dp: 1,
        score: 0.9,
      }),
      createMockEvaluationChartData({
        ...tpu,
        evalResultId: -1,
        configId: 2,
        configLabel: 'TPU7x data parallel',
        tp: 1,
        dp: 8,
        score: 0.8,
        runUrl,
      }),
    ];
    mountWithProviders(<EvaluationTable data={data} />, {
      unofficial: { runIndexByUrl: { [runUrl]: 0 } },
    });
    cy.get('[data-testid="data-table-preset-all"]').click();
    cy.contains('thead th', /^Prefill$/)
      .invoke('index')
      .then((index) => {
        cy.get('tbody tr').eq(0).find('td').eq(index).should('have.attr', 'colspan', '2');
        cy.get('tbody tr')
          .eq(0)
          .find('td')
          .eq(index)
          .invoke('text')
          .should('match', /^TP8(?!.*DP\d)/);
        cy.get('tbody tr').eq(1).find('td').eq(index).should('contain.text', 'DP8');
      });
    cy.contains('thead th', 'Physical chips')
      .invoke('index')
      .then((index) => {
        cy.get('tbody tr').each(($row) => {
          cy.wrap($row)
            .find('td')
            .eq(index - 1)
            .should('have.text', '4');
        });
      });
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
    cy.contains('Failed to load eval data').should('be.visible');
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

  for (const includeOfficial of [false, true]) {
    it(`renders interactive unofficial markers with a portaled tooltip (${includeOfficial ? 'with' : 'without'} official rows)`, () => {
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

      cy.get(`${marker} .unofficial-eval-x`).trigger('mouseenter').trigger('mousemove');
      cy.get(tooltip)
        .should('have.css', 'display', 'block')
        .and('have.css', 'opacity', '1')
        .and('contain.text', run.branch);
      cy.get(`${marker} .unofficial-eval-x`).trigger('mouseleave');
      cy.get(tooltip).should('not.be.visible');

      cy.get(`${marker} .unofficial-eval-x`).click();
      cy.get(tooltip).should('not.be.visible');
      cy.get('[data-testid="point-details-panel"]')
        .should('be.visible')
        .and('contain.text', '0.9659')
        .and('contain.text', run.branch);
      cy.get('[data-testid="point-details-panel"] a').should('have.attr', 'href', run.url);
      cy.get('[data-testid="chart-pin-ring"]').should('exist');
      cy.get('[data-testid="point-details-close"]').click();
      cy.get('[data-testid="point-details-panel"]').should('not.exist');

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
