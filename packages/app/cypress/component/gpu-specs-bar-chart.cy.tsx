import { useState } from 'react';

import { GpuSpecsBarChart } from '@/components/gpu-specs/gpu-specs-bar-chart';

function BarChartWrapper({ initialMetric = 'fp8' }: { initialMetric?: string }) {
  const [metric, setMetric] = useState(initialMetric);
  return <GpuSpecsBarChart selectedMetric={metric} onMetricChange={setMetric} />;
}

describe('GpuSpecsBarChart', () => {
  it('renders SVG bar chart', () => {
    cy.mount(<BarChartWrapper />);
    cy.get('[data-testid="gpu-specs-bar-chart"]').should('be.visible');
    cy.get('[data-testid="gpu-specs-bar-chart"] svg').should('exist');
  });

  it('GPU names visible as labels', () => {
    cy.mount(<BarChartWrapper />);
    // The Y-axis should show GPU names from GPU_SPECS
    cy.get('[data-testid="gpu-specs-bar-chart"]').within(() => {
      cy.contains('H100 SXM').should('be.visible');
      cy.contains('MI300X').should('be.visible');
    });
  });

  it('NVIDIA bars use green color and AMD bars use red', () => {
    cy.mount(<BarChartWrapper />);
    // The legend swatches use inline style={{ background: '#76b900' }} and style={{ background: '#ed1c24' }}
    // NVIDIA swatch: green
    cy.get('[data-testid="gpu-specs-bar-chart"] div.w-3.h-3.rounded-sm').should('have.length', 2);
    cy.get('[data-testid="gpu-specs-bar-chart"] div.w-3.h-3.rounded-sm')
      .first()
      .should('have.css', 'background-color', 'rgb(118, 185, 0)');
    // AMD swatch: red
    cy.get('[data-testid="gpu-specs-bar-chart"] div.w-3.h-3.rounded-sm')
      .last()
      .should('have.css', 'background-color', 'rgb(237, 28, 36)');
  });

  it('metric selector dropdown is present', () => {
    cy.mount(<BarChartWrapper />);
    cy.get('[data-testid="gpu-specs-metric-select"]').should('be.visible');
  });

  it('changing metric re-renders chart', () => {
    cy.mount(<BarChartWrapper initialMetric="fp8" />);
    // Initially should show FP8 metric axis label
    cy.get('[data-testid="gpu-specs-bar-chart"]').contains('FP8').should('exist');
    // Open metric selector and pick Memory
    cy.get('[data-testid="gpu-specs-metric-select"]').click();
    cy.get('[role="option"]').contains('Memory (GB)').click();
    // Chart should now show Memory metric
    cy.get('[data-testid="gpu-specs-bar-chart"]').contains('Memory').should('exist');
  });
});
