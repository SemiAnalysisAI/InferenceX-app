import { NormalizedInteractivityHelpLink } from '@/components/inference/ui/NormalizedInteractivityHelpLink';

describe('NormalizedInteractivityHelpLink', () => {
  it('renders a descriptive link to the English FAQ', () => {
    cy.mount(
      <div className="relative h-10 w-80">
        <NormalizedInteractivityHelpLink locale="en" />
      </div>,
    );

    cy.get('[data-testid="normalized-interactivity-faq-link"]')
      .should('be.visible')
      .and('have.text', 'What does E2E Normalized Interactivity mean?')
      .and('have.attr', 'href', '/about#faq-normalized-interactivity')
      .and('have.attr', 'title', 'What does E2E Normalized Interactivity mean?')
      .and('have.attr', 'aria-label', 'What does E2E Normalized Interactivity mean?')
      .and('have.class', 'no-export');
  });

  it('links the Chinese control to the Chinese FAQ', () => {
    cy.mount(
      <div className="relative h-10 w-80">
        <NormalizedInteractivityHelpLink locale="zh" />
      </div>,
    );

    cy.get('[data-testid="normalized-interactivity-faq-link"]')
      .should('have.attr', 'href', '/zh/about#faq-normalized-interactivity')
      .and('have.attr', 'title', '什么是端到端归一化交互性？')
      .and('have.attr', 'aria-label', '什么是端到端归一化交互性？');
  });
});
