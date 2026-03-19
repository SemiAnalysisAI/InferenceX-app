import { SocialShareButtons } from '@/components/social-share-buttons';

describe('Social Share Buttons', () => {
  beforeEach(() => {
    cy.mount(<SocialShareButtons />);
  });

  it('social share buttons container is visible', () => {
    cy.get('[data-testid="social-share-buttons"]').should('be.visible');
  });

  it('Twitter share button is present and is a button element', () => {
    cy.get('[data-testid="share-twitter"]').should('exist');
    cy.get('[data-testid="share-twitter"]').should('have.prop', 'tagName', 'BUTTON');
  });

  it('LinkedIn share button is present and is a button element', () => {
    cy.get('[data-testid="share-linkedin"]').should('exist');
    cy.get('[data-testid="share-linkedin"]').should('have.prop', 'tagName', 'BUTTON');
  });

  it('Twitter share button has a descriptive title referencing Twitter or X', () => {
    cy.get('[data-testid="share-twitter"]')
      .should('have.attr', 'title')
      .and('match', /Twitter|X/i);
  });

  it('LinkedIn share button has a descriptive title referencing LinkedIn', () => {
    cy.get('[data-testid="share-linkedin"]')
      .should('have.attr', 'title')
      .and('include', 'LinkedIn');
  });
});

describe('Social Share Buttons (compact)', () => {
  it('renders in compact mode', () => {
    cy.mount(<SocialShareButtons compact />);
    cy.get('[data-testid="social-share-buttons"]').should('be.visible');
    cy.get('[data-testid="share-twitter"]').should('exist');
    cy.get('[data-testid="share-linkedin"]').should('exist');
  });
});
