import { QuotesContent } from '@/components/quotes/quotes-content';
import { SupporterLogoWall } from '@/components/quotes/supporter-logo-wall';
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

  it('keeps colored wall logos untouched and lifts black artwork in dark mode', () => {
    cy.mount(
      <div className="dark">
        <QuotesContent />
      </div>,
    );
    const wall = '[data-testid="supporter-logo-wall"]';
    for (const alt of ['NVIDIA', 'Google', 'Microsoft', 'Oracle']) {
      cy.get(`${wall} img[alt="${alt}"]`).each(($logo) => {
        expect(getComputedStyle($logo[0]).filter, `${alt} filter`).to.equal('none');
      });
    }
    for (const alt of ['OpenAI', 'Lambda', 'AMD']) {
      cy.get(`${wall} img[alt="${alt}"]`).should(($logo) => {
        const filter = getComputedStyle($logo[0]).filter;
        expect(filter, `${alt} filter`).to.contain('invert');
        expect(filter, `${alt} filter`).to.contain('hue-rotate');
        expect(filter, `${alt} filter`).not.to.contain('grayscale');
      });
    }
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
  it('shows supporter logos in full color and loads each image', () => {
    cy.mount(<QuotesContent />);
    cy.get('button[aria-label^="Jump to"] img').should('have.length.greaterThan', 0);
    cy.get('button[aria-label^="Jump to"] img, [data-testid="supporter-logo-wall"] img').each(
      ($img) => {
        const img = $img[0] as HTMLImageElement;
        expect(getComputedStyle(img).filter, img.alt).to.equal('none');
        cy.wrap($img).should(($el) => {
          expect(($el[0] as HTMLImageElement).naturalWidth, img.alt).to.be.greaterThan(0);
        });
      },
    );
  });

  it('shows logos bare, with square marks taller than wordmarks', () => {
    cy.mount(<QuotesContent />);
    const wall = '[data-testid="supporter-logo-wall"]';
    cy.get(`${wall} li`).each(($li) => {
      const box = $li.children()[0];
      const style = getComputedStyle(box);
      expect(style.backgroundColor, 'tile background').to.equal('rgba(0, 0, 0, 0)');
      expect(style.borderTopWidth, 'tile border').to.equal('0px');
      expect(style.boxShadow, 'tile ring').to.equal('none');
    });
    cy.get(`${wall} img[alt="OpenAI"]`).then(($mark) => {
      const mark = $mark[0].getBoundingClientRect();
      expect(mark.height, 'square mark height').to.be.at.least(40);
      cy.get(`${wall} img[alt="Lambda"]`).should(($word) => {
        const word = $word[0].getBoundingClientRect();
        expect(word.height).to.be.lessThan(mark.height);
        expect(word.width).to.be.greaterThan(mark.width);
      });
    });
  });

  it('stacks the group label above a wrapping row on phones', () => {
    cy.viewport(393, 852);
    cy.mount(<QuotesContent />);
    cy.get('[data-testid="supporter-group-hyperscalers-neoclouds"]').within(() => {
      cy.get('h3').then(($label) => {
        const label = $label[0].getBoundingClientRect();
        cy.get('li').each(($li) => {
          const li = $li[0].getBoundingClientRect();
          expect(li.top, 'logo below label').to.be.greaterThan(label.bottom - 1);
          expect(li.right, 'logo within phone width').to.be.at.most(393);
        });
      });
      cy.get('li').then(($lis) => {
        const rows = new Set([...$lis].map((li) => Math.round(li.getBoundingClientRect().top)));
        expect(rows.size, 'rows of logos').to.be.greaterThan(1);
      });
    });
  });

  it('links the managed providers to their quotes in both locales', () => {
    const providers = [
      'Together AI',
      'Fireworks AI',
      'GMI Cloud',
      'Nebius',
      'Baseten',
      'Crusoe',
      'Tensormesh',
      'Morph',
      'Doubleword',
      'Wafer',
    ];
    for (const locale of ['en', 'zh'] as const) {
      cy.viewport(375, 812);
      cy.mount(<QuotesContent locale={locale} />);
      const group = '[data-testid="supporter-group-managed-inference-providers"]';
      cy.get(group).scrollIntoView();
      cy.window().then((win) => {
        cy.stub(win.Element.prototype, 'scrollIntoView').as('providerScroll');
      });
      cy.get(`${group} img:visible`).should(($logos) => {
        expect([...$logos].map((logo) => logo.getAttribute('alt'))).to.deep.equal(providers);
        for (const logo of $logos) {
          const bounds = logo.getBoundingClientRect();
          expect(bounds.left).to.be.at.least(0);
          expect(bounds.right).to.be.at.most(375);
        }
      });
      for (const org of providers) {
        cy.get(`${group} img[alt="${org}"]:visible`).closest('button').click();
        cy.get('@providerScroll').should((stub) => {
          const calls = (
            stub as unknown as { getCalls: () => { thisValue: Element }[] }
          ).getCalls();
          expect(calls.at(-1)?.thisValue.id).to.equal(orgAnchorId(org));
        });
      }
      cy.get('#quote-together-ai').should('contain.text', 'Tri Dao');
      cy.get('#quote-morph').within(() => {
        cy.get('p').should(
          'have.text',
          locale === 'en'
            ? "“When you own your hardware, every serving decision shows up directly in your margins. InferenceX's open, reproducible benchmarks show how different accelerators and inference engines actually perform on real workloads, so smaller providers like us can make infra decisions with the same data as the biggest players. Nobody else shows acceptance length like these guys.”"
            : '“硬件是自己买的，每一项推理服务决策都会直接影响利润率。InferenceX 的开放、可复现基准测试展示了不同加速器和推理引擎在真实工作负载下的实际表现，让我们这样规模较小的服务商也能用和行业巨头一样的数据来做基础设施决策。还没有谁能像他们这样展示 acceptance length。”',
        );
        cy.get('footer').should('contain.text', 'Nicholas Khami').and('contain.text', 'Morph');
        cy.get('img[alt="Morph"]:visible').should(($logo) => {
          expect(($logo[0] as HTMLImageElement).naturalWidth).to.be.greaterThan(0);
        });
      });
      cy.get('[data-testid="supporter-group-other"] img[alt="Morph"]').should('not.exist');
      cy.get('@providerScroll').then((stub) => {
        (stub as unknown as { restore: () => void }).restore();
      });
    }
  });

  it('uses the official Morph wordmark without effects (en, light)', () => {
    for (const width of [375, 1440]) {
      cy.viewport(width, 900);
      cy.mount(<QuotesContent locale="en" />);
      for (const section of [
        '[data-testid="supporter-group-managed-inference-providers"]',
        '#quote-morph',
      ]) {
        cy.get(`${section} img[alt="Morph"]:visible`)
          .should('have.length', 1)
          .and('have.attr', 'src', '/logos/morph.svg');
        cy.get(`${section} img[alt="Morph"]:visible`).should(($images) => {
          const image = $images[0] as HTMLImageElement;
          expect(image.naturalWidth).to.equal(174);
          expect(image.naturalHeight).to.equal(48);
          expect(getComputedStyle(image).filter).to.equal('none');
          expect(getComputedStyle(image).opacity).to.equal('1');
          expect(getComputedStyle(image).backgroundColor).to.equal('rgb(10, 10, 10)');
          const rect = image.getBoundingClientRect();
          expect(rect.left).to.be.at.least(0);
          expect(rect.right).to.be.at.most(width);
        });
      }
      cy.get('#quote-morph').should('contain.text', 'Nicholas Khami');
    }
  });

  for (const locale of ['en', 'zh'] as const) {
    for (const theme of ['light', 'dark']) {
      it(`preserves the purple Fireworks mark in both locations (${locale}, ${theme})`, () => {
        for (const width of [375, 1440]) {
          cy.viewport(width, 900);
          cy.mount(
            <div className={theme}>
              <QuotesContent locale={locale} />
            </div>,
          );
          for (const section of [
            '[data-testid="supporter-group-managed-inference-providers"]',
            '#quote-fireworks-ai',
          ]) {
            cy.get(`${section} img[alt="Fireworks AI"]`).should(($images) => {
              const image = $images[0] as HTMLImageElement;
              expect(image.currentSrc).to.match(/\/logos\/fireworks-purple\.svg$/);
              expect(image.naturalWidth).to.be.greaterThan(0);
              expect(getComputedStyle(image).filter).to.equal('none');
              expect(getComputedStyle(image).opacity).to.equal('1');
              const bounds = image.getBoundingClientRect();
              expect(bounds.left).to.be.at.least(0);
              expect(bounds.right).to.be.at.most(width);
              const canvas = image.ownerDocument.createElement('canvas');
              canvas.width = 64;
              canvas.height = 32;
              const ctx = canvas.getContext('2d')!;
              ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
              const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
              let opaquePixels = 0;
              let incorrectPixels = 0;
              for (let i = 0; i < pixels.length; i += 4) {
                if (pixels[i + 3] === 255) {
                  opaquePixels++;
                  if (pixels[i] !== 103 || pixels[i + 1] !== 32 || pixels[i + 2] !== 255) {
                    incorrectPixels++;
                  }
                }
              }
              expect(opaquePixels).to.be.greaterThan(0);
              expect(incorrectPixels).to.equal(0);
            });
          }
          cy.get('#quote-fireworks-ai').should('contain.text', 'Dmytro Dzhulgakov');
        }
      });
    }
  }
});

const wallLogo = (label: string) => ({ label, logo: 'nvidia-color.svg' });
const rowsOf = (id: string) =>
  cy.get(`[data-testid="supporter-group-${id}"] ul`).then(($ul) => {
    const list = $ul[0].getBoundingClientRect();
    const rows = new Map<number, DOMRect[]>();
    for (const li of $ul[0].querySelectorAll('li')) {
      const box = li.getBoundingClientRect();
      const top = Math.round(box.top);
      rows.set(top, [...(rows.get(top) ?? []), box]);
    }
    return { list, rows: [...rows.values()] };
  });

describe('SupporterLogoWall rows', () => {
  it('balances uneven groups across rows and centers the shorter row', () => {
    cy.viewport(1400, 800);
    cy.mount(
      <SupporterLogoWall
        groups={[
          {
            id: 'nine',
            label: { en: 'Nine', zh: 'Nine' },
            desktopColumns: 8,
            logos: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map(wallLogo),
          },
          {
            id: 'eleven',
            label: { en: 'Eleven', zh: 'Eleven' },
            desktopColumns: 6,
            logos: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k'].map(wallLogo),
          },
        ]}
      />,
    );
    for (const [id, sizes] of [
      ['nine', [5, 4]],
      ['eleven', [6, 5]],
    ] as const) {
      rowsOf(id).then(({ list, rows }) => {
        expect(
          rows.map((r) => r.length),
          id,
        ).to.deep.equal(sizes);
        const listCenter = (list.left + list.right) / 2;
        for (const row of rows) {
          const center = (row[0].left + row.at(-1)!.right) / 2;
          expect(center, `${id} row centered`).to.be.closeTo(listCenter, 2);
        }
      });
    }
  });
});
