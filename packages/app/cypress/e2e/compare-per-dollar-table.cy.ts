describe('Compare-per-dollar slug page — slimmed table + cross-link', () => {
  before(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
    // Visit the canonical model-prefixed URL directly so location assertions
    // don't fight the 308 redirect.
    cy.visit('/compare-per-dollar/deepseek-r1-gb200-vs-h100');
    cy.get('[data-testid="compare-interpolated-table"]').should('exist');
  });

  beforeEach(() => {
    cy.document().then((doc) => {
      delete doc.body.dataset.scrollLocked;
      doc.body.style.removeProperty('pointer-events');
    });
  });

  it('renders the interpolated table', () => {
    cy.get('[data-testid="compare-interpolated-table"]').should('be.visible');
  });

  it('shows only the Dollar-per-Million-Tokens and Concurrency metric rows', () => {
    // visibleMetricLabels filter narrows the four METRICS down to two; the
    // metricLabelOverrides prop renames "Cost ($/M tok)" to its full-English
    // form so the cell reads in line with the page's "Performance per Dollar"
    // framing. The original "Cost ($/M tok)" string must not appear.
    cy.get('[data-testid="compare-interpolated-table"] tbody').should(
      'contain.text',
      'Dollar per Million Tokens',
    );
    cy.get('[data-testid="compare-interpolated-table"] tbody').should(
      'contain.text',
      'Concurrency',
    );
    cy.get('[data-testid="compare-interpolated-table"] tbody').should(
      'not.contain.text',
      'Cost ($/M tok)',
    );
    cy.get('[data-testid="compare-interpolated-table"] tbody').should(
      'not.contain.text',
      'Throughput (tok/s/gpu)',
    );
    cy.get('[data-testid="compare-interpolated-table"] tbody').should(
      'not.contain.text',
      'tok/s/MW',
    );
  });

  it('exposes a "View full latency + throughput comparison" cross-link to /compare/', () => {
    cy.contains('a', 'View full latency + throughput comparison').should(
      'have.attr',
      'href',
      '/compare/deepseek-r1-gb200-vs-h100',
    );
  });

  it('uses "Performance per Dollar" framing in the page header', () => {
    cy.contains('Performance per Dollar').should('be.visible');
  });
});

describe('Compare slug page — cross-link to per-dollar view', () => {
  before(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
    cy.visit('/compare/deepseek-r1-gb200-vs-h100');
  });

  it('renders a cross-link to /compare-per-dollar/<same-slug>', () => {
    cy.contains('a', 'View performance-per-dollar view').should(
      'have.attr',
      'href',
      '/compare-per-dollar/deepseek-r1-gb200-vs-h100',
    );
  });
});
