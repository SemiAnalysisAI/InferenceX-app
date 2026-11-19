import { expectPermanentRedirect } from '../support/redirect-contract';

describe('Compare-per-dollar canonical slug redirect', () => {
  beforeEach(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
  });

  it('redirects a non-canonical (reversed) GPU order to alphabetical canonical', () => {
    expectPermanentRedirect(
      '/compare-per-dollar/deepseek-r1-h100-vs-gb200',
      '/compare-per-dollar/deepseek-r1-gb200-vs-h100',
    );
  });
});
