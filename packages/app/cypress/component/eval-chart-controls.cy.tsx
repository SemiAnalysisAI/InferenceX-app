import EvaluationChartControls from '@/components/evaluation/ui/ChartControls';
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
});
