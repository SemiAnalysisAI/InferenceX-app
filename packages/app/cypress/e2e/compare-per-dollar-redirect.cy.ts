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

  it('redirects a bare reversed GPU pair through both normalizations in one hop', () => {
    expectPermanentRedirect(
      '/compare-per-dollar/h100-vs-gb200',
      '/compare-per-dollar/deepseek-r1-gb200-vs-h100',
    );
  });

  it('redirects a family-level alias model slug to the canonical version slug', () => {
    expectPermanentRedirect(
      '/compare-per-dollar/kimi-gb200-vs-h100',
      '/compare-per-dollar/kimi-k26-gb200-vs-h100',
    );
  });

  it('preserves query params across the bare-slug redirect', () => {
    expectPermanentRedirect(
      '/compare-per-dollar/h100-vs-h200?i_seq=1k/1k',
      '/compare-per-dollar/deepseek-r1-h100-vs-h200?i_seq=1k%2F1k',
      false,
    );
  });
});
