import InferenceChartControls from '@/components/inference/ui/ChartControls';
import { mountWithProviders } from '../support/test-utils';

describe('Inference ChartControls', () => {
  beforeEach(() => {
    mountWithProviders(<InferenceChartControls />, { inference: {} });
  });

  it('renders the model selector with the current model', () => {
    // Default mock: selectedModel = Model.DeepSeek_R1 -> "DeepSeek R1 0528"
    cy.get('#model-select').should('be.visible');
    cy.get('#model-select').should('contain.text', 'DeepSeek R1 0528');
  });

  it('renders the sequence selector with the current sequence', () => {
    // Default mock: selectedSequence = Sequence.EightK_OneK -> label "8K / 1K"
    cy.get('#sequence-select').should('be.visible');
    cy.get('#sequence-select').should('contain.text', '8K / 1K');
  });

  it('renders the precision multi-select with the current precision', () => {
    // Default mock: selectedPrecisions = [Precision.FP4] -> label "FP4"
    cy.get('[data-testid="precision-multiselect"]').should('be.visible');
    cy.get('[data-testid="precision-multiselect"]').should('contain.text', 'FP4');
  });

  it('renders the Y-axis metric selector', () => {
    cy.get('[data-testid="yaxis-metric-selector"]').should('be.visible');
  });

  it('Y-axis metric selector shows grouped options', () => {
    cy.get('[data-testid="yaxis-metric-selector"]').click();
    // Should contain at least the "Throughput" group
    cy.contains('Throughput').should('exist');
  });

  it('calls setSelectedYAxisMetric when a Y-axis option is chosen', () => {
    cy.get('[data-testid="yaxis-metric-selector"]').click();
    // "Throughput per GPU" is the label for y_tpPerGpu — pick a different one
    cy.contains('[role="option"]', 'Output Token Throughput per GPU').click();
    cy.get('@setSelectedYAxisMetric').should('have.been.calledOnce');
  });

  it('hides the GPU comparison section when no GPUs are selected', () => {
    // Default mock: selectedGPUs = [] — GPU date range pickers should not render
    cy.contains('Comparison Date Range').should('not.exist');
    cy.contains('Intermediary Dates').should('not.exist');
  });

  it('renders the GPU config multi-select', () => {
    // The GPU Config label should be present (hideGpuComparison defaults to false)
    cy.contains('GPU Config').should('be.visible');
    cy.get('[data-testid="gpu-multiselect"]').should('be.visible');
  });
});

describe('Inference ChartControls with GPUs selected', () => {
  it('shows the date range picker when GPUs are selected', () => {
    mountWithProviders(<InferenceChartControls />, {
      inference: {
        selectedGPUs: ['h100'],
        selectedDateRange: { startDate: '', endDate: '' },
      },
    });

    cy.contains('Comparison Date Range').should('be.visible');
  });
});

describe('Inference ChartControls with hideGpuComparison', () => {
  it('hides GPU config selector when hideGpuComparison is true', () => {
    mountWithProviders(<InferenceChartControls hideGpuComparison />, {
      inference: {},
    });

    cy.contains('GPU Config').should('not.exist');
    cy.get('[data-testid="gpu-multiselect"]').should('not.exist');
  });
});
