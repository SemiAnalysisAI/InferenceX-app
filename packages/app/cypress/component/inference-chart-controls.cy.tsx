import 'cypress-axe';
import WorkflowInfoDisplay from '@/components/inference/ui/WorkflowInfoDisplay';
import { Model, Sequence } from '@/lib/catalog/data-mappings';
import InferenceChartControls from '@/components/inference/ui/ChartControls';
import { TcoBasisCaption } from '@/components/inference/ui/TcoBasisCaption';
import { ResultContext } from '@/components/ui/result-context';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { mountWithProviders } from '../support/test-utils';

function CostControls({ showTcoBasis = false }: { showTcoBasis?: boolean }) {
  return (
    <>
      <InferenceChartControls showXAxisMode />
      <ResultContext
        locale="en"
        costTier="Owning at Large Hyperscaler Volume"
        tcoBasis={
          <TcoBasisCaption
            hardwareKeys={new Set(showTcoBasis ? ['tpuv7_vllm'] : ['b200_sglang'])}
            source="inference"
          />
        }
      />
    </>
  );
}

describe('Inference ChartControls', () => {
  beforeEach(() => {
    mountWithProviders(<InferenceChartControls showXAxisMode />, { inference: {}, unofficial: {} });
  });

  afterEach(() => {
    cy.window().then((win) => win.localStorage.removeItem('inferencex-feature-gate-konami-v1'));
  });

  it('offers pending Flash only while the shared feature gate is unlocked', () => {
    cy.get('[data-testid="model-selector"]').click();
    cy.contains('[role="option"]', 'GLM 5.3 Flash').should('not.exist');
    cy.get('body').type('{esc}');
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-feature-gate-konami-v1', '1');
      win.dispatchEvent(new win.Event('inferencex:feature-gate:unlocked'));
    });
    cy.get('[data-testid="model-selector"]').click();
    cy.contains('[role="option"]', 'GLM 5.3 Flash').click();
    cy.get('@setSelectedModel').should('have.been.calledWith', Model.GLM_5_3_Flash);
    cy.window().then((win) => {
      win.localStorage.removeItem('inferencex-feature-gate-konami-v1');
      win.dispatchEvent(new win.Event('inferencex:feature-gate:locked'));
    });
    cy.get('[data-testid="model-selector"]').click();
    cy.contains('[role="option"]', 'GLM 5.3 Flash').should('not.exist');
  });

  it('offers no measured power or energy metrics; they live on the PowerX tab', () => {
    cy.window().then((win) => win.localStorage.setItem('inferencex-feature-gate-konami-v1', '1'));
    mountWithProviders(<InferenceChartControls showXAxisMode />, { inference: {}, unofficial: {} });
    cy.get('[data-testid="yaxis-metric-selector"]').click('right');
    cy.contains('Throughput').should('exist');
    cy.get('[data-select-option][data-value^="y_measured"]').should('not.exist');
    cy.get('[data-select-option][data-value^="y_utilityModeled"]').should('not.exist');
    cy.get('input[aria-label="Search options"]').type('Measured');
    cy.get('[data-select-option]').should('not.exist');
    cy.get('[data-testid="measured-metric-controls"]').should('not.exist');
  });

  it('renders the Y-axis metric selector', () => {
    cy.get('[data-testid="yaxis-metric-selector"]').should('be.visible');
    cy.get('[data-testid="cost-display-selector"]').should('not.exist');
  });

  it('Y-axis metric selector shows grouped options', () => {
    cy.get('[data-testid="yaxis-metric-selector"]').click('right');
    cy.contains('Throughput').should('exist');
  });

  it('calls setSelectedYAxisMetric when a Y-axis option is chosen', () => {
    cy.get('[data-testid="yaxis-metric-selector"]').click('right');
    cy.contains('[data-slot="select-item"]', 'Output Token Throughput per Chip').click();
    cy.get('@setSelectedYAxisMetric').should('have.been.calledOnce');
  });

  it('does not render the Cost Tier selector; it lives in the chart caption', () => {
    cy.get('[data-testid="yaxis-metric-selector"]').should('be.visible');
    cy.get('[data-testid="cost-tier-selector"]').should('not.exist');
  });

  it('lists each tiered metric once in the Y-axis selector, without the tier suffix', () => {
    cy.get('[data-testid="yaxis-metric-selector"]').click('right');
    cy.get('[data-slot="select-item"]').then(($items) => {
      const labels = [...$items].map((item) => item.textContent?.trim() ?? '');
      expect(labels.filter((label) => label.startsWith('Total Tokens per $1 TCO'))).to.deep.equal([
        'Total Tokens per $1 TCO',
      ]);
      expect(
        labels.filter((label) => label.startsWith('Cost per Million Total Tokens')),
      ).to.deep.equal(['Cost per Million Total Tokens']);
      expect(labels.filter((label) => label.includes('(Custom User Values)'))).to.deep.equal([
        'Token Throughput per All in Utility MW (Custom User Values)',
      ]);
      expect(labels.some((label) => label.includes('Owning at Large Hyperscaler Volume'))).to.equal(
        false,
      );
      expect(labels.some((label) => label.includes('Rent - 3 Year Commit'))).to.equal(false);
    });
    cy.get('[data-testid="locked-tier-badge"]').should('not.exist');
  });

  it('opens tiered metrics on the hyperscaler tier from an untiered metric', () => {
    cy.get('[data-testid="yaxis-metric-selector"]').click('right');
    cy.contains('[data-slot="select-item"]', /^Cost per Million Total Tokens$/u)
      .scrollIntoView()
      .click();
    cy.get('@setSelectedYAxisMetric').should('have.been.calledOnceWith', 'y_costh');
  });

  it('hides the GPU comparison section when no GPUs are selected', () => {
    cy.contains('Comparison Date Range').should('not.exist');
    cy.contains('Intermediary Dates').should('not.exist');
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
    cy.get('[data-testid="x-axis-mode-selector"]').click('right');
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
        expect(x.width).to.be.at.most(176);
        expect(x.width).to.be.lessThan(y.width);
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
    mountWithProviders(<InferenceChartControls hideGpuComparison />, {
      inference: {},
      unofficial: {},
    });
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
    mountWithProviders(<InferenceChartControls showXAxisMode />, { inference: {}, unofficial: {} });

    cy.get('#model-select').should('be.visible');
    cy.get('#scenario-select').should('have.length', 1).and('not.be.visible');
    cy.get('#precision-select').should('have.length', 1).and('not.be.visible');
    cy.get('[data-testid="inference-secondary-controls"] > button')
      .should('have.attr', 'aria-expanded', 'false')
      .click()
      .should('have.attr', 'aria-expanded', 'true');
    cy.get('[data-testid="yaxis-metric-selector"]').should('be.visible');
    cy.get('[data-testid="inference-secondary-controls"]').within(() => {
      cy.get('#scenario-select').should('be.visible');
      cy.get('#precision-select').should('be.visible');
    });

    cy.get('[data-testid="inference-secondary-controls"] > button')
      .click()
      .should('have.attr', 'aria-expanded', 'false');
    cy.get('[data-testid="yaxis-metric-selector"]').should('not.be.visible');
    cy.get('#scenario-select').should('not.be.visible');
    cy.get('#precision-select').should('not.be.visible');
    cy.get('#model-select').should('contain.text', 'DeepSeek R1 0528');
  });

  it('shows secondary controls by default on desktop', () => {
    cy.viewport(1280, 900);
    mountWithProviders(<InferenceChartControls showXAxisMode />, { inference: {}, unofficial: {} });

    cy.get('[data-testid="inference-secondary-controls"] > button').should('not.be.visible');
    cy.get('[data-testid="yaxis-metric-selector"]').should('be.visible');
  });

  it('localizes the mobile secondary changed-count label', () => {
    cy.viewport(390, 844);
    mountWithProviders(
      <PathnameContext.Provider value="/zh/inference">
        <InferenceChartControls showXAxisMode />
      </PathnameContext.Provider>,
      { inference: {}, unofficial: {} },
    );
    cy.get('[data-testid="inference-secondary-controls"] > button')
      .should('contain.text', '更多图表设置')
      .and('contain.text', '项已更改');
  });
});

describe('Inference ChartControls cost metrics', () => {
  beforeEach(() => {
    mountWithProviders(<CostControls showTcoBasis />, {
      unofficial: {},
      inference: {
        selectedYAxisMetric: 'y_costh',
        selectedModel: Model.Qwen3_5,
        selectedSequence: Sequence.EightK_OneK,
      },
      globalFilters: { selectedModel: Model.Qwen3_5, effectiveSequence: Sequence.EightK_OneK },
    });
  });

  for (const sequence of [Sequence.EightK_OneK, Sequence.AgenticTraces]) {
    it(`switches the global TCO basis for Kimi K3 on ${sequence}`, () => {
      mountWithProviders(<CostControls showTcoBasis />, {
        unofficial: {},
        inference: {
          selectedYAxisMetric: 'y_costh',
          selectedModel: Model.Kimi_K3,
          selectedSequence: sequence,
        },
        globalFilters: { selectedModel: Model.Kimi_K3, effectiveSequence: sequence },
      });
      cy.get('[data-testid="tco-basis-internal"]').should('have.attr', 'aria-pressed', 'true');
      cy.get('[data-testid="tco-basis-external"]').click();
      cy.get('@setTcoBasis_global').should('have.been.calledOnceWithExactly', 'external');
    });
  }

  it('hides the TCO basis toggle for other models and scenarios', () => {
    mountWithProviders(<CostControls showTcoBasis />, {
      unofficial: {},
      inference: {
        selectedYAxisMetric: 'y_costh',
        selectedModel: Model.DeepSeek_V4_Pro,
        selectedSequence: Sequence.EightK_OneK,
      },
      globalFilters: {
        selectedModel: Model.DeepSeek_V4_Pro,
        effectiveSequence: Sequence.EightK_OneK,
      },
    });
    cy.get('[data-testid="yaxis-metric-selector"]').should('exist');
    cy.get('[data-testid="tco-basis-toggle"]').should('not.exist');
    mountWithProviders(<CostControls showTcoBasis />, {
      unofficial: {},
      inference: {
        selectedYAxisMetric: 'y_costh',
        selectedModel: Model.Qwen3_5,
        selectedSequence: Sequence.OneK_OneK,
      },
      globalFilters: { selectedModel: Model.Qwen3_5, effectiveSequence: Sequence.OneK_OneK },
    });
    cy.get('[data-testid="tco-basis-toggle"]').should('not.exist');
  });

  for (const selectedYAxisMetric of ['y_tpPerGpu', 'y_tpPerMw'] as const) {
    it(`hides TCO for ${selectedYAxisMetric} even with visible TPU hardware`, () => {
      mountWithProviders(<CostControls showTcoBasis />, {
        unofficial: {},
        inference: {
          selectedYAxisMetric,
          selectedModel: Model.Qwen3_5,
          selectedSequence: Sequence.EightK_OneK,
        },
        globalFilters: { selectedModel: Model.Qwen3_5, effectiveSequence: Sequence.EightK_OneK },
      });
      cy.get('[data-testid="yaxis-metric-selector"]').should('be.visible');
      cy.get('[data-testid="tco-basis-toggle"]').should('not.exist');
    });
  }

  it('hides TCO for a cost metric when no TPU hardware is visible', () => {
    mountWithProviders(<CostControls />, {
      unofficial: {},
      inference: {
        selectedYAxisMetric: 'y_costh',
        selectedModel: Model.Qwen3_5,
        selectedSequence: Sequence.EightK_OneK,
      },
      globalFilters: { selectedModel: Model.Qwen3_5, effectiveSequence: Sequence.EightK_OneK },
    });
    cy.get('[data-testid="yaxis-metric-selector"]').should('be.visible');
    cy.get('[data-testid="tco-basis-toggle"]').should('not.exist');
  });

  it('sizes the TCO basis toggle to its buttons on desktop and mobile', () => {
    for (const width of [1280, 390]) {
      cy.viewport(width, 844);
      if (width === 390) cy.get('[data-testid="inference-secondary-controls"] > button').click();
      cy.get('[data-testid="tco-basis-toggle"]').should(($toggle) => {
        const toggle = $toggle[0];
        const buttons = [...toggle.querySelectorAll('button')];
        const buttonWidth = buttons.reduce(
          (sum, button) => sum + button.getBoundingClientRect().width,
          0,
        );
        expect(toggle.getBoundingClientRect().width).to.be.lessThan(buttonWidth + 20);
      });
    }
  });

  it('shows cost per million and tokens per dollar as separate Y-axis options', () => {
    cy.get('[data-testid="yaxis-metric-selector"]').click('right');
    for (const label of [
      /^Cost per Million Total Tokens$/u,
      /^Total Tokens per \$1 TCO$/u,
      /^Output Tokens per \$1 TCO$/u,
      /^Input Tokens per \$1 TCO$/u,
    ]) {
      cy.contains('[data-slot="select-item"]', label).should('exist');
    }
    cy.get('[data-testid="cost-display-selector"]').should('not.exist');
  });

  it('selects tokens per dollar through the Y-axis metric control on the active tier', () => {
    cy.get('[data-testid="yaxis-metric-selector"]').click('right');
    cy.contains('[data-slot="select-item"]', /^Total Tokens per \$1 TCO$/u).click();
    cy.get('@setSelectedYAxisMetric').should('have.been.calledWith', 'y_tokensPerDollarH');
  });
});

describe('Inference ChartControls infrastructure tokens per dollar', () => {
  beforeEach(() => {
    mountWithProviders(<InferenceChartControls showXAxisMode />, {
      unofficial: {},
      inference: { selectedYAxisMetric: 'y_tokensPerDollarR' },
      globalFilters: {},
    });
  });

  it('keeps the rental tier when switching between tiered metrics', () => {
    cy.get('[data-testid="cost-tier-selector"]').should('not.exist');
    cy.get('[data-testid="yaxis-metric-selector"]').click('right');
    cy.contains('[data-slot="select-item"]', /^Cost per Million Output Tokens$/u)
      .scrollIntoView()
      .click();
    cy.get('@setSelectedYAxisMetric').should('have.been.calledOnceWith', 'y_costrOutput');
  });

  it('does not show the token sale-price source control', () => {
    cy.contains('Token Price Source').should('not.exist');
    cy.get('[data-testid="token-revenue-price-source"]').should('not.exist');
  });
});

describe('Inference ChartControls with GPUs selected', () => {
  it('shows the date range picker when GPUs are selected', () => {
    mountWithProviders(<InferenceChartControls showXAxisMode />, {
      unofficial: {},
      inference: {
        selectedGPUs: ['h100'],
        selectedDateRange: { startDate: '', endDate: '' },
      },
    });

    cy.contains('Comparison Date Range').should('be.visible');
  });

  it('leaves the optional date range unflagged for a selected current config', () => {
    mountWithProviders(<InferenceChartControls showXAxisMode />, {
      unofficial: {},
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
      unofficial: {},
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
      unofficial: {},
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
        unofficial: {},
        inference: { selectedSequence: Sequence.AgenticTraces, selectedXAxisMode: 'interactivity' },
      },
    );
    cy.get('[data-testid="inference-secondary-controls"] > button').click();
    cy.get('[data-testid="x-axis-mode-selector"]').should('contain.text', '交互性').click();
    cy.get('[role="grid"] [data-select-option]').should('have.length', 4);
    cy.get('[data-testid="x-axis-mode-e2e-normalized-interactivity"]').should(
      'have.text',
      '端到端归一化交互性',
    );
    cy.get('[data-testid="option-help-e2e-normalized-interactivity"]').click();
    cy.get('[role="dialog"] [data-testid="normalized-interactivity-faq-link"]')
      .should('have.text', '什么是端到端归一化交互性？')
      .and('have.attr', 'href', '/zh/about#faq-normalized-interactivity');
  });
});

describe('Axis option help', () => {
  beforeEach(() => {
    mountWithProviders(<InferenceChartControls showXAxisMode />, { inference: {}, unofficial: {} });
  });

  for (const searchable of [true, false]) {
    it(`lets Tab leave the help grid in both directions (searchable=${searchable})`, () => {
      mountWithProviders(
        <div>
          <button data-testid="before-field">Before</button>
          <SearchableSelect
            value="first"
            onValueChange={cy.stub().as('selectMetric')}
            searchable={searchable}
            triggerTestId="keyboard-field"
            placeholder="Metric"
            groups={[
              {
                label: '',
                options: [
                  { value: 'first', label: 'First metric', help: <p>First explanation</p> },
                  { value: 'second', label: 'Second metric', help: <p>Second explanation</p> },
                ],
              },
            ]}
          />
          <button data-testid="after-field">After</button>
        </div>,
        { inference: {} },
      );
      cy.get('[data-testid="keyboard-field"]')
        .should('have.attr', 'aria-label', 'Metric: First metric')
        .click('right');
      cy.focused().trigger('keydown', { key: 'Tab' });
      cy.get('[data-testid="after-field"]').should('have.focus');
      cy.get('[data-testid="keyboard-field"]').should('have.attr', 'aria-expanded', 'false');
      cy.get('[data-testid="keyboard-field"]').click('right');
      cy.focused().trigger('keydown', { key: 'Tab', shiftKey: true });
      cy.get('[data-testid="before-field"]').should('have.focus');
      cy.get('[data-testid="keyboard-field"]').should('have.attr', 'aria-expanded', 'false');
      cy.get('@selectMetric').should('not.have.been.called');
    });
  }

  for (const [trigger, value, explanation] of [
    ['#scenario-select', Sequence.EightK_OneK, 'Input Sequence Length'],
    ['#x-axis-mode-select', 'interactivity', 'Interactivity'],
    ['#y-axis-select', 'y_tpPerGpu', 'Rate of total tokens'],
  ]) {
    it(`shows selected-value help inside ${trigger} without opening its menu`, () => {
      cy.get(trigger).then(($trigger) => {
        const bounds = $trigger[0].getBoundingClientRect();
        cy.get(`[data-testid="selected-option-help-${value}"]`)
          .should(($help) => {
            const icon = $help.find('svg')[0].getBoundingClientRect();
            expect(icon.left).to.be.greaterThan(bounds.left);
            expect(icon.right).to.be.lessThan(bounds.right);
            expect(icon.top).to.be.greaterThan(bounds.top);
            expect(icon.bottom).to.be.lessThan(bounds.bottom);
            expect($help[0].closest('button[role="combobox"]')).to.equal(null);
          })
          .trigger('pointerover', { pointerType: 'mouse' });
      });
      cy.get(`[data-testid="selected-option-help-content-${value}"]`)
        .should('be.visible')
        .and('contain.text', explanation);
      cy.get(trigger).should('have.attr', 'aria-expanded', 'false');
      cy.get(trigger).click('right');
      cy.get(`[data-testid="selected-option-help-${value}"]`).should('not.exist');
      cy.get(`[data-testid="option-help-${value}"]`)
        .should('be.visible')
        .trigger('pointerover', { pointerType: 'mouse' });
      cy.get(`[data-testid="option-help-content-${value}"]`)
        .should('be.visible')
        .and('contain.text', explanation);
      cy.get(trigger).should('have.attr', 'aria-expanded', 'true');
    });

    it(`keeps selected-value help open when activating its focused button in ${trigger}`, () => {
      cy.get(`[data-testid="selected-option-help-${value}"]`).focus().click();
      cy.get(`[data-testid="selected-option-help-content-${value}"]`)
        .should('be.visible')
        .and('contain.text', explanation);
      cy.get(trigger).should('have.attr', 'aria-expanded', 'false');
      cy.get(`[data-testid="selected-option-help-${value}"]`).type('{esc}');
      cy.get(`[data-testid="selected-option-help-content-${value}"]`).should('not.exist');
    });
  }

  it('keeps hover help readable across the pointer gap without taking search focus', () => {
    cy.get('[data-testid="yaxis-metric-selector"]').click('right');
    cy.get('input[aria-label="Search options"]').type('Total Tokens per $1 TCO');
    cy.clock();
    cy.get('[data-testid="option-help-y_tokensPerDollarH"]').trigger('pointerover', {
      pointerType: 'mouse',
    });
    cy.get('[data-testid="option-help-content-y_tokensPerDollarH"]').should('be.visible');
    cy.get('input[aria-label="Search options"]').should('have.focus');
    cy.get('[data-testid="option-help-y_tokensPerDollarH"]').trigger('pointerout', {
      pointerType: 'mouse',
    });
    cy.tick(100);
    cy.get('[data-testid="option-help-content-y_tokensPerDollarH"]').trigger('pointerover', {
      pointerType: 'mouse',
    });
    cy.tick(300);
    cy.get('[data-testid="option-help-content-y_tokensPerDollarH"]')
      .should('be.visible')
      .and('contain.text', 'infrastructure spend')
      .trigger('pointerout', { pointerType: 'mouse' });
    cy.tick(300);
    cy.get('[data-testid="option-help-content-y_tokensPerDollarH"]').should('not.exist');
    cy.get('input[aria-label="Search options"]')
      .should('have.focus')
      .and('have.value', 'Total Tokens per $1 TCO');
    cy.get('@setSelectedYAxisMetric').should('not.have.been.called');
    cy.get('[data-testid="yaxis-metric-selector"]').should('have.attr', 'aria-expanded', 'true');
  });

  it('dismisses hover help with Escape and still allows clicking it to keep it open', () => {
    cy.get('[data-testid="x-axis-mode-selector"]').click('right');
    cy.get('[data-testid="option-help-e2e"]').trigger('pointerover', { pointerType: 'mouse' });
    cy.get('[data-testid="option-help-content-e2e"]').should('be.visible');
    cy.focused().type('{esc}');
    cy.get('[data-testid="option-help-content-e2e"]').should('not.exist');
    cy.get('[data-testid="x-axis-mode-selector"]').should('have.attr', 'aria-expanded', 'true');
    cy.clock();
    cy.get('[data-testid="option-help-e2e"]')
      .trigger('pointerout', { pointerType: 'mouse' })
      .trigger('pointerover', { pointerType: 'mouse' })
      .click()
      .trigger('pointerout', { pointerType: 'mouse' });
    cy.tick(300);
    cy.clock().then((clock) => clock.restore());
    cy.get('[data-testid="option-help-content-e2e"]').should('be.visible').type('{esc}');
    cy.get('[data-testid="option-help-e2e"]').should('have.focus');
    cy.get('@setSelectedXAxisMode').should('not.have.been.called');
  });

  for (const width of [390, 1280]) {
    it(`aligns help with the first line of wrapped options at ${width}px`, () => {
      cy.viewport(width, 844);
      mountWithProviders(
        <div className="w-64">
          <SearchableSelect
            value="long"
            onValueChange={cy.stub()}
            triggerTestId="wrapped-field"
            placeholder="Metric"
            groups={[
              {
                label: '',
                options: [
                  {
                    value: 'long',
                    label: 'Output Token Throughput per Chip with a long wrapped description',
                    help: <p>Explanation</p>,
                  },
                ],
              },
            ]}
          />
        </div>,
        { inference: {} },
      );
      cy.get('[data-testid="wrapped-field"]').click('right');
      cy.get('[data-select-option] > span').then(($label) => {
        const label = $label[0];
        const rect = label.getBoundingClientRect();
        const lineHeight = parseFloat(getComputedStyle(label).lineHeight);
        expect(rect.height).to.be.greaterThan(lineHeight);
        cy.get('[data-testid="option-help-long"] svg').should(($icon) => {
          const icon = $icon[0].getBoundingClientRect();
          expect(icon.top + icon.height / 2).to.be.closeTo(rect.top + lineHeight / 2, 1);
        });
      });
    });
  }

  it('opens descriptions and formulas without selecting an option or losing the search', () => {
    cy.get('[data-testid="yaxis-metric-selector"]').click('right');
    cy.get('input[aria-label="Search options"]').type('Total Tokens per $1 TCO');
    cy.get('[data-testid="option-help-y_tokensPerDollarH"]').click();
    cy.get('[data-testid="option-help-content-y_tokensPerDollarH"]')
      .should('be.visible')
      .and('contain.text', 'infrastructure spend')
      .find('code')
      .should('have.text', 'tok/$ = (total tok/s/chip × 3,600) ÷ all-in cost per chip-hour ($)');
    cy.get('@setSelectedYAxisMetric').should('not.have.been.called');
    cy.get('[data-testid="yaxis-metric-selector"]').should('have.attr', 'aria-expanded', 'true');
    cy.get('[data-testid="option-help-content-y_tokensPerDollarH"]').type('{esc}');
    cy.get('[data-testid="option-help-y_tokensPerDollarH"]').should('have.focus');
    cy.get('input[aria-label="Search options"]').should('have.value', 'Total Tokens per $1 TCO');
    cy.get('[data-select-option][data-value="y_tokensPerDollarH"]').click();
    cy.get('@setSelectedYAxisMetric').should('have.been.calledOnceWith', 'y_tokensPerDollarH');
    cy.get('[data-testid="yaxis-metric-selector"]').should('have.attr', 'aria-expanded', 'false');
  });

  it('navigates to help with arrow keys and restores focus on Escape', () => {
    cy.get('[data-testid="x-axis-mode-selector"]').click('right');
    cy.get('[data-testid="x-axis-mode-interactivity"]')
      .should('have.focus')
      .type('{downarrow}{rightarrow}');
    cy.get('[data-testid="option-help-e2e"]').should('have.focus').click();
    cy.get('[data-testid="option-help-content-e2e"]')
      .should('contain.text', 'total wall-clock time')
      .type('{esc}');
    cy.get('[data-testid="option-help-e2e"]').should('have.focus').type('{leftarrow}');
    cy.get('[data-testid="x-axis-mode-e2e"]').should('have.focus').type('{esc}');
    cy.get('[data-testid="x-axis-mode-selector"]')
      .should('have.focus')
      .and('have.attr', 'aria-expanded', 'false');
    cy.get('@setSelectedXAxisMode').should('not.have.been.called');
  });

  it('keeps long help readable on phones without horizontal overflow', () => {
    cy.viewport(390, 844);
    cy.get('[data-testid="inference-secondary-controls"] > button').click();
    cy.get('[data-testid="yaxis-metric-selector"]').click('right');
    cy.get('[data-testid="option-help-y_tokenRevenuePerGpuHour"]').scrollIntoView().click();
    cy.get('[data-testid="option-help-content-y_tokenRevenuePerGpuHour"]')
      .should('be.visible')
      .and(($help) => {
        const element = $help[0];
        const rect = element.getBoundingClientRect();
        expect(rect.left).to.be.at.least(0);
        expect(rect.right).to.be.at.most(390);
        expect(rect.top).to.be.at.least(0);
        expect(rect.bottom).to.be.at.most(844);
        expect(element.scrollWidth).to.equal(element.clientWidth);
      });
    cy.get('@setSelectedYAxisMetric').should('not.have.been.called');
  });

  it('exposes separate accessible selection and help actions', () => {
    cy.get('[data-testid="yaxis-metric-selector"]').click('right');
    cy.get('[data-testid="option-help-y_tokensPerDollarH"]').click();
    cy.injectAxe();
    cy.checkA11y(
      '[data-slot="select-content"], [data-testid="option-help-content-y_tokensPerDollarH"]',
      {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
      },
    );
  });
});

describe('Workflow run dropdown', () => {
  const availableRuns = {
    '12345678': {
      runId: '12345678',
      runDate: '2025-03-01',
      runUrl: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/12345678',
      conclusion: 'success',
    },
    '12345679': {
      runId: '12345679',
      runDate: '2025-03-01',
      runUrl: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/12345679',
      conclusion: 'failure',
    },
  };

  for (const locale of ['en', 'zh'] as const) {
    it(`folds run context into mobile controls without duplicating desktop controls (${locale})`, () => {
      cy.viewport(375, 812);
      mountWithProviders(
        <PathnameContext.Provider value={locale === 'zh' ? '/zh/inference' : '/inference'}>
          <InferenceChartControls showXAxisMode runContext={<WorkflowInfoDisplay />} />
        </PathnameContext.Provider>,
        { inference: { availableRuns }, globalFilters: {}, unofficial: {} },
      );

      cy.get('[data-testid="inference-run-context"]')
        .should('have.length', 1)
        .and('not.be.visible');
      cy.get('[data-testid="inference-secondary-controls"] > button')
        .should('contain.text', locale === 'zh' ? '更多图表设置' : 'More chart controls')
        .click();
      cy.get('[data-testid="inference-secondary-controls"]')
        .find('[data-testid="inference-run-context"]')
        .should('be.visible');
      cy.get('#run-select').click('left');
      cy.contains(
        '[role="option"]',
        locale === 'zh' ? '第 2 次运行（共 2 次）' : 'Run 2/2',
      ).click();
      cy.get('@setSelectedRunId').should('have.been.calledOnceWith', '12345679');
      cy.get('[data-testid="inference-secondary-controls"] > button').click();
      cy.get('[data-testid="inference-run-context"]').should('not.be.visible');

      cy.viewport(1280, 900);
      cy.get('[data-testid="inference-secondary-controls"] > button').should('not.be.visible');
      cy.get('[data-testid="inference-run-context"]')
        .should('have.length', 1)
        .and('be.visible')
        .then(($run) => {
          cy.get('[data-testid="inference-chart-configuration"]').then(($chart) => {
            expect($run[0].getBoundingClientRect().top).to.be.gte(
              $chart[0].getBoundingClientRect().bottom,
            );
          });
        });
      cy.get('#run-select').should('have.length', 1);
      cy.get('#scenario-select').should('have.length', 1).and('be.visible');
      cy.get('#precision-select').should('have.length', 1).and('be.visible');
      cy.get('[data-testid="inference-secondary-controls"] #scenario-select').should('not.exist');
      cy.get('[data-testid="inference-secondary-controls"] #precision-select').should('not.exist');
      cy.viewport(375, 812);
      cy.get('[data-testid="inference-run-context"]').should('not.be.visible');
      cy.get('#scenario-select').should('have.length', 1).and('not.be.visible');
      cy.get('#precision-select').should('have.length', 1).and('not.be.visible');
    });
  }

  it('steps between runs and keeps date navigation, status, run selection, and external links', () => {
    mountWithProviders(<WorkflowInfoDisplay />, {
      inference: { availableRuns },
      globalFilters: {},
    });
    cy.get('[aria-label="Previous run"]').should('be.disabled');
    cy.get('[aria-label="Previous available date"]').should('be.visible');
    cy.get('[aria-label="Next available date"]').should('be.visible');
    cy.get('#run-select').should('contain.text', 'Run 1/2');
    cy.get('#run-select [aria-label="Run succeeded"]').should('exist');
    cy.window().then((win) => cy.stub(win, 'open').as('openRun'));
    cy.get('#run-select [data-external-link] svg').click();
    cy.get('#run-select').should('have.attr', 'aria-expanded', 'false');
    cy.get('@openRun').should(
      'have.been.calledOnceWith',
      availableRuns['12345678'].runUrl,
      '_blank',
      'noopener,noreferrer',
    );
    cy.get('#run-select').click('left');
    cy.contains('[role="option"]', 'Run 2/2').click();
    cy.get('@setSelectedRunId').should('have.been.calledOnceWith', '12345679');
    cy.get('#run-select').should('have.attr', 'aria-expanded', 'false');
    cy.get('[aria-label="Next run"]').click();
    cy.get('@setSelectedRunId').should('have.been.calledWith', '12345679');
  });

  it('keeps the Chinese run dropdown touch-sized on phones', () => {
    cy.viewport(390, 844);
    mountWithProviders(
      <PathnameContext.Provider value="/zh/inference">
        <WorkflowInfoDisplay />
      </PathnameContext.Provider>,
      { inference: { availableRuns }, globalFilters: {} },
    );
    cy.get('#run-select')
      .should('have.attr', 'aria-label', '运行')
      .and('contain.text', '第 1/2 次运行')
      .then(($run) => {
        expect($run[0].getBoundingClientRect().height).to.equal(44);
      });
    cy.get('#run-select').click('left');
    cy.contains('[role="option"]', '第 2 次运行（共 2 次）').click();
    cy.get('@setSelectedRunId').should('have.been.calledOnceWith', '12345679');
  });

  for (const locale of ['en', 'zh'] as const) {
    it(`lays the run context out as aligned, equal-height stepper rows on a 361px phone (${locale})`, () => {
      cy.viewport(361, 780);
      mountWithProviders(
        <PathnameContext.Provider value={locale === 'zh' ? '/zh/inference' : '/inference'}>
          <WorkflowInfoDisplay />
        </PathnameContext.Provider>,
        { inference: { availableRuns }, globalFilters: {} },
      );
      cy.get('[data-testid="inference-run-context"]').then(($panel) => {
        const panel = $panel[0];
        const rect = (selector: string) => panel.querySelector(selector)!.getBoundingClientRect();
        const dateField = panel.querySelector('[data-slot="date-field"]')!.getBoundingClientRect();
        const runField = panel.querySelector('[data-slot="run-field"]')!.getBoundingClientRect();
        expect(runField.top, 'run field stacks below the date field').to.be.gte(dateField.bottom);
        expect(Math.abs(runField.left - dateField.left)).to.be.lte(0.5);
        expect(Math.abs(runField.width - dateField.width)).to.be.lte(0.5);

        const datePrev = rect(
          '[aria-label="Previous available date"], [aria-label="上一个可用日期"]',
        );
        const runPrev = rect('[aria-label="Previous run"], [aria-label="上一次运行"]');
        const runNext = rect('[aria-label="Next run"], [aria-label="下一次运行"]');
        const runTrigger = rect('#run-select');
        expect(
          Math.abs(datePrev.left - dateField.left),
          'stepper starts at the label edge',
        ).to.be.lte(0.5);
        expect(Math.abs(runPrev.left - datePrev.left)).to.be.lte(0.5);
        expect(
          Math.abs(runNext.right - runField.right),
          'stepper ends at the field edge',
        ).to.be.lte(0.5);
        for (const button of [datePrev, runPrev, runNext]) {
          expect(button.height).to.equal(runTrigger.height);
          expect(button.width).to.be.gte(44);
        }
        expect(panel.scrollWidth).to.be.lte(panel.clientWidth);
        const label = panel.querySelector<HTMLElement>(
          '#run-select [data-slot="select-value"] .truncate',
        )!;
        expect(label.scrollWidth, 'selected run label is not truncated').to.be.lte(
          label.clientWidth,
        );
      });
    });
  }
});
