import { useState } from 'react';
import { GpuSpecsBarChart } from '@/components/gpu-specs/gpu-specs-bar-chart';

function BarChartWrapper({ initialMetric = 'fp8' }: { initialMetric?: string }) {
  const [metric, setMetric] = useState(initialMetric);
  return <GpuSpecsBarChart selectedMetric={metric} onMetricChange={setMetric} />;
}

describe('GpuSpecsBarChart', () => {
  it('changing metric re-renders chart', () => {
    cy.mount(<BarChartWrapper initialMetric="fp8" />);
    cy.get('[data-testid="gpu-specs-bar-chart"]').contains('FP8').should('exist');
    cy.get('[data-testid="gpu-specs-metric-select"]').click();
    cy.get('[role="option"]').contains('Memory (GB)').click();
    cy.get('[data-testid="gpu-specs-bar-chart"]').contains('Memory').should('exist');
  });
});
