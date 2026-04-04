import EvalBarChartD3 from '@/components/evaluation/ui/BarChartD3';
import { mountWithProviders } from '../support/test-utils';
import { createMockEvaluationChartData } from '../support/mock-data';
import { Model, Precision } from '@/lib/data-mappings';

describe('EvalBarChartD3', () => {
  it('shows skeleton during loading with no data', () => {
    mountWithProviders(<EvalBarChartD3 />, {
      evaluation: { loading: true, chartData: [], error: null },
      unofficial: {},
    });
    // Skeleton elements are rendered (Skeleton component uses data-slot="skeleton")
    cy.get('[data-slot="skeleton"]').should('have.length.greaterThan', 0);
  });

  it('shows error message when error is set', () => {
    mountWithProviders(<EvalBarChartD3 />, {
      evaluation: { error: 'Failed to fetch', chartData: [], loading: false },
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
        configLabel: 'B200 (TRT)\nTP8 FP4',
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
        configLabel: 'B200 (TRT)\nTP8 FP4',
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
});
