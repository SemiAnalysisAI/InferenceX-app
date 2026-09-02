import { Sequence } from '@/lib/data-mappings';
import InferenceChartControls from '@/components/inference/ui/ChartControls';
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { mountWithProviders } from '../support/test-utils';

describe('Inference ChartControls', () => {
  beforeEach(() => {
    mountWithProviders(<InferenceChartControls showXAxisMode />, { inference: {} });
  });

  it('renders the model selector with the current model', () => {
    // Default mock: selectedModel = Model.DeepSeek_R1 -> "DeepSeek R1 0528"
    cy.get('#model-select').should('be.visible');
    cy.get('#model-select').should('contain.text', 'DeepSeek R1 0528');
  });

  it('renders the sequence selector with the current sequence', () => {
    // Default mock: selectedSequence = Sequence.EightK_OneK -> label "8K / 1K"
    cy.get('#scenario-select').should('be.visible');
    cy.get('#scenario-select').should('contain.text', '8K / 1K');
  });

  it('renders the precision multi-select with the current precision', () => {
    // Default mock: selectedPrecisions = [Precision.FP4] -> label "FP4"
    cy.get('[data-testid="precision-multiselect"]').should('be.visible');
    cy.get('[data-testid="precision-multiselect"]').should('contain.text', 'FP4');
  });

  it('renders the Y-axis metric selector', () => {
    cy.get('[data-testid="yaxis-metric-selector"]').should('be.visible');
    cy.get('[data-testid="cost-display-selector"]').should('not.exist');
  });

  it('Y-axis metric selector shows grouped options', () => {
    cy.get('[data-testid="yaxis-metric-selector"]').click();
    // Should contain at least the "Throughput" group
    cy.contains('Throughput').should('exist');
  });

  it('calls setSelectedYAxisMetric when a Y-axis option is chosen', () => {
    cy.get('[data-testid="yaxis-metric-selector"]').click();
    // "Throughput per GPU" is the label for y_tpPerGpu — pick a different one
    cy.contains('[role="option"]', 'Output Token Throughput per Chip').click();
    cy.get('@setSelectedYAxisMetric').should('have.been.calledOnce');
  });

  it('lists and selects the schema-v2 derived axes in the Measured Energy group', () => {
    const options = [
      {
        key: 'y_measuredJPerSuccessfulQuery',
        label: 'Measured Joules per Successful Query',
      },
      {
        key: 'y_measuredWhPerSuccessfulQuery',
        label: 'Measured Watt-hours per Successful Query',
      },
      {
        key: 'y_measuredPowerPercentTdp',
        label: 'Measured Average Power as Percent of TDP',
      },
    ];

    for (const option of options) {
      cy.get('[data-testid="yaxis-metric-selector"]').click();
      cy.contains('Measured Energy')
        .parent()
        .within(() => {
          cy.contains('[role="option"]', option.label)
            .scrollIntoView()
            .should('be.visible')
            .click();
        });
      cy.get('@setSelectedYAxisMetric').should('have.been.calledWith', option.key);
    }
  });

  it('hides the GPU comparison section when no GPUs are selected', () => {
    // Default mock: selectedGPUs = [] — GPU date range pickers should not render
    cy.contains('Comparison Date Range').should('not.exist');
    cy.contains('Intermediary Dates').should('not.exist');
  });

  it('renders the GPU config multi-select', () => {
    // The GPU Config label should be present (hideGpuComparison defaults to false)
    cy.contains('Chip Config').should('be.visible');
    cy.get('[data-testid="gpu-multiselect"]').should('be.visible');
  });

  it('uses a full-width benchmark row above chart and history controls on desktop', () => {
    cy.viewport(1280, 900);
    cy.get('fieldset').should('have.length', 3);
    cy.get('fieldset').then(($groups) => {
      const rects = [...$groups].map((group) => group.getBoundingClientRect());
      expect(rects[1].top).to.be.greaterThan(rects[0].bottom);
      expect(rects[2].top).to.be.closeTo(rects[1].top, 1);
      expect(rects[0].left).to.equal(rects[1].left);
      expect(rects[0].right).to.equal(rects[2].right);
      expect(rects[1].width, 'axes get more space than the history picker').to.be.greaterThan(
        rects[2].width,
      );
      expect(rects[0].height, 'benchmark controls fit in a single row').to.be.lessThan(130);
    });
    cy.get('#model-select').then(($model) => {
      const model = $model[0].getBoundingClientRect();
      cy.get('#scenario-select, #precision-select').each(($control) => {
        expect($control[0].getBoundingClientRect().top).to.be.closeTo(model.top, 1);
      });
    });
    cy.get('[data-testid="gpu-multiselect"]').then(($gpu) => {
      const group = $gpu[0].closest('fieldset')!.getBoundingClientRect();
      expect(
        group.right - $gpu[0].getBoundingClientRect().right,
        'chip selector fills its panel',
      ).to.be.lessThan(20);
    });
  });

  it('aligns the X and Y fields with equal desktop heights', () => {
    cy.viewport(1280, 900);
    cy.get('[data-testid="x-axis-mode-selector"]').then(($x) => {
      const x = $x[0].getBoundingClientRect();
      cy.get('[data-testid="yaxis-metric-selector"]').should(($y) => {
        const y = $y[0].getBoundingClientRect();
        expect(x.top).to.be.closeTo(y.top, 1);
        expect(x.right).to.be.lessThan(y.left);
        expect(x.height).to.equal(36);
        expect(y.height).to.equal(x.height);
      });
    });
  });

  it('selects an axis through the existing action and closes the menu', () => {
    cy.get('[data-testid="x-axis-mode-selector"]').click();
    cy.get('[data-testid="x-axis-mode-ttft"]').click();
    cy.get('@setSelectedXAxisMode').should('have.been.calledOnceWith', 'ttft');
    cy.get('[data-testid="x-axis-mode-selector"]').should('have.attr', 'aria-expanded', 'false');
  });

  it('wraps the semantic groups into a single column on narrow screens', () => {
    cy.viewport(390, 844);
    cy.get('[data-testid="inference-secondary-controls"] > button').click();
    cy.get('fieldset')
      .should('have.length', 3)
      .then(($groups) => {
        const rects = [...$groups].map((group) => group.getBoundingClientRect());
        expect(rects[1].top).to.be.greaterThan(rects[0].bottom);
        expect(rects[2].top).to.be.greaterThan(rects[1].bottom);
        expect(rects[0].width).to.be.closeTo(rects[1].width, 2);
      });
    cy.get('[data-testid="x-axis-mode-selector"]').then(($x) => {
      const x = $x[0].getBoundingClientRect();
      cy.get('[data-testid="yaxis-metric-selector"]').should(($y) => {
        const y = $y[0].getBoundingClientRect();
        expect(y.top).to.be.greaterThan(x.bottom);
        expect(x.height).to.equal(44);
        expect(y.height).to.equal(x.height);
        expect(x.width).to.be.closeTo(y.width, 1);
      });
    });
    cy.get('#scenario-select').then(($scenario) => {
      const scenario = $scenario[0].getBoundingClientRect();
      cy.get('#precision-select').should(($precision) => {
        const precision = $precision[0].getBoundingClientRect();
        expect(precision.top).to.be.closeTo(scenario.top, 1);
        expect(precision.left).to.be.greaterThan(scenario.right);
      });
    });
  });

  it('keeps benchmark and chart settings in one row when history comparison is omitted', () => {
    cy.viewport(1280, 900);
    mountWithProviders(<InferenceChartControls hideGpuComparison />, { inference: {} });
    cy.get('[data-testid="x-axis-mode-selector"]').should('not.exist');
    cy.get('fieldset')
      .should('have.length', 2)
      .then(($groups) => {
        const benchmark = $groups[0].getBoundingClientRect();
        const chart = $groups[1].getBoundingClientRect();
        expect(benchmark.top).to.equal(chart.top);
        expect(benchmark.width).to.be.greaterThan(chart.width);
        expect(benchmark.right).to.be.lessThan(chart.left);
        expect(benchmark.height, 'benchmark controls fit in a single row').to.be.lessThan(130);
      });
    cy.get('#model-select').then(($model) => {
      const model = $model[0].getBoundingClientRect();
      cy.get('#scenario-select, #precision-select, [data-testid="yaxis-metric-selector"]').each(
        ($control) => {
          expect($control[0].getBoundingClientRect().top).to.be.closeTo(model.top, 1);
        },
      );
    });
  });

  it('keeps primary controls visible while secondary controls collapse on mobile', () => {
    cy.viewport(390, 844);
    mountWithProviders(<InferenceChartControls showXAxisMode />, { inference: {} });

    cy.get('#model-select').should('be.visible');
    cy.get('[data-testid="inference-secondary-controls"] > button')
      .should('have.attr', 'aria-expanded', 'false')
      .click()
      .should('have.attr', 'aria-expanded', 'true');
    cy.get('[data-testid="yaxis-metric-selector"]').should('be.visible');

    cy.get('[data-testid="inference-secondary-controls"] > button')
      .click()
      .should('have.attr', 'aria-expanded', 'false');
    cy.get('[data-testid="yaxis-metric-selector"]').should('not.be.visible');
    cy.get('#model-select').should('contain.text', 'DeepSeek R1 0528');
  });

  it('shows secondary controls by default on desktop', () => {
    cy.viewport(1280, 900);
    mountWithProviders(<InferenceChartControls showXAxisMode />, { inference: {} });

    cy.get('[data-testid="inference-secondary-controls"] > button').should('not.be.visible');
    cy.get('[data-testid="yaxis-metric-selector"]').should('be.visible');
  });

  it('localizes the mobile secondary changed-count label', () => {
    cy.viewport(390, 844);
    mountWithProviders(
      <PathnameContext.Provider value="/zh/inference">
        <InferenceChartControls showXAxisMode />
      </PathnameContext.Provider>,
      { inference: {} },
    );
    // The count is derived from actual non-default settings, not merely present controls.
    cy.get('[data-testid="inference-secondary-controls"] > button')
      .should('contain.text', '更多图表设置')
      .and('contain.text', '项已更改');
  });
});

describe('Inference ChartControls cost metrics', () => {
  beforeEach(() => {
    mountWithProviders(<InferenceChartControls showXAxisMode />, {
      inference: { selectedYAxisMetric: 'y_costh' },
    });
  });

  it('shows cost per million and tokens per dollar as separate Y-axis options', () => {
    cy.get('[data-testid="yaxis-metric-selector"]').click();
    cy.contains('[role="option"]', 'Cost per Million Total Tokens (Owning - Hyperscaler)').should(
      'exist',
    );
    cy.contains('[role="option"]', 'Total Tokens per $1 TCO (Owning - Hyperscaler)').should(
      'exist',
    );
    cy.contains('[role="option"]', 'Output Tokens per $1 TCO (Owning - Hyperscaler)').should(
      'exist',
    );
    cy.contains('[role="option"]', 'Input Tokens per $1 TCO (Owning - Hyperscaler)').should(
      'exist',
    );
    cy.contains('[role="option"]', 'Total Tokens per ¥1 TCO (Owning - Hyperscaler)').should(
      'exist',
    );
    cy.contains('[role="option"]', 'Output Tokens per ¥1 TCO (Owning - Hyperscaler)').should(
      'exist',
    );
    cy.contains('[role="option"]', 'Input Tokens per ¥1 TCO (Owning - Hyperscaler)').should(
      'exist',
    );
    cy.get('[data-testid="cost-display-selector"]').should('not.exist');
  });

  it('selects tokens per dollar through the Y-axis metric control', () => {
    cy.get('[data-testid="yaxis-metric-selector"]').click();
    cy.contains('[role="option"]', 'Total Tokens per $1 TCO (Owning - Neocloud Giant)').click();
    cy.get('@setSelectedYAxisMetric').should('have.been.calledWith', 'y_tokensPerDollarN');
  });
});

describe('Inference ChartControls infrastructure tokens per dollar', () => {
  beforeEach(() => {
    mountWithProviders(<InferenceChartControls showXAxisMode />, {
      inference: { selectedYAxisMetric: 'y_tokensPerDollarN' },
    });
  });

  it('does not show the token sale-price source control', () => {
    cy.contains('Token Price Source').should('not.exist');
    cy.get('[data-testid="token-revenue-price-source"]').should('not.exist');
  });
});

describe('Inference ChartControls with GPUs selected', () => {
  it('shows the date range picker when GPUs are selected', () => {
    mountWithProviders(<InferenceChartControls showXAxisMode />, {
      inference: {
        selectedGPUs: ['h100'],
        selectedDateRange: { startDate: '', endDate: '' },
      },
    });

    cy.contains('Comparison Date Range').should('be.visible');
  });

  it('leaves the optional date range unflagged for a selected current config', () => {
    mountWithProviders(<InferenceChartControls showXAxisMode />, {
      inference: {
        selectedGPUs: ['h100'],
        selectedDateRange: { startDate: '', endDate: '' },
        selectedDates: [],
      },
    });

    cy.contains('button', 'Select date range')
      .should('not.have.class', 'animate-pulse')
      .and('not.have.class', 'border-red-500');
  });

  it('leaves the date range unflagged when exact comparison entries are pinned', () => {
    mountWithProviders(<InferenceChartControls showXAxisMode />, {
      inference: {
        selectedGPUs: ['b200_sglang', 'b200_vllm'],
        selectedDateRange: { startDate: '', endDate: '' },
        selectedDates: ['2026-08-07', '2026-07-09~r27489075807'],
      },
    });

    cy.contains('button', 'Select date range').should('not.have.class', 'animate-pulse');
  });
});

describe('Inference ChartControls with hideGpuComparison', () => {
  it('hides GPU config selector when hideGpuComparison is true', () => {
    mountWithProviders(<InferenceChartControls hideGpuComparison />, {
      inference: {},
    });

    cy.contains('Chip Config').should('not.exist');
    cy.get('[data-testid="gpu-multiselect"]').should('not.exist');
  });
});

describe('Inference axis selector — Chinese Agentic controls', () => {
  it('keeps every full option name and a localized FAQ link on phones', () => {
    cy.viewport(390, 844);
    mountWithProviders(
      <PathnameContext.Provider value="/zh/inference">
        <InferenceChartControls showXAxisMode />
      </PathnameContext.Provider>,
      {
        inference: { selectedSequence: Sequence.AgenticTraces, selectedXAxisMode: 'interactivity' },
      },
    );
    cy.get('[data-testid="inference-secondary-controls"] > button').click();
    cy.get('[data-testid="x-axis-mode-selector"]').should('contain.text', '交互性').click();
    cy.get('[role="listbox"] [role="option"]').should('have.length', 4);
    cy.get('[data-testid="x-axis-mode-e2e-normalized-interactivity"]')
      .should('have.text', '端到端归一化交互性')
      .type('{esc}');
    cy.get('[aria-label="X 轴指标说明"]').click();
    cy.get('[role="dialog"] [data-testid="normalized-interactivity-faq-link"]')
      .should('have.text', '什么是端到端归一化交互性？')
      .and('have.attr', 'href', '/zh/about#faq-normalized-interactivity');
  });
});
