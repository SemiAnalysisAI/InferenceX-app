import { CollectiveXSwapSection } from '@/components/collectivex/CollectiveXSwapSection';
import { buildDatasetFromNeutral } from '@semianalysisai/inferencex-db/collectivex/reader';
import {
  makeSwapDoc,
  swapMatrix,
  swapMeta,
} from '@semianalysisai/inferencex-db/collectivex/swap-test-fixture';

it('keeps comparison runs independently toggleable and distinguishes their lines', () => {
  const datasets = ['170', '171'].map((run_id) =>
    buildDatasetFromNeutral(swapMatrix, [makeSwapDoc()], { ...swapMeta, run_id }),
  );
  cy.mount(
    <CollectiveXSwapSection
      datasets={datasets}
      runIndexById={
        new Map([
          ['170', 0],
          ['171', 1],
        ])
      }
    />,
  );
  cy.get('[data-testid="collectivex-swap-chart"] .point').should('have.length', 4);
  cy.get('[data-testid="collectivex-swap-chart"] .line-path')
    .should('have.length', 2)
    .then((lines) => {
      expect(lines[0].getAttribute('stroke-dasharray')).not.to.eq(
        lines[1].getAttribute('stroke-dasharray'),
      );
    });
  cy.get('[data-testid="chart-legend"] input[type="checkbox"]').eq(1).uncheck({ force: true });
  cy.get('[data-testid="collectivex-swap-chart"] .point').should('have.length', 2);
  cy.get('[data-testid="chart-legend"] input[type="checkbox"]').eq(0).uncheck({ force: true });
  cy.get('[data-testid="collectivex-swap-chart"] .point').should('have.length', 0);
  cy.contains('No measured swap-block points match this selection.').should('be.visible');
  cy.get('[data-testid="chart-legend"] input[type="checkbox"]').eq(1).check({ force: true });
  cy.get('[data-testid="collectivex-swap-chart"] .point').should('have.length', 2);
});
