/** Send the ↑↑↓↓ unlock sequence to reveal the PowerX tab. */
function unlockPowerX() {
  cy.get('body').type('{uparrow}{uparrow}{downarrow}{downarrow}');
}

describe('PowerX', () => {
  beforeEach(() => {
    cy.visit('/inference', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
  });

  it('PowerX tab is hidden by default', () => {
    cy.get('[data-testid="tab-trigger-gpu-metrics"]').should('not.exist');
  });

  it('↑↑↓↓ key sequence reveals the PowerX tab', () => {
    cy.get('[data-testid="tab-trigger-gpu-metrics"]').should('not.exist');
    unlockPowerX();
    cy.get('[data-testid="tab-trigger-gpu-metrics"]').should('be.visible');
    cy.get('[data-testid="tab-trigger-gpu-metrics"]').should('contain.text', 'PowerX');
  });

  it('unlock persists across page reloads via localStorage', () => {
    unlockPowerX();
    cy.get('[data-testid="tab-trigger-gpu-metrics"]').should('be.visible');
    cy.reload();
    cy.get('[data-testid="tab-trigger-gpu-metrics"]').should('be.visible');
  });

  describe('(unlocked)', () => {
    beforeEach(() => {
      cy.visit('/inference', {
        onBeforeLoad(win) {
          win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
          win.localStorage.setItem('inferencex-feature-gate', '1');
        },
      });
    });

    it('clicking the gpu-metrics tab activates it and shows content', () => {
      cy.get('[data-testid="tab-trigger-gpu-metrics"]').click();
      cy.url().should('include', '/gpu-metrics');
      cy.get('[data-testid="gpu-metrics-display"]').find('h2').should('contain.text', 'PowerX');
    });

    it('navigates to gpu-metrics URL path', () => {
      cy.get('[data-testid="tab-trigger-gpu-metrics"]').click();
      cy.url().should('include', 'gpu-metrics');
    });

    it('renders the run ID input pre-filled and Load button enabled', () => {
      cy.get('[data-testid="tab-trigger-gpu-metrics"]').click();
      cy.get('[data-testid="gpu-metrics-run-input"]').should('not.have.value', '');
      cy.get('[data-testid="gpu-metrics-load-button"]').should('not.be.disabled');
      cy.get('[data-testid="gpu-metrics-load-button"]').should('contain.text', 'Load');
    });

    it('disables Load button when input is cleared', () => {
      cy.get('[data-testid="tab-trigger-gpu-metrics"]').click();
      cy.get('[data-testid="gpu-metrics-run-input"]').clear();
      cy.get('[data-testid="gpu-metrics-load-button"]').should('be.disabled');
    });

    it('shows error card with message when invalid run ID is submitted', () => {
      cy.get('[data-testid="tab-trigger-gpu-metrics"]').click();
      cy.get('[data-testid="gpu-metrics-run-input"]').clear().type('invalid-id');
      cy.get('[data-testid="gpu-metrics-load-button"]').click();
      cy.get('[data-testid="gpu-metrics-error"]').should('be.visible');
      cy.get('[data-testid="gpu-metrics-error"]').find('p').should('contain.text', 'numeric');
    });

    it('renders description text and PowerX heading', () => {
      cy.get('[data-testid="tab-trigger-gpu-metrics"]').click();
      cy.get('[data-testid="gpu-metrics-display"]').find('h2').should('contain.text', 'PowerX');
      cy.get('[data-testid="gpu-metrics-display"]')
        .should('contain.text', 'gpu_metrics')
        .and('contain.text', 'GitHub Actions run ID');
    });
  });
});
