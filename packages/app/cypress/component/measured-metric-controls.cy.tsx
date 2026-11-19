import { useState } from 'react';
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';

import { MeasuredMetricControls } from '@/components/inference/ui/MeasuredMetricControls';

function Controls() {
  const [metric, setMetric] = useState('y_measuredAvgPower');
  return (
    <div className="p-4">
      <MeasuredMetricControls metric={metric} onChange={setMetric} />
      <output data-testid="selected-metric">{metric}</output>
    </div>
  );
}

describe('Power boundary labels', () => {
  it('keeps boundary selection clear (en)', () => {
    cy.viewport(1280, 720);
    cy.mount(
      <PathnameContext.Provider value="/infx/inference">
        <Controls />
      </PathnameContext.Provider>,
    );
    cy.get('[data-testid="measured-power-basis"]').click();
    cy.get('[data-select-option]').should(($options) => {
      expect([...$options].map((option) => option.textContent?.trim())).to.deep.equal([
        'GPU Level Measured',
        'All in Measured IT (no PUE)',
        'All in Measured',
      ]);
    });
    cy.get('[data-select-option][data-value="utility-modeled"]').click();
    cy.get('[data-select-option]').should('not.exist');
    cy.get('[data-testid="selected-metric"]').should('have.text', 'y_utilityModeledWatts');
    cy.get('[data-testid="measured-metric-controls"]').should(($controls) => {
      const box = $controls[0].getBoundingClientRect();
      expect(box.left).to.be.at.least(0);
      expect(box.right).to.be.at.most(1280);
      expect($controls[0].scrollWidth).to.be.at.most($controls[0].clientWidth);
    });
    cy.get('[data-testid="measured-power-basis"]').click();
    cy.get('[data-select-option][data-value="gpu-measured"]').click();
    cy.get('[data-testid="selected-metric"]').should('have.text', 'y_measuredAvgPower');
    cy.get('[data-testid="measured-power-basis"]').click();
    cy.get('[data-select-option]').should('be.visible');
  });
});
