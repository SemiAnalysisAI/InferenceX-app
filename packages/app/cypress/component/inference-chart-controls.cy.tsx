import InferenceChartControls from '@/components/inference/ui/ChartControls';
import GpuComparisonCard from '@/components/inference/ui/GpuComparisonCard';
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

  it('does not render GPU comparison date controls (moved to GpuComparisonCard)', () => {
    cy.contains('Comparison Date Range').should('not.exist');
    cy.contains('GPU Comparison').should('not.exist');
  });
});

describe('GpuComparisonCard', () => {
  const gpuOptions = [
    { value: 'h100_sglang', label: 'H100 SGLang' },
    { value: 'b200_sglang', label: 'B200 SGLang' },
    { value: 'mi300x_sglang', label: 'MI300X SGLang' },
    { value: 'h200_sglang', label: 'H200 SGLang' },
  ];

  it('renders GPU multiselect; date range disabled until a GPU is selected', () => {
    mountWithProviders(<GpuComparisonCard />, {
      inference: {
        selectedGPUs: [],
        availableGPUs: gpuOptions,
      },
    });

    cy.get('[data-testid="gpu-comparison-card"]').should('be.visible');
    cy.contains('GPU Comparison').should('be.visible');
    cy.contains('Select one or more GPUs for date range comparison.').should('not.exist');
    cy.get('[data-testid="gpu-comparison-expand-toggle"]').should(
      'have.attr',
      'aria-expanded',
      'false',
    );
    cy.get('[data-testid="gpu-comparison-expand-toggle"]').click();
    cy.contains('Select one or more GPUs for date range comparison.').should('be.visible');
    cy.get('[data-testid="gpu-multiselect"]').should('be.visible');
    cy.get('[data-testid="gpu-multiselect-trigger"]').should('be.visible');
    cy.contains('Comparison Date Range').should('be.visible');
    cy.get('#gpu-comparison-date-picker').should('be.disabled');
    cy.get('[data-testid="date-range-shortcuts"]').should('be.visible');
    cy.get('[data-testid="date-shortcut-all-time"]').should('be.disabled');
    cy.get('[data-testid="date-shortcut-last-90-days"]').should('be.disabled');
    cy.get('[data-testid="date-shortcut-last-30-days"]').should('be.disabled');
  });

  it('enables date range picker and shortcuts when one GPU is selected', () => {
    mountWithProviders(<GpuComparisonCard />, {
      inference: {
        selectedGPUs: ['h100_sglang'],
        selectedDateRange: { startDate: '', endDate: '' },
        availableGPUs: gpuOptions,
        dateRangeAvailableDates: ['2025-10-05', '2025-11-01', '2025-12-01'],
      },
    });

    cy.get('#gpu-comparison-date-picker').should('not.be.disabled');
    cy.get('[data-testid="date-shortcut-all-time"]').should('not.be.disabled');
  });

  it('shows enabled shortcut buttons that call setSelectedDateRange when two GPUs are selected', () => {
    mountWithProviders(<GpuComparisonCard />, {
      inference: {
        selectedGPUs: ['h100_sglang', 'b200_sglang'],
        selectedDateRange: { startDate: '', endDate: '' },
        availableGPUs: gpuOptions,
        dateRangeAvailableDates: [
          '2025-10-05',
          '2025-11-01',
          '2025-12-01',
          '2026-01-01',
          '2026-02-01',
          '2026-03-01',
        ],
      },
    });

    cy.get('[data-testid="date-shortcut-all-time"]').should('not.be.disabled');
    cy.get('[data-testid="date-shortcut-all-time"]').click();
    cy.get('@setSelectedDateRange').should('have.been.calledOnce');
  });

  it('selecting a third GPU from the multiselect calls setSelectedGPUs with three GPUs', () => {
    mountWithProviders(<GpuComparisonCard />, {
      inference: {
        selectedGPUs: ['h100_sglang', 'b200_sglang'],
        selectedDateRange: { startDate: '', endDate: '' },
        availableGPUs: gpuOptions,
      },
    });

    cy.get('#gpu-comparison-date-picker').should('not.be.disabled');
    cy.get('[data-testid="gpu-multiselect-trigger"]').click();
    cy.contains('[role="option"]', 'MI300X SGLang').click();
    cy.get('@setSelectedGPUs').should(
      'have.been.calledWith',
      Cypress.sinon.match((v: string[]) => v.length === 3 && v.includes('mi300x_sglang')),
    );
  });

  it('shows max-selection summary when four GPUs are selected', () => {
    mountWithProviders(<GpuComparisonCard />, {
      inference: {
        selectedGPUs: ['h100_sglang', 'b200_sglang', 'mi300x_sglang', 'h200_sglang'],
        selectedDateRange: { startDate: '', endDate: '' },
        availableGPUs: gpuOptions,
      },
    });

    // Wait for card expansion, then open the dropdown.
    // With 4 chips the center of the trigger may land on a chip's remove
    // button (which stopPropagates), so target the chevron icon instead.
    cy.get('[data-testid="gpu-multiselect-trigger"]').should('be.visible');
    cy.get('[data-testid="gpu-multiselect-trigger"] svg').last().click();
    cy.contains('4 / 4 selected').should('be.visible');
  });

  it('calls setSelectedGPUs without the removed GPU when a chip remove control is clicked', () => {
    mountWithProviders(<GpuComparisonCard />, {
      inference: {
        selectedGPUs: ['h100_sglang', 'b200_sglang', 'mi300x_sglang'],
        selectedDateRange: { startDate: '', endDate: '' },
        availableGPUs: gpuOptions,
      },
    });

    cy.get('[aria-label="Remove MI300X SGLang"]').click();
    cy.get('@setSelectedGPUs').should(
      'have.been.calledWith',
      Cypress.sinon.match((v: string[]) => v.length === 2 && !v.includes('mi300x_sglang')),
    );
  });
});
