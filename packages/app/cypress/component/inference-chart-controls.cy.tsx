import WorkflowInfoDisplay from '@/components/inference/ui/WorkflowInfoDisplay';
import { Model, Sequence } from '@/lib/catalog/data-mappings';
import InferenceChartControls from '@/components/inference/ui/ChartControls';
import { TcoBasisCaption } from '@/components/inference/ui/TcoBasisCaption';
import { ResultContext } from '@/components/ui/result-context';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { checkA11y } from '../support/axe';
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

  it('gives benchmark config its own row above chart config and compare history on desktop', () => {
    cy.viewport(1280, 900);
    cy.get('fieldset').should('have.length', 3);
    cy.get('fieldset').then(($groups) => {
      const [benchmark, chart, history] = [...$groups].map((group) =>
        group.getBoundingClientRect(),
      );
      expect(chart.top).to.be.greaterThan(benchmark.bottom);
      expect(chart.left).to.be.closeTo(benchmark.left, 1);
      expect(history.top).to.be.closeTo(chart.top, 1);
      expect(chart.right).to.be.lessThan(history.left);
      expect(history.right).to.be.closeTo(benchmark.right, 1);
      expect(benchmark.height, 'benchmark controls fit in a single row').to.be.lessThan(130);
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
        expect(x.width).to.be.lessThan(y.width);
      });
    });
    cy.get('#model-select').then(($model) => {
      const model = $model[0].getBoundingClientRect();
      cy.get('fieldset')
        .first()
        .find('#precision-select')
        .should(($precision) => {
          const precision = $precision[0].getBoundingClientRect();
          expect(precision.top).to.be.greaterThan(model.bottom);
          expect(precision.left).to.be.closeTo(model.left, 1);
        });
    });
  });

  it('gives benchmark and chart settings full-width rows when history comparison is omitted', () => {
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
        expect(chart.top).to.be.greaterThan(benchmark.bottom);
        expect(chart.left).to.be.closeTo(benchmark.left, 1);
        expect(chart.right).to.be.closeTo(benchmark.right, 1);
        expect(benchmark.height, 'benchmark controls fit in a single row').to.be.lessThan(130);
      });
    cy.get('#model-select').then(($model) => {
      const model = $model[0].getBoundingClientRect();
      cy.get('#scenario-select, #precision-select').each(($control) => {
        expect($control[0].getBoundingClientRect().top).to.be.closeTo(model.top, 1);
      });
    });
  });

  it('keeps primary controls visible while secondary controls collapse on mobile', () => {
    cy.viewport(390, 844);
    mountWithProviders(<InferenceChartControls showXAxisMode />, { inference: {}, unofficial: {} });

    cy.get('#model-select').should('be.visible');
    cy.get('#scenario-select').should('have.length', 1).and('not.be.visible');
    cy.get('#precision-select').should('have.length', 1).and('be.visible');
    cy.get('[data-testid="inference-secondary-controls"] > button')
      .should('have.attr', 'aria-expanded', 'false')
      .click()
      .should('have.attr', 'aria-expanded', 'true');
    cy.get('[data-testid="yaxis-metric-selector"]').should('be.visible');
    cy.get('[data-testid="inference-secondary-controls"]').within(() => {
      cy.get('#scenario-select').should('be.visible');
      cy.get('#precision-select').should('not.exist');
    });

    cy.get('[data-testid="inference-secondary-controls"] > button')
      .click()
      .should('have.attr', 'aria-expanded', 'false');
    cy.get('[data-testid="yaxis-metric-selector"]').should('not.be.visible');
    cy.get('#scenario-select').should('not.be.visible');
    cy.get('#precision-select').should('be.visible');
    cy.get('#model-select').should('contain.text', 'DeepSeek R1 0528');
  });

  it('shows secondary controls by default on desktop', () => {
    cy.viewport(1280, 900);
    mountWithProviders(<InferenceChartControls showXAxisMode />, { inference: {}, unofficial: {} });

    cy.get('[data-testid="inference-secondary-controls"] > button').should('not.be.visible');
    cy.get('[data-testid="yaxis-metric-selector"]').should('be.visible');
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
});

describe('Axis option help', () => {
  beforeEach(() => {
    mountWithProviders(<InferenceChartControls showXAxisMode />, { inference: {}, unofficial: {} });
  });

  it('lets Tab leave the help grid in both directions (searchable=true)', () => {
    mountWithProviders(
      <div>
        <button data-testid="before-field">Before</button>
        <SearchableSelect
          value="first"
          onValueChange={cy.stub().as('selectMetric')}
          searchable
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
    checkA11y(
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
        <PathnameContext.Provider
          value={locale === 'zh' ? '/zh/infx/inference' : '/infx/inference'}
        >
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
      cy.get('#precision-select').should('have.length', 1).and('be.visible');
    });
  }

  for (const locale of ['en', 'zh'] as const) {
    it(`lays the run context out as aligned, equal-height stepper rows on a 361px phone (${locale})`, () => {
      cy.viewport(361, 780);
      mountWithProviders(
        <PathnameContext.Provider
          value={locale === 'zh' ? '/zh/infx/inference' : '/infx/inference'}
        >
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
