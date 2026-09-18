import { MeasuredMetricControls } from '@/components/inference/ui/MeasuredMetricControls';
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';

describe('MeasuredMetricControls statistic layout', () => {
  for (const pathname of ['/inference', '/zh/inference']) {
    for (const width of [375, 1280]) {
      it(`contains statistic labels at ${width}px on ${pathname}`, () => {
        cy.viewport(width, 800);
        cy.mount(
          <PathnameContext.Provider value={pathname}>
            <div style={{ width: '100%', maxWidth: 570 }}>
              <MeasuredMetricControls
                metric="y_measuredAvgPower"
                onChange={cy.stub().as('change')}
              />
            </div>
          </PathnameContext.Provider>,
        );
        cy.get('[data-testid^="measured-power-statistic-"]')
          .should('have.length', 3)
          .each(($button) => {
            const button = $button[0];
            const bounds = button.getBoundingClientRect();
            const group = button.parentElement!.getBoundingClientRect();
            const range = button.ownerDocument.createRange();
            range.selectNodeContents(button);
            const label = range.getBoundingClientRect();
            expect(label.left, 'label stays inside its button').to.be.at.least(bounds.left);
            expect(label.right, 'label stays inside its button').to.be.at.most(bounds.right);
            expect(bounds.left, 'button stays inside the group').to.be.at.least(group.left);
            expect(bounds.right, 'button stays inside the group').to.be.at.most(group.right);
          });
        cy.get('[data-testid="measured-power-statistic-p75"]').click();
        cy.get('@change').should('have.been.calledOnceWith', 'y_measuredP75Power');
      });
    }
  }
});
