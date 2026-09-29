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
  for (const locale of ['en', 'zh'] as const) {
    it(`keeps metric selection and the modeled-component note clear (${locale})`, () => {
      const width = locale === 'en' ? 1280 : 390;
      cy.viewport(width, 720);
      cy.mount(
        <PathnameContext.Provider value={locale === 'en' ? '/inference' : '/zh/inference'}>
          <Controls />
        </PathnameContext.Provider>,
      );
      const labels =
        locale === 'en'
          ? [
              'GPU Level Measured',
              'GPU Level Provisioned (TDP)',
              'All in Provisioned',
              'All in Measured',
            ]
          : ['GPU 实测功耗', 'GPU 额定功耗（TDP）', '整体预配功耗', '整体实测功耗'];
      cy.get('[data-testid="all-in-measured-note"]').should('not.exist');
      cy.get('[data-testid="measured-power-basis"]').click();
      cy.get('[role="option"]').should(($options) => {
        expect([...$options].map((option) => option.textContent?.trim())).to.deep.equal(labels);
      });
      cy.screenshot(`power-boundary-options-${locale}`, { overwrite: true });
      cy.get('[role="option"][data-value="gpu-provisioned"]').click();
      cy.get('[data-testid="selected-metric"]').should('have.text', 'y_gpuProvisionedWatts');
      cy.get('[data-testid="measured-power-basis"]').click();
      cy.get('[role="option"][data-value="utility-provisioned"]').click();
      cy.get('[data-testid="selected-metric"]').should('have.text', 'y_utilityProvisionedWatts');
      cy.get('[data-testid="measured-power-basis"]').click();
      cy.get('[role="option"][data-value="utility-modeled"]').click();
      cy.get('[role="option"]').should('not.exist');
      cy.get('[data-testid="selected-metric"]').should('have.text', 'y_utilityModeledWatts');
      cy.get('[data-testid="all-in-measured-note"]')
        .should('be.visible')
        .and(
          'contain',
          locale === 'en' ? 'unmeasured components are modeled' : '未实测的组件功耗由模型估算',
        );
      cy.get('[data-testid="measured-metric-controls"]').should(($controls) => {
        const box = $controls[0].getBoundingClientRect();
        expect(box.left).to.be.at.least(0);
        expect(box.right).to.be.at.most(width);
        expect($controls[0].scrollWidth).to.be.at.most($controls[0].clientWidth);
      });
      cy.screenshot(`power-boundary-note-${locale}`, { overwrite: true });
      cy.get('[data-testid="measured-power-basis"]').click();
      cy.get('[role="option"][data-value="gpu-measured"]').click();
      cy.get('[data-testid="selected-metric"]').should('have.text', 'y_measuredAvgPower');
      cy.get('[data-testid="all-in-measured-note"]').should('not.exist');
    });
  }
});
