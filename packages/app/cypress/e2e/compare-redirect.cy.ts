import { expectPermanentRedirect } from '../support/redirect-contract';

describe('Compare canonical slug redirect', () => {
  beforeEach(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
  });

  it('redirects a non-canonical (reversed) GPU order to alphabetical canonical', () => {
    // canonical alphabetical orders the GPUs → 'gb200-vs-h100', not 'h100-vs-gb200'
    expectPermanentRedirect(
      '/compare/deepseek-r1-h100-vs-gb200',
      '/compare/deepseek-r1-gb200-vs-h100',
    );
  });

  it('redirects a bare reversed GPU pair through both normalizations in one hop', () => {
    expectPermanentRedirect('/compare/h100-vs-gb200', '/compare/deepseek-r1-gb200-vs-h100');
  });

  it('redirects a family-level alias model slug to the canonical version slug', () => {
    expectPermanentRedirect('/compare/kimi-gb200-vs-h100', '/compare/kimi-k26-gb200-vs-h100');
  });

  it('preserves query params across the bare-slug redirect', () => {
    // Assert on the 308 itself, not the address bar after cy.visit: url-state.ts
    // deliberately strips share-link params from the URL once the chart has
    // snapshotted them, so the post-load address bar only kept the query by
    // accident of hydration ordering (the Next router's hydration replaceState
    // used to land after the strip and restore it).
    expectPermanentRedirect(
      '/compare/h100-vs-h200?i_seq=1k/1k',
      '/compare/deepseek-r1-h100-vs-h200?i_seq=1k%2F1k',
      false,
    );
  });
});
