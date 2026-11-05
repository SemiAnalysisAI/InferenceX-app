import { TCO_SOURCE_TITLE, TCO_SOURCE_URL } from '@semianalysisai/inferencex-constants';

describe('Compare-per-dollar slug page — slimmed table + cross-link', () => {
  before(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
    cy.visit('/compare-per-dollar/deepseek-r1-gb200-vs-h100');
    cy.get('[data-testid="compare-interpolated-table"]').should('exist');
  });

  beforeEach(() => {
    cy.document().then((doc) => {
      delete doc.body.dataset.scrollLocked;
      doc.body.style.removeProperty('pointer-events');
    });
  });

  it('shows only the Dollar-per-Million-Tokens and Concurrency metric rows', () => {
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

  it('attributes pricing to the shared TCO source', () => {
    cy.get('[data-testid="compare-per-dollar-pricing"]')
      .contains('a', TCO_SOURCE_TITLE)
      .should('have.attr', 'href', TCO_SOURCE_URL);
  });

  it('renders an indexable comparison PNG with descriptive alt text', () => {
    cy.get('[data-testid="compare-per-dollar-indexed-image"] img')
      .should('be.visible')
      .and('have.attr', 'src')
      .and(
        'match',
        /\/compare-per-dollar\/deepseek-r1-gb200-vs-h100\/performance-per-dollar\.png$/u,
      );
    cy.get('[data-testid="compare-per-dollar-indexed-image"] img')
      .should('have.attr', 'alt')
      .and('contain', 'cost per million tokens at matched interactivity levels');
  });
});

describe('Chinese compare-per-dollar table', () => {
  it('localizes the per-dollar metric label', () => {
    cy.visit('/zh/compare-per-dollar/deepseek-r1-gb200-vs-h100');
    cy.get('[data-testid="compare-interpolated-table"] tbody')
      .should('contain.text', '每百万 token 成本（美元）')
      .and('not.contain.text', 'Dollar per Million Tokens');
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
