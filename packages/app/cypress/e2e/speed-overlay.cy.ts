describe('Bus / Race Car Speed Overlay', () => {
  before(() => {
    cy.visit('/inference', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
    cy.get('[data-testid="scatter-graph"]').should('be.visible');
    cy.get('.sidebar-legend').first().should('be.visible');
  });

  it('toggle exists in the legend and is off by default', () => {
    cy.get('#scatter-speed-overlay').should('exist');
    cy.get('label[for="scatter-speed-overlay"]').should('contain.text', 'Bus / Race Car');
    cy.get('#scatter-speed-overlay').should('have.attr', 'data-state', 'unchecked');
    cy.get('[data-testid="speed-overlay-bus"]').should('not.exist');
    cy.get('[data-testid="speed-overlay-car"]').should('not.exist');
  });

  it('toggling on renders bus and car images on the chart', () => {
    cy.get('#scatter-speed-overlay').click();
    cy.get('#scatter-speed-overlay').should('have.attr', 'data-state', 'checked');
    cy.get('[data-testid="speed-overlay-bus"]').should('exist');
    cy.get('[data-testid="speed-overlay-car"]').should('exist');
  });

  it('default tput-vs-interactivity chart places bus top-left and car bottom-right', () => {
    cy.get('[data-testid="speed-overlay-bus"]').should('have.attr', 'data-corner', 'top-left');
    cy.get('[data-testid="speed-overlay-car"]').should('have.attr', 'data-corner', 'bottom-right');
  });

  it('switching to a cost metric flips the bus to bottom-left, car to top-right', () => {
    cy.get('[data-testid="yaxis-metric-selector"]').click({ force: true });
    cy.get('[role="option"]')
      .contains('Cost per Million Total Tokens (Owning - Hyperscaler)')
      .click({ force: true });
    cy.get('[data-testid="speed-overlay-bus"]').should('have.attr', 'data-corner', 'bottom-left');
    cy.get('[data-testid="speed-overlay-car"]').should('have.attr', 'data-corner', 'top-right');
  });

  it('switching to an input-token throughput (TTFT X) places bus top-right, car bottom-left', () => {
    cy.get('[data-testid="yaxis-metric-selector"]').click({ force: true });
    cy.get('[role="option"]').contains('Input Token Throughput per GPU').click({ force: true });
    cy.get('[data-testid="speed-overlay-bus"]').should('have.attr', 'data-corner', 'top-right');
    cy.get('[data-testid="speed-overlay-car"]').should('have.attr', 'data-corner', 'bottom-left');
  });

  it('toggling off removes the overlay images cleanly', () => {
    cy.get('#scatter-speed-overlay').click();
    cy.get('#scatter-speed-overlay').should('have.attr', 'data-state', 'unchecked');
    cy.get('[data-testid="speed-overlay-bus"]').should('not.exist');
    cy.get('[data-testid="speed-overlay-car"]').should('not.exist');
  });

  it('URL param i_speed=1 enables the overlay on first load', () => {
    cy.visit('/inference?i_speed=1', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
    cy.get('[data-testid="scatter-graph"]').should('be.visible');
    cy.get('#scatter-speed-overlay').should('have.attr', 'data-state', 'checked');
    cy.get('[data-testid="speed-overlay-bus"]').should('exist');
    cy.get('[data-testid="speed-overlay-car"]').should('exist');
  });
});

describe('Donkey / Elytra Minecraft Overlay', () => {
  before(() => {
    cy.visit('/inference', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
    cy.get('[data-testid="scatter-graph"]').should('be.visible');
    cy.get('.sidebar-legend').first().should('be.visible');
  });

  it('toggle exists in the legend and is independent of the bus/car toggle', () => {
    cy.get('#scatter-minecraft-overlay').should('exist');
    cy.get('label[for="scatter-minecraft-overlay"]').should('contain.text', 'Donkey / Elytra');
    cy.get('#scatter-minecraft-overlay').should('have.attr', 'data-state', 'unchecked');
    cy.get('[data-testid="speed-overlay-minecraft-slow"]').should('not.exist');
    cy.get('[data-testid="speed-overlay-minecraft-fast"]').should('not.exist');
  });

  it('toggling on renders the donkey-with-chest and elytra images', () => {
    cy.get('#scatter-minecraft-overlay').click();
    cy.get('#scatter-minecraft-overlay').should('have.attr', 'data-state', 'checked');
    cy.get('[data-testid="speed-overlay-minecraft-slow"]')
      .should('exist')
      .and('have.attr', 'href')
      .and('include', 'donkey-chest.png');
    cy.get('[data-testid="speed-overlay-minecraft-fast"]')
      .should('exist')
      .and('have.attr', 'href')
      .and('include', 'elytra.png');
  });

  it('donkey sits in the same corner as the bus would (batch-friendly side)', () => {
    cy.get('[data-testid="speed-overlay-minecraft-slow"]').should(
      'have.attr',
      'data-corner',
      'top-left',
    );
    cy.get('[data-testid="speed-overlay-minecraft-fast"]').should(
      'have.attr',
      'data-corner',
      'bottom-right',
    );
  });

  it('enabling both toggles stacks the second pair inward from the first', () => {
    cy.get('#scatter-speed-overlay').click();
    cy.get('#scatter-speed-overlay').should('have.attr', 'data-state', 'checked');
    cy.get('[data-testid="speed-overlay-bus"]').should('exist');
    cy.get('[data-testid="speed-overlay-minecraft-slow"]').should('exist');
    // Both pairs anchor to the same corner — the donkey sits inward (larger x)
    // when the slow corner is on the left.
    cy.get('[data-testid="speed-overlay-bus"]').then(($bus) => {
      const busX = Number($bus.attr('x'));
      cy.get('[data-testid="speed-overlay-minecraft-slow"]').then(($donkey) => {
        const donkeyX = Number($donkey.attr('x'));
        expect(donkeyX).to.be.greaterThan(busX);
      });
    });
  });

  it('URL param i_mc=1 enables the minecraft overlay on first load', () => {
    cy.visit('/inference?i_mc=1', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
    cy.get('[data-testid="scatter-graph"]').should('be.visible');
    cy.get('#scatter-minecraft-overlay').should('have.attr', 'data-state', 'checked');
    cy.get('[data-testid="speed-overlay-minecraft-slow"]').should('exist');
    cy.get('[data-testid="speed-overlay-minecraft-fast"]').should('exist');
    // Bus/car toggle is independent — should remain off and not render.
    cy.get('#scatter-speed-overlay').should('have.attr', 'data-state', 'unchecked');
    cy.get('[data-testid="speed-overlay-bus"]').should('not.exist');
  });
});

describe('Y-Axis Metric Search', () => {
  before(() => {
    cy.visit('/inference', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
    cy.get('[data-testid="scatter-graph"]').should('be.visible');
  });

  it('renders a search input inside the Y-axis selector dropdown', () => {
    cy.get('[data-testid="yaxis-metric-selector"]').click({ force: true });
    // Other selectors (legend, MultiSelect) reuse the "Search..." placeholder, so
    // scope every lookup to the open Y-axis dropdown's content.
    cy.get('[data-slot="select-content"]')
      .find('input[placeholder="Search..."]')
      .should('be.visible');
    cy.get('body').click(0, 0);
  });

  it('typing in the search filters the option list across groups', () => {
    cy.get('[data-testid="yaxis-metric-selector"]').click({ force: true });
    cy.get('[data-slot="select-content"]')
      .find('input[placeholder="Search..."]')
      .type('input token throughput');
    cy.get('[data-slot="select-content"]').find('[role="option"]').should('have.length', 2);
    cy.get('[data-slot="select-content"]')
      .find('[role="option"]')
      .first()
      .should('contain.text', 'Input Token Throughput');
    cy.get('body').click(0, 0);
  });

  it('selecting a filtered option applies the metric and closes the dropdown', () => {
    cy.get('[data-testid="yaxis-metric-selector"]').click({ force: true });
    cy.get('[data-slot="select-content"]')
      .find('input[placeholder="Search..."]')
      .type('cost per million total');
    cy.get('[data-slot="select-content"]')
      .find('[role="option"]')
      .contains('3 Year Rental')
      .click({ force: true });
    cy.get('[data-slot="select-content"]').should('not.exist');
    cy.get('[data-testid="yaxis-metric-selector"]').should('contain.text', '3 Year Rental');
  });
});
