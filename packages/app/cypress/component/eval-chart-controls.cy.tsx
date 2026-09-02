import EvaluationChartControls from '@/components/evaluation/ui/ChartControls';
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { mountWithProviders } from '../support/test-utils';

describe('Evaluation ChartControls', () => {
  beforeEach(() => {
    mountWithProviders(<EvaluationChartControls />, { evaluation: {} });
  });

  it('renders the model selector with the current model label', () => {
    // Default mock context: selectedModel = Model.DeepSeek_R1 -> label "DeepSeek R1 0528"
    cy.get('#model-select').should('be.visible');
    cy.get('#model-select').should('contain.text', 'DeepSeek R1 0528');
  });

  it('renders the benchmark selector with the current benchmark', () => {
    cy.get('[data-testid="evaluation-benchmark-selector"]').should('be.visible');
    // Default mock context: selectedBenchmark = 'mmlu'
    cy.get('[data-testid="evaluation-benchmark-selector"]').should('contain.text', 'MMLU');
  });

  it('displays all available benchmarks in the dropdown', () => {
    cy.get('[data-testid="evaluation-benchmark-selector"]').click();
    // availableBenchmarks = ['mmlu', 'humaneval', 'gsm8k']
    cy.contains('[role="option"]', 'MMLU').should('exist');
    cy.contains('[role="option"]', 'HUMANEVAL').should('exist');
    cy.contains('[role="option"]', 'GSM8K').should('exist');
  });

  it('calls setSelectedBenchmark when a benchmark is chosen', () => {
    cy.get('[data-testid="evaluation-benchmark-selector"]').click();
    cy.contains('[role="option"]', 'GSM8K').click();
    cy.get('@setSelectedBenchmark').should('have.been.calledOnceWith', 'gsm8k');
  });

  it('renders the date picker with run date controls', () => {
    // The DatePicker renders a button showing "Run Date:" and the formatted date
    cy.contains('Run Date:').should('be.visible');
  });

  it('shows the current run date in the date picker', () => {
    // Default mock context: selectedRunDate = '2025-03-01' -> "Mar 1, 2025"
    cy.contains('Mar 1, 2025').should('be.visible');
  });

  it('renders the changelog button', () => {
    cy.contains('Changelog').should('be.visible');
  });

  it('keeps benchmark controls aligned beside the secondary run context on desktop', () => {
    cy.viewport(1280, 900);
    cy.get('fieldset').should('have.length', 2);
    cy.get('#model-select, #eval-benchmark-select, #eval-precision-select').then(($controls) => {
      const tops = [...$controls].map((control) => control.getBoundingClientRect().top);
      expect(Math.max(...tops) - Math.min(...tops)).to.be.lessThan(2);
    });
    cy.get('fieldset').then(($groups) => {
      const rects = [...$groups].map((group) => group.getBoundingClientRect());
      expect(rects[1].left).to.be.greaterThan(rects[0].right);
      expect(rects[1].top).to.be.closeTo(rects[0].top, 2);
    });
    cy.contains('Run Date:')
      .closest('button')
      .then(($date) => {
        cy.contains('Changelog')
          .closest('button')
          .then(($changelog) => {
            expect($changelog[0].getBoundingClientRect().height).to.be.closeTo(
              $date[0].getBoundingClientRect().height,
              2,
            );
          });
      });
  });

  it('stacks the control groups on a narrow viewport and keeps precision selectable', () => {
    cy.viewport(390, 844);
    cy.get('[data-testid="evaluation-secondary-controls"] > button').click();
    cy.get('fieldset')
      .should('have.length', 2)
      .then(($groups) => {
        const rects = [...$groups].map((group) => group.getBoundingClientRect());
        expect(rects[1].top).to.be.greaterThan(rects[0].bottom);
        expect(rects[0].width).to.be.closeTo(rects[1].width, 2);
      });

    cy.get('#model-select, #eval-benchmark-select, #eval-precision-select').each(($button) => {
      expect($button[0].getBoundingClientRect().height).to.be.at.least(44);
    });
    cy.contains('Changelog')
      .closest('button')
      .then(($button) => {
        expect($button[0].getBoundingClientRect().height).to.be.at.least(44);
      });

    cy.contains('fieldset', 'Run context')
      .find('button')
      .each(($button) => {
        expect($button[0].getBoundingClientRect().height).to.be.at.least(44);
      });
    cy.get('button span.tabular-nums').should(($date) => {
      expect($date[0].scrollWidth).to.be.at.most($date[0].clientWidth);
    });
    cy.get('[data-testid="evaluation-precision-selector"]').click();
    cy.contains('[role="option"]', 'FP8').click();
    cy.get('@setSelectedPrecisions_eval').should('have.been.calledOnceWith', ['fp4', 'fp8']);
  });

  it('keeps primary controls visible while run context collapses on mobile', () => {
    cy.viewport(390, 844);
    mountWithProviders(<EvaluationChartControls />, { evaluation: {} });

    cy.get('#model-select').should('be.visible');
    cy.get('[data-testid="evaluation-secondary-controls"] > button')
      .first()
      .should('have.attr', 'aria-expanded', 'false')
      .click()
      .should('have.attr', 'aria-expanded', 'true');
    cy.contains('Run Date:').should('be.visible');

    cy.get('[data-testid="evaluation-secondary-controls"] button')
      .first()
      .click()
      .should('have.attr', 'aria-expanded', 'false');
    cy.contains('Run Date:').should('not.be.visible');
    cy.get('#model-select').should('contain.text', 'DeepSeek R1 0528');
  });

  it('shows run context by default on desktop', () => {
    cy.viewport(1280, 900);
    mountWithProviders(<EvaluationChartControls />, { evaluation: {} });

    cy.get('[data-testid="evaluation-secondary-controls"] > button').should('not.be.visible');
    cy.contains('Run Date:').should('be.visible');
  });

  it('localizes the mobile secondary changed-count label', () => {
    cy.viewport(390, 844);
    mountWithProviders(
      <PathnameContext.Provider value="/zh/evaluation">
        <EvaluationChartControls />
      </PathnameContext.Provider>,
      {
        evaluation: { selectedRunDate: '2026-06-11', availableDates: ['2026-06-11', '2026-06-12'] },
      },
    );

    cy.get('[data-testid="evaluation-secondary-controls"] > button')
      .should('contain.text', '更多运行设置')
      .and('contain.text', '项已更改');
  });

  it('keeps a long changelog configuration inside the viewport', () => {
    mountWithProviders(<EvaluationChartControls />, {
      evaluation: {
        changelogEntries: [
          {
            benchmark: 'mmlu',
            configs: ['a'.repeat(500)],
          },
        ],
      },
    });
    cy.viewport(390, 844);
    cy.get('[data-testid="evaluation-secondary-controls"] > button').click();
    cy.contains('Changelog').click();
    cy.get('[data-slot="popover-content"]').then(($popover) => {
      const rect = $popover[0].getBoundingClientRect();
      expect(rect.left).to.be.at.least(0);
      expect(rect.right).to.be.at.most(390);
      expect(rect.bottom).to.be.at.most(844);
      expect($popover.text()).to.include('a'.repeat(500));
    });
  });
  it('keeps fixed precision visible beside the selected benchmark', () => {
    cy.viewport(1280, 900);
    mountWithProviders(<EvaluationChartControls />, {
      evaluation: { availablePrecisions: ['fp4'], selectedPrecisions: ['fp4'] },
    });
    cy.get('button#eval-precision-select').should('be.visible').and('have.text', 'FP4');
    cy.get('fieldset')
      .first()
      .then(($group) => {
        cy.get('#eval-precision-select').should(($precision) => {
          expect(
            $group[0].getBoundingClientRect().right - $precision[0].getBoundingClientRect().right,
          ).to.be.lessThan(20);
        });
      });
  });
});
