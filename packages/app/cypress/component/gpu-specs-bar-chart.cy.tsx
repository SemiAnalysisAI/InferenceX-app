import { useState } from 'react';
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';

import { GpuSpecsBarChart } from '@/components/gpu-specs/gpu-specs-bar-chart';

function BarChartWrapper({ initialMetric = 'fp8' }: { initialMetric?: string }) {
  const [metric, setMetric] = useState(initialMetric);
  return <GpuSpecsBarChart selectedMetric={metric} onMetricChange={setMetric} />;
}

function ZhBarChartWrapper() {
  return (
    <PathnameContext.Provider value="/zh/gpu-specs">
      <BarChartWrapper initialMetric="memory" />
    </PathnameContext.Provider>
  );
}

describe('GpuSpecsBarChart', () => {
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

  it('localizes metric controls, axis text, and chart instructions on /zh', () => {
    cy.mount(<ZhBarChartWrapper />);
    cy.get('[data-testid="gpu-specs-bar-chart"]').should('contain.text', '指标：');
    cy.get('[data-testid="gpu-specs-metric-select"]').should('contain.text', '显存容量');
    cy.get('[data-testid="gpu-specs-bar-chart"] svg').should('contain.text', '显存容量 (GB)');
    cy.get('[data-testid="gpu-specs-bar-chart"]').should('contain.text', '悬停柱形可查看详情');
  });
});
