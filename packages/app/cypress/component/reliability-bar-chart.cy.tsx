import ReliabilityBarChartD3 from '@/components/reliability/ui/BarChartD3';
import { mountWithProviders } from '../support/test-utils';
import { createMockReliabilityData } from '../support/mock-data';
import { Model } from '@/lib/data-mappings';

describe('ReliabilityBarChartD3', () => {
  it('shows error message when error is set', () => {
    mountWithProviders(<ReliabilityBarChartD3 />, {
      reliability: { error: 'Server error', chartData: [] },
    });
    cy.contains('Failed to load reliability data.').should('be.visible');
  });

  it('shows "No reliability data" when chartData is empty', () => {
    mountWithProviders(<ReliabilityBarChartD3 />, {
      reliability: { error: null, chartData: [] },
    });
    cy.contains('No reliability data available.').should('be.visible');
  });

  it('renders SVG with horizontal bars when data is provided', () => {
    const mockData = [
      createMockReliabilityData({
        model: Model.DeepSeek_R1,
        modelLabel: 'DeepSeek R1 0528',
        successRate: 96.5,
        total: 200,
        n_success: 193,
      }),
      createMockReliabilityData({
        model: 'meta-llama/Llama-4-Maverick-17B-128E-Instruct' as Model,
        modelLabel: 'Llama 4 Maverick',
        successRate: 88.0,
        total: 100,
        n_success: 88,
      }),
    ];
    mountWithProviders(
      <div style={{ width: 900, height: 700 }}>
        <ReliabilityBarChartD3 />
      </div>,
      {
        reliability: {
          chartData: mockData,
          filteredReliabilityData: mockData,
          enabledModels: new Set([
            Model.DeepSeek_R1,
            'meta-llama/Llama-4-Maverick-17B-128E-Instruct',
          ]),
          modelsWithData: new Set([
            Model.DeepSeek_R1,
            'meta-llama/Llama-4-Maverick-17B-128E-Instruct',
          ]),
        },
      },
    );

    // SVG should render
    cy.get('#reliability-chart svg').should('exist');

    // Horizontal bars should be present (rect elements inside the chart)
    cy.get('#reliability-chart svg rect').should('have.length.greaterThan', 0);

    // Legend should render with sidebar class
    cy.get('.sidebar-legend').should('exist');
    cy.get('.sidebar-legend li').should('have.length.greaterThan', 0);
  });

  it('legend items render for each model', () => {
    const mockData = [
      createMockReliabilityData({
        model: Model.DeepSeek_R1,
        modelLabel: 'DeepSeek R1 0528',
        successRate: 96.5,
        total: 200,
        n_success: 193,
      }),
    ];
    mountWithProviders(
      <div style={{ width: 900, height: 700 }}>
        <ReliabilityBarChartD3 />
      </div>,
      {
        reliability: {
          chartData: mockData,
          filteredReliabilityData: mockData,
          enabledModels: new Set([Model.DeepSeek_R1]),
          modelsWithData: new Set([Model.DeepSeek_R1]),
        },
      },
    );

    cy.get('.sidebar-legend').should('exist');
    cy.get('.sidebar-legend li').should('have.length', 1);
  });

  it('high contrast switch is present in the legend', () => {
    const mockData = [
      createMockReliabilityData({
        model: Model.DeepSeek_R1,
        modelLabel: 'DeepSeek R1 0528',
        successRate: 96.5,
        total: 200,
        n_success: 193,
      }),
    ];
    mountWithProviders(
      <div style={{ width: 900, height: 700 }}>
        <ReliabilityBarChartD3 />
      </div>,
      {
        reliability: {
          chartData: mockData,
          filteredReliabilityData: mockData,
          enabledModels: new Set([Model.DeepSeek_R1]),
          modelsWithData: new Set([Model.DeepSeek_R1]),
        },
      },
    );

    cy.contains('High Contrast').should('exist');
  });
});
