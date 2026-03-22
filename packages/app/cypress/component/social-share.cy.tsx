import { ShareTwitterButton, ShareLinkedInButton } from '@/components/share-buttons';

describe('Share Buttons', () => {
  it('Twitter share button renders and is a button element', () => {
    cy.mount(<ShareTwitterButton />);
    cy.get('[data-testid="share-twitter"]').should('exist');
    cy.get('[data-testid="share-twitter"]').should('have.prop', 'tagName', 'BUTTON');
  });

  it('Twitter share button has a descriptive title referencing Twitter or X', () => {
    cy.mount(<ShareTwitterButton />);
    cy.get('[data-testid="share-twitter"]')
      .should('have.attr', 'title')
      .and('match', /Twitter|X/i);
  });

  it('LinkedIn share button renders and is a button element', () => {
    cy.mount(<ShareLinkedInButton />);
    cy.get('[data-testid="share-linkedin"]').should('exist');
    cy.get('[data-testid="share-linkedin"]').should('have.prop', 'tagName', 'BUTTON');
  });

  it('LinkedIn share button has a descriptive title referencing LinkedIn', () => {
    cy.mount(<ShareLinkedInButton />);
    cy.get('[data-testid="share-linkedin"]')
      .should('have.attr', 'title')
      .and('include', 'LinkedIn');
  });
});
