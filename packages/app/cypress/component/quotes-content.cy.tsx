import { QuotesContent } from '@/components/quotes/quotes-content';
import { QUOTES } from '@/components/quotes/quotes-data';

/** Mirror of the anchor-id helper in quotes-content.tsx. */
function orgAnchorId(org: string): string {
  const slug = org
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, '-')
    .replaceAll(/^-|-$/gu, '');
  return `quote-${slug}`;
}

const uniqueOrgsWithLogo = [...new Set(QUOTES.filter((q) => q.logo).map((q) => q.org))];

describe('QuotesContent', () => {
  beforeEach(() => {
    cy.mount(<QuotesContent />);
  });

  it('renders a discrete separator between every quote (n - 1 separators)', () => {
    cy.get('blockquote').should('have.length', QUOTES.length);
    cy.get('hr').should('have.length', QUOTES.length - 1);
  });

  it('gives the first quote of each org a stable anchor id', () => {
    for (const org of uniqueOrgsWithLogo) {
      cy.get(`#${orgAnchorId(org)}`).should('exist');
    }
  });

  it('renders one jump button per unique org logo', () => {
    cy.get('button[aria-label^="Jump to"]').should('have.length', uniqueOrgsWithLogo.length);
  });

  it('scrolls to the matching quote when a logo is clicked', () => {
    const targetOrg = uniqueOrgsWithLogo[0];

    cy.window().then((win) => {
      cy.stub(win.Element.prototype, 'scrollIntoView').as('scrollIntoView');
    });

    cy.get(`button[aria-label="Jump to ${targetOrg}’s quote"]`).click();

    // Cypress auto-scrolls the clicked button into view too, so assert that at
    // least one call targeted the anchored quote element for that org.
    cy.get('@scrollIntoView').should((stub) => {
      const calls = (stub as unknown as { getCalls: () => { thisValue: Element }[] }).getCalls();
      const scrolledToAnchor = calls.some((c) => c.thisValue.id === orgAnchorId(targetOrg));
      expect(scrolledToAnchor, 'scrolled to the org anchor element').to.equal(true);
    });
  });
});
