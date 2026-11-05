import { BannerRenderer } from '@/components/nudges/nudge-engine';
import { NUDGE_REGISTRY } from '@/lib/nudges/registry';
import type { NudgeDefinition } from '@/lib/nudges/types';

const arms = NUDGE_REGISTRY.filter((nudge) => nudge.variant);

describe('Landing banner A/B arms', () => {
  // Before the arm resolves after hydration, every arm is rendered and the engine's active banner
  // can be the hidden one. Handlers must act on the arm that was clicked, not on engine state.
  it('hands each arm its own definition on click and dismiss', () => {
    expect(arms.map((arm) => arm.variant)).to.deep.equal(['ubenchx', 'operatorx']);
    const onAction = cy.stub().as('action');
    const onDismiss = cy.stub().as('dismiss');
    cy.mount(
      <div>
        {arms.map((arm) => (
          <BannerRenderer key={arm.id} def={arm} onAction={onAction} onDismiss={onDismiss} />
        ))}
      </div>,
    );

    cy.get('[data-banner-variant="operatorx"] [data-testid="launch-banner"]')
      .should('have.attr', 'href', '/operatorx')
      .click();
    cy.get('@action').should('have.been.calledOnce');
    cy.get('@action').its('firstCall.args.0.variant').should('eq', 'operatorx');

    cy.get('[data-banner-variant="operatorx"] [data-testid="launch-banner-dismiss"]').click();
    cy.get('@dismiss').its('firstCall.args.0.variant').should('eq', 'operatorx');

    cy.get('[data-banner-variant="ubenchx"] [data-testid="launch-banner"]').click();
    cy.get('@action')
      .its('secondCall.args.0')
      .should((def: NudgeDefinition) => {
        expect(def.variant).to.eq('ubenchx');
        expect(def.analytics?.properties?.variant).to.eq('ubenchx');
      });
  });
});
