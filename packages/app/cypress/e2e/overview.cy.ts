const MODEL_LABELS = [
  'DeepSeek V4 Pro 1.6T',
  'Kimi K2.5/2.6/2.7-Code 1T',
  'MiniMax M3 428B',
  'GLM5.2',
  'Qwen3.5 397B',
];

const PLATFORM_HEADERS = [
  'Model',
  'B200',
  'MI355X',
  'B300',
  'GB200 NVL72',
  'GB300 NVL72',
  'Details',
];

function expectNoHorizontalOverflow() {
  cy.document().then((doc) => {
    expect(doc.documentElement.scrollWidth).to.be.lte(doc.documentElement.clientWidth);
  });
}

function expectNoHorizontalScroller(testId: string) {
  cy.get(`[data-testid="${testId}"]`).then(([surface]) => {
    const scrollers = [surface, ...surface.querySelectorAll('*')]
      .filter(
        (el) =>
          !el.classList.contains('sr-only') &&
          getComputedStyle(el).display !== 'inline' &&
          el.scrollWidth > el.clientWidth + 1,
      )
      .map((el) => `${el.tagName} ${el.scrollWidth}>${el.clientWidth}`);
    expect(scrollers, `horizontally scrollable inside ${testId}`).to.deep.equal([]);
  });
}

function desktopModel(model: string) {
  return cy.get(`[data-testid="overview-desktop-model"][data-model="${model}"]`);
}

function mobileModel(model: string) {
  return cy.get(`[data-testid="overview-mobile-model"][data-model="${model}"]`);
}

function pair(pairId: string) {
  return cy.get(`[data-testid="overview-pair"][data-pair="${pairId}"]`);
}

describe('Overview page', () => {
  it('renders the full platform matrix for every active model', () => {
    cy.viewport(1280, 900);
    cy.visit('/overview');

    cy.get('[data-testid="chart-section-tabs"]').should('be.visible');
    cy.get('[data-testid="tab-trigger-overview"]')
      .should('have.attr', 'href', '/overview')
      .and('have.class', 'border-secondary');
    cy.get('[data-testid="nav-link-dashboard"]').should('have.class', 'text-brand');

    cy.contains('h1', 'AI Inference Overview').should('exist');
    cy.contains(
      'Every active model across MI355X, B200, B300, GB200 and GB300 at a glance.',
    ).should('exist');
    cy.contains('Best validated stack per platform').should('exist');
    cy.contains('Database snapshot through Jul 18').should('exist');
    cy.get('[data-testid="overview-desktop-matrix"]')
      .should('be.visible')
      .within(() => {
        cy.get('thead th').then(($headers) => {
          expect([...$headers].map((header) => header.textContent?.trim())).to.deep.equal(
            PLATFORM_HEADERS,
          );
        });
        cy.get('[data-testid="overview-desktop-model"]').should('have.length', MODEL_LABELS.length);
        cy.get('[data-testid="overview-baseline"]').should('have.length', MODEL_LABELS.length);
        cy.get('[data-testid="overview-pair"]').should('have.length', MODEL_LABELS.length * 4);
        cy.get('details, summary, button').should('not.exist');
        cy.contains(/PRIMARY|Ranked results/).should('not.exist');
      });
    for (const label of MODEL_LABELS) {
      cy.get('[data-testid="overview-desktop-matrix"]').should('contain.text', label);
    }
  });

  it('shows per-cell best reads with precision badges, dates, links, and matched deltas', () => {
    cy.viewport(1280, 900);
    cy.visit('/overview');

    desktopModel('Qwen-3.5-397B-A17B').within(() => {
      cy.get('[data-testid="overview-baseline"][data-hardware="b200"]')
        .should('contain.text', '900')
        .and('contain.text', 'FP8');
      pair('mi355x-vs-b200').within(() => {
        cy.contains('SGLang · FP8').should('exist');
        cy.get('[data-testid="overview-pair-value"][data-hardware="mi355x"]')
          .should('contain.text', '760')
          .find('a')
          .should('have.attr', 'title', 'MI355X · SGLang · FP8 · MTP');
        cy.get('[data-testid="overview-pair-value"][data-hardware="mi355x"] a')
          .should('have.attr', 'href')
          .and('include', 'g_model=Qwen-3.5-397B-A17B')
          .and('include', 'i_prec=fp8')
          .and('include', 'i_gpus=mi355x_sglang_mtp');
        cy.get('[data-testid="overview-pair-evidence-date"][data-hardware="mi355x"]').should(
          'have.text',
          'Jul 18',
        );
        cy.get('[data-testid="overview-pair-delta"]').should('have.text', '−16% vs B200');
        cy.contains('At 100, MI355X leads').should('exist');
      });
    });

    desktopModel('DeepSeek-V4-Pro').within(() => {
      cy.get('[data-testid="overview-baseline"][data-hardware="b200"]')
        .should('contain.text', '900')
        .and('contain.text', 'FP4');
      pair('b300-vs-b200').within(() => {
        cy.get('[data-testid="overview-pair-value"][data-hardware="b300"]').should(
          'contain.text',
          '1,122',
        );
        cy.get('[data-testid="overview-pair-evidence-date"][data-hardware="b300"]').should(
          'have.text',
          'Jun 24–Jul 4',
        );
        cy.get('[data-testid="overview-pair-delta"]').should('have.text', '+25% vs B200');
      });
    });
  });

  it('never mixes precisions or releases in a delta and says so instead', () => {
    cy.viewport(1280, 900);
    cy.visit('/overview');

    desktopModel('DeepSeek-V4-Pro').within(() => {
      pair('gb200-vs-b200').within(() => {
        cy.get('[data-testid="overview-pair-value"][data-hardware="gb200"]')
          .should('contain.text', '600')
          .parents('[data-testid="overview-pair"]')
          .should('contain.text', 'FP8');
        cy.get('[data-testid="overview-pair-mismatch"]').should(
          'have.text',
          'FP8 vs FP4 · no comparable delta',
        );
        cy.get('[data-testid="overview-pair-delta"]').should('not.exist');
      });
    });

    desktopModel('Qwen-3.5-397B-A17B').within(() => {
      pair('b300-vs-b200').within(() => {
        cy.get('[data-testid="overview-pair-value"][data-hardware="b300"]').should(
          'contain.text',
          '1,151',
        );
        cy.get('[data-testid="overview-pair-mismatch"]').should(
          'have.text',
          'FP4 vs FP8 · no comparable delta',
        );
        cy.get('[data-testid="overview-pair-delta"]').should('not.exist');
      });
    });
  });

  it('distinguishes candidate, baseline, and whole-row missing results without a percent', () => {
    cy.viewport(1280, 900);
    cy.visit('/overview');

    desktopModel('DeepSeek-V4-Pro').within(() => {
      pair('mi355x-vs-b200').within(() => {
        cy.get('[data-testid="overview-pair-missing"][data-hardware="mi355x"]')
          .should('contain.text', '∞')
          .and('have.attr', 'title', 'no exact @50 result');
      });
      pair('gb300-vs-b200').within(() => {
        cy.get('[data-testid="overview-pair-missing"][data-hardware="gb300"]')
          .should('contain.text', '∞')
          .and('have.attr', 'title', 'cannot reach @50');
      });
    });

    desktopModel('MiniMax-M3').within(() => {
      cy.get('[data-testid="overview-baseline"] [data-testid="overview-pair-missing"]')
        .should('contain.text', '∞')
        .and('have.attr', 'title', 'no 8K/1K data');
      pair('gb300-vs-b200').within(() => {
        cy.get('[data-testid="overview-pair-value"][data-hardware="gb300"]').should(
          'contain.text',
          '700',
        );
        cy.get('[data-testid="overview-pair-delta"]').should('not.exist');
        cy.get('[data-testid="overview-pair-mismatch"]').should('not.exist');
      });
    });

    desktopModel('Kimi-K2.5').within(() => {
      cy.get('[data-testid="overview-pair-missing"]').should('have.length', 5);
      cy.get('[data-testid="overview-pair-value"]').should('not.exist');
    });
    cy.contains('∞ = no comparable result').should('exist');
    cy.get('body')
      .invoke('text')
      .should('not.match', /∞\s*%/);
  });

  it('re-renders the whole matrix at the service level the URL names, via plain links', () => {
    cy.viewport(1280, 900);
    cy.visit('/overview');

    cy.get('[data-testid="overview-tier-switcher"]').within(() => {
      cy.get('[aria-current="page"]').should('have.text', '50');
      cy.get('a').should('have.length', 3);
      cy.contains('a', '30').should('have.attr', 'href', '/overview?tier=30');
      cy.contains('a', '100').should('have.attr', 'href', '/overview?tier=100').click();
    });

    cy.location('search').should('eq', '?tier=100');
    cy.contains('Output tok/s/GPU @100 tok/s/user').should('exist');
    cy.get('[data-testid="overview-tier-switcher"]').within(() => {
      cy.get('[aria-current="page"]').should('have.text', '100');
      cy.contains('a', '50').should('have.attr', 'href', '/overview');
    });

    desktopModel('Qwen-3.5-397B-A17B').within(() => {
      cy.get('[data-testid="overview-baseline"][data-hardware="b200"]')
        .should('contain.text', '432')
        .and('contain.text', 'FP8');
      pair('mi355x-vs-b200').within(() => {
        cy.get('[data-testid="overview-pair-value"][data-hardware="mi355x"]').should(
          'contain.text',
          '635',
        );
        cy.get('[data-testid="overview-pair-delta"]').should('have.text', '+47% vs B200');
        cy.contains('At 100, MI355X leads').should('not.exist');
      });
      pair('b300-vs-b200').within(() => {
        cy.get('[data-testid="overview-pair-missing"][data-hardware="b300"]')
          .should('contain.text', '∞')
          .and('have.attr', 'title', 'cannot reach @100');
      });
    });

    cy.visit('/overview?tier=30');
    desktopModel('DeepSeek-V4-Pro').within(() => {
      pair('b300-vs-b200').within(() => {
        cy.get('[data-testid="overview-pair-value"][data-hardware="b300"]').should(
          'contain.text',
          '1,300',
        );
        cy.get('[data-testid="overview-pair-delta"]').should('not.exist');
      });
      cy.get('[data-testid="overview-baseline"] [data-testid="overview-pair-missing"]')
        .should('contain.text', '∞')
        .and('have.attr', 'title', 'no exact @30 result');
    });
    cy.get('body')
      .invoke('text')
      .should('not.match', /∞\s*%/);

    cy.visit('/overview?tier=100');
    cy.contains('Output tok/s/GPU @100 tok/s/user').should('exist');
    cy.get('[data-testid="language-toggle"]')
      .should('have.attr', 'href', '/zh/overview?tier=100')
      .click();
    cy.location('pathname').should('eq', '/zh/overview');
    cy.location('search').should('eq', '?tier=100');
    cy.contains('每 GPU 输出 tok/s @100 tok/s/用户').should('exist');
  });

  it('uses the same cell semantics on mobile and fits both 390px and 320px widths', () => {
    for (const width of [390, 320]) {
      cy.viewport(width, 844);
      cy.visit('/overview');

      cy.get('[data-testid="mobile-chart-select"]').should('be.visible');
      cy.get('[data-testid="overview-mobile-list"]').should('be.visible');
      cy.get('[data-testid="overview-tier-switcher"]').should('be.visible');
      cy.get('[data-testid="overview-desktop-matrix"]').should('not.be.visible');
      mobileModel('Qwen-3.5-397B-A17B').within(() => {
        cy.get('[data-testid="overview-pair"]').should('have.length', 4);
        pair('mi355x-vs-b200').within(() => {
          cy.get('[data-testid="overview-pair-value"][data-hardware="mi355x"]').should(
            'contain.text',
            '760',
          );
          cy.get('[data-testid="overview-pair-delta"]').should('have.text', '−16% vs B200');
        });
      });
      expectNoHorizontalOverflow();
      expectNoHorizontalScroller('overview-mobile-list');
    }
  });

  it('renders the Chinese sibling with equivalent matrix copy and semantics', () => {
    cy.viewport(1280, 900);
    cy.visit('/zh/overview');

    cy.get('[data-testid="tab-trigger-overview"]')
      .should('have.attr', 'href', '/zh/overview')
      .and('contain.text', '总览');
    cy.contains('h1', 'AI 推理总览').should('exist');
    cy.contains('一眼对比各活跃模型在 MI355X、B200、B300、GB200 与 GB300 上的表现。').should(
      'exist',
    );
    cy.contains('各平台最佳验证配置').should('exist');
    desktopModel('Qwen-3.5-397B-A17B').within(() => {
      pair('mi355x-vs-b200').within(() => {
        cy.get('[data-testid="overview-pair-delta"]').should('have.text', '相对 B200 −16%');
        cy.contains('100 档由 MI355X 领先').should('exist');
      });
      pair('b300-vs-b200').within(() => {
        cy.get('[data-testid="overview-pair-mismatch"]').should(
          'have.text',
          'FP4 与 FP8 · 无可比差值',
        );
      });
    });
    cy.contains('∞ = 无可比结果').should('exist');

    cy.visit('/zh/overview?tier=100');
    cy.contains('每 GPU 输出 tok/s @100 tok/s/用户').should('exist');
    desktopModel('Qwen-3.5-397B-A17B').within(() => {
      pair('mi355x-vs-b200').within(() => {
        cy.get('[data-testid="overview-pair-delta"]').should('have.text', '相对 B200 +47%');
        cy.contains('100 档由 MI355X 领先').should('not.exist');
      });
    });
    cy.get('[data-testid="overview-tier-switcher"]').within(() => {
      cy.contains('a', '50').should('have.attr', 'href', '/zh/overview');
    });
  });
});
