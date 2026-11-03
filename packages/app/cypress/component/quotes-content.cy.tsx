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

  it('provides a jump button for every quoted organization with a logo', () => {
    cy.get('button[aria-label^="Jump to"]').should(($buttons) => {
      const labels = new Set([...$buttons].map((button) => button.getAttribute('aria-label')));
      expect([...labels].sort()).to.deep.equal(
        uniqueOrgsWithLogo.map((org) => `Jump to ${org}’s quote`).sort(),
      );
    });
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

  it('renders Bill Jia’s Google quote with localized attribution and a working logo jump', () => {
    for (const locale of ['en', 'zh'] as const) {
      cy.mount(<QuotesContent locale={locale} />);
      cy.get('#quote-google').within(() => {
        cy.get('p').should(
          'have.text',
          locale === 'en'
            ? '“Making AI infrastructure accessible to more developers starts with measuring how real-world, multi-turn agentic workloads, including context growth and prefix-cache reuse, perform in production. We welcome open-source, reproducible benchmarks like InferenceX that highlight the cost efficiency and interactivity of Google TPUs, running open software, giving developers transparent data to deploy at scale and with confidence.”'
            : '“要让更多开发者用上 AI 基础设施，首先需要测量真实的多轮智能体工作负载在生产环境中的表现，包括上下文增长和前缀缓存复用。我们欢迎 InferenceX 这样的开源、可复现基准测试，展示 Google TPU 运行开放软件时的成本效率和交互性能，为开发者提供透明的数据，让他们有信心进行大规模部署。”',
        );
        cy.get('footer')
          .should('contain.text', 'Bill Jia')
          .and(
            'contain.text',
            locale === 'en' ? 'VP of Engineering at Google' : 'Google 工程副总裁',
          );
        cy.get('img[alt="Google"]')
          .should('have.attr', 'src', '/logos/google-color.svg')
          .and(($logo) => {
            expect(($logo[0] as HTMLImageElement).naturalWidth).to.be.greaterThan(0);
          });
      });
      cy.window().then((win) => {
        cy.stub(win.Element.prototype, 'scrollIntoView').as('googleScroll');
      });
      cy.get('[data-testid="supporter-group-us-frontier-labs"] img[alt="Google"]')
        .closest('button')
        .click();
      cy.get('@googleScroll').should((stub) => {
        const calls = (stub as unknown as { getCalls: () => { thisValue: Element }[] }).getCalls();
        expect(calls.some((call) => call.thisValue.id === 'quote-google')).to.equal(true);
      });
      cy.get('@googleScroll').then((stub) => {
        (stub as unknown as { restore: () => void }).restore();
      });
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
  it('omits TokenSpeed while retaining the SGLang and vLLM logos in both locales', () => {
    for (const locale of ['en', 'zh'] as const) {
      cy.mount(<QuotesContent locale={locale} />);
      cy.get('[data-testid="supporter-logo-wall"]').within(() => {
        cy.get('img[alt="TokenSpeed"]').should('not.exist');
        cy.get('[data-testid="supporter-group-open-source"]').within(() => {
          for (const org of ['SGLang', 'vLLM']) {
            cy.get(`img[alt="${org}"]`)
              .should('be.visible')
              .and(($logo) => {
                expect(($logo[0] as HTMLImageElement).naturalWidth).to.be.greaterThan(0);
              });
          }
        });
      });
    }
  });

  const groupIds = [
    'ai-accelerators',
    'chinese-frontier-labs',
    'us-frontier-labs',
    'hyperscalers-neoclouds',
    'managed-inference-providers',
    'open-source',
    'other',
  ];

  it('renders every group with a bilingual heading', () => {
    cy.mount(<QuotesContent />);
    cy.get('[data-testid="supporter-logo-wall"] h3').should('have.length', groupIds.length);
    for (const id of groupIds) cy.get(`[data-testid="supporter-group-${id}"]`).should('exist');
    cy.get('[data-testid="supporter-logo-wall"] h3').should(($headings) => {
      expect([...$headings].map((heading) => heading.textContent)).to.deep.equal([
        'AI Accelerators',
        'Chinese Frontier Labs',
        'US Frontier Labs & NeoLabs',
        'Hyperscalers & Neoclouds',
        'Managed Inference Providers',
        'Open Source',
        'Other',
      ]);
    });

    cy.mount(<QuotesContent locale="zh" />);
    cy.get('[data-testid="supporter-group-other"] h3').should('have.text', '其他');
    cy.get('[data-testid="supporter-group-chinese-frontier-labs"] h3').should(
      'have.text',
      '中国前沿实验室',
    );
    cy.get('button[aria-label="查看 OpenAI 的评价"]').should('exist');
    cy.get('[data-testid="supporter-group-us-frontier-labs"] h3').should(
      'have.text',
      '美国前沿实验室与 NeoLabs',
    );
    cy.get('[data-testid="supporter-group-managed-inference-providers"] h3').should(
      'have.text',
      '托管推理服务商',
    );
  });

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
      .find('img[alt="Kimi"]')
      .closest('button')
      .should('not.exist');
    cy.get('[data-testid="supporter-logo-wall"] img[alt="DeepSeek"]').should('not.exist');
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

  it('lays out cloud providers in two desktop rows and preserves the requested groups', () => {
    cy.viewport(1568, 1000);
    cy.mount(<QuotesContent />);
    cy.get('[data-testid="supporter-group-hyperscalers-neoclouds"] li').should(($lis) => {
      const rows = new Map<number, number>();
      for (const li of $lis) {
        const top = Math.round(li.getBoundingClientRect().top);
        rows.set(top, (rows.get(top) ?? 0) + 1);
      }
      expect([...rows.values()]).to.deep.equal([8, 7]);
    });
    cy.get('[data-testid="supporter-group-other"]').within(() => {
      cy.get('img[alt="Supermicro"]').should('be.visible');
      cy.get('img[alt="Baseten"]').should('not.exist');
      cy.get('img[alt="Tensormesh"]').should('not.exist');
      cy.get('img[alt="EmbeddedLLM"]').should('not.exist');
    });
    cy.get('[data-testid="supporter-group-us-frontier-labs"]').within(() => {
      for (const alt of ['Prime Intellect', 'Adaptive ML', 'Periodic Labs']) {
        cy.get(`img[alt="${alt}"]`).should('be.visible');
      }
    });
    cy.get('[data-testid="supporter-group-hyperscalers-neoclouds"]').within(() => {
      for (const alt of ['Core42', 'Verda', 'Vultr']) {
        cy.get(`img[alt="${alt}"]`).should('be.visible');
      }
    });
    cy.get('[data-testid="supporter-group-open-source"] img[alt="Red Hat"]').should('be.visible');
    cy.get('[data-testid="supporter-group-open-source"] img[alt="EmbeddedLLM"]').should(
      'be.visible',
    );
    cy.get('[data-testid="supporter-logo-wall"]')
      .find('[data-testid^="supporter-group-"]')
      .first()
      .should('have.attr', 'data-testid', 'supporter-group-ai-accelerators');
    cy.get('[data-testid="supporter-group-ai-accelerators"] img').should(($logos) => {
      expect([...$logos].map((logo) => logo.getAttribute('alt'))).to.deep.equal([
        'Google',
        'AMD',
        'NVIDIA',
        'SambaNova',
      ]);
    });
  });

  it('links the six managed providers to their existing quotes in both locales', () => {
    const providers = ['Together AI', 'GMI Cloud', 'Nebius', 'Baseten', 'Crusoe', 'Tensormesh'];
    for (const locale of ['en', 'zh'] as const) {
      cy.viewport(375, 812);
      cy.mount(<QuotesContent locale={locale} />);
      const group = '[data-testid="supporter-group-managed-inference-providers"]';
      cy.get(group).scrollIntoView();
      cy.window().then((win) => {
        cy.stub(win.Element.prototype, 'scrollIntoView').as('providerScroll');
      });
      cy.get(`${group} img`).should(($logos) => {
        expect([...$logos].map((logo) => logo.getAttribute('alt'))).to.deep.equal(providers);
        for (const logo of $logos) {
          const bounds = logo.getBoundingClientRect();
          expect(bounds.left).to.be.at.least(0);
          expect(bounds.right).to.be.at.most(375);
        }
      });
      for (const org of providers) {
        cy.get(`${group} img[alt="${org}"]`).closest('button').click();
        cy.get('@providerScroll').should((stub) => {
          const calls = (
            stub as unknown as { getCalls: () => { thisValue: Element }[] }
          ).getCalls();
          expect(calls.at(-1)?.thisValue.id).to.equal(orgAnchorId(org));
        });
      }
      cy.get('#quote-together-ai').should('contain.text', 'Tri Dao');
      cy.get('@providerScroll').then((stub) => {
        (stub as unknown as { restore: () => void }).restore();
      });
    }
  });
});
