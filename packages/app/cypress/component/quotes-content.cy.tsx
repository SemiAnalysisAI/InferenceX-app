import { QuotesContent } from '@/components/quotes/quotes-content';
import { QUOTES } from '@/components/quotes/quotes-data';

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

  it('renders the Mooncake team quote with the KVCache.AI identity', () => {
    cy.get('#quote-mooncake').within(() => {
      cy.contains('Mooncake makes KV cache a first-class system resource').should('be.visible');
      cy.contains('a', 'Mooncake Team')
        .should('have.attr', 'href', 'https://kvcache.ai/')
        .and('have.attr', 'target', '_blank');
      cy.get('img[alt="Mooncake"]')
        .should('have.attr', 'src', '/logos/kvcache-ai.svg')
        .and(($logo) => {
          expect(($logo[0] as HTMLImageElement).naturalWidth).to.be.greaterThan(0);
        });
    });

    cy.mount(<QuotesContent locale="zh" />);
    cy.get('#quote-mooncake').should(
      'contain.text',
      'Mooncake 将 KV cache 作为分离式 LLM 推理中的一等系统资源',
    );
  });

  it('renders Seiji Eicher’s Anyscale quote and loads its logo in both locales', () => {
    for (const locale of ['en', 'zh'] as const) {
      cy.mount(<QuotesContent locale={locale} />);
      cy.get('#quote-anyscale').within(() => {
        cy.contains('Seiji Eicher').should('be.visible');
        cy.contains(
          locale === 'en'
            ? "Ray Serve LLM's mission is to be best way"
            : 'Ray Serve LLM 的使命是成为',
        ).should('be.visible');
        cy.get('img[alt="Anyscale"]')
          .should('have.attr', 'src', '/logos/anyscale.svg')
          .and(($logo) => {
            expect(($logo[0] as HTMLImageElement).naturalWidth).to.be.greaterThan(0);
          });
      });
      cy.get('button').find('img[alt="Anyscale"]').should('have.length', 1);
    }
  });

  it('shows supporter logos in full color in light mode', () => {
    cy.get('button[aria-label^="Jump to"] img').each(($logo) => {
      const style = getComputedStyle($logo[0]);
      expect(style.filter, `${$logo.attr('alt')} filter`).to.equal('none');
      expect(style.opacity, `${$logo.attr('alt')} opacity`).to.equal('1');
    });
    cy.get('blockquote')
      .first()
      .closest('[id^="quote-"]')
      .find('img')
      .first()
      .should(($logo) => {
        expect(getComputedStyle($logo[0]).filter).to.equal('none');
      });
  });

  it('keeps wall logos in color on a light tile in dark mode', () => {
    cy.mount(
      <div className="dark">
        <QuotesContent />
      </div>,
    );
    cy.get('button[aria-label^="Jump to"] img').each(($logo) => {
      expect(getComputedStyle($logo[0]).filter, `${$logo.attr('alt')} filter`).to.equal('none');
      const tile = $logo[0].closest('button')!;
      expect(getComputedStyle(tile).backgroundColor, 'tile background').to.equal(
        'rgb(255, 255, 255)',
      );
    });
    cy.get('#quote-anyscale img[alt="Anyscale"]').should(($logo) => {
      const filter = getComputedStyle($logo[0]).filter;
      expect(filter).to.contain('grayscale');
      expect(filter).to.contain('invert');
    });
  });

  it('scrolls to the matching quote when a logo is clicked', () => {
    const targetOrg = uniqueOrgsWithLogo[0];

    cy.window().then((win) => {
      cy.stub(win.Element.prototype, 'scrollIntoView').as('scrollIntoView');
    });

    cy.get(`button[aria-label="Jump to ${targetOrg}’s quote"]`).click();

    cy.get('@scrollIntoView').should((stub) => {
      const calls = (stub as unknown as { getCalls: () => { thisValue: Element }[] }).getCalls();
      const scrolledToAnchor = calls.some((c) => c.thisValue.id === orgAnchorId(targetOrg));
      expect(scrolledToAnchor, 'scrolled to the org anchor element').to.equal(true);
    });
  });
});

describe('QuotesContent supporter logo wall', () => {
  const groupIds = [
    'chinese-frontier-labs',
    'us-labs',
    'hyperscalers-clouds',
    'open-source',
    'silicon-neoclouds-academia',
    'other',
  ];

  it('renders every group with a bilingual heading', () => {
    cy.mount(<QuotesContent />);
    cy.get('[data-testid="supporter-logo-wall"] h3').should('have.length', groupIds.length);
    for (const id of groupIds) cy.get(`[data-testid="supporter-group-${id}"]`).should('exist');
    cy.get('[data-testid="supporter-group-other"] h3').should('have.text', 'Other');

    cy.mount(<QuotesContent locale="zh" />);
    cy.get('[data-testid="supporter-group-other"] h3').should('have.text', '其他');
    cy.get('[data-testid="supporter-group-chinese-frontier-labs"] h3').should(
      'have.text',
      '中国前沿实验室',
    );
    cy.get('button[aria-label="查看 OpenAI 的评价"]').should('exist');
  });

  it('shows supporter logos in full color and loads each image', () => {
    cy.mount(<QuotesContent />);
    cy.get('button[aria-label^="Jump to"] img').should('have.length.greaterThan', 0);
    cy.get('button[aria-label^="Jump to"] img, [data-testid="supporter-logo-wall"] img').each(
      ($img) => {
        const img = $img[0] as HTMLImageElement;
        expect(img.className, img.alt).not.to.match(/grayscale|invert/);
        expect(getComputedStyle(img).filter, img.alt).to.equal('none');
        cy.wrap($img).should(($el) => {
          expect(($el[0] as HTMLImageElement).naturalWidth, img.alt).to.be.greaterThan(0);
        });
      },
    );
  });

  it('puts quoted orgs outside the curated groups under Other', () => {
    cy.mount(<QuotesContent />);
    cy.get('[data-testid="supporter-group-other"]').within(() => {
      cy.get('button[aria-label="Jump to WEKA’s quote"]').should('exist');
      cy.get('button[aria-label="Jump to OpenAI’s quote"]').should('not.exist');
    });
  });

  it('renders logos without a quote as static tiles', () => {
    cy.mount(<QuotesContent />);
    cy.get('[data-testid="supporter-group-chinese-frontier-labs"]')
      .find('img[alt="DeepSeek"]')
      .closest('button')
      .should('not.exist');
  });
});
