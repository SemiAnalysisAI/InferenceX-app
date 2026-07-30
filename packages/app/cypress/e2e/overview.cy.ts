// Order mirrors DEFAULT_MODELS (MODEL_CONFIG insertion order), which fixes the
// matrix row order.
const MODEL_LABELS = [
  'DeepSeek V4 Pro 1.6T',
  'Kimi K3 2.8T',
  'Kimi K2.5/2.6/2.7-Code 1T',
  'MiniMax M3 428B',
  'GLM5.2',
  'Qwen3.5 397B',
];

const PLATFORM_HEADERS = [
  'Model · Scenario',
  'B200 · Reference',
  'MI355X',
  'B300',
  'GB200',
  'GB300',
  'Details',
];

const SCOPE_LINE = 'Hyperscaler cost / 1M total tokens · ↓ lower is better';
const SCOPE_LINE_ZH = '超大规模云（hyperscaler）成本 / 每百万总 token · ↓ 越低越好';

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

/** Visible dates and snapshot framing must be gone; evidence stays in labels. */
function expectNoVisibleDatesOrSnapshot() {
  cy.get('[data-testid="overview-pair-evidence-date"]').should('not.exist');
  cy.get('body')
    .invoke('text')
    .should((text) => {
      expect(text).not.to.match(/Database snapshot/i);
      expect(text).not.to.match(/快照/);
      expect(text).not.to.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d/);
      expect(text).not.to.match(/\d+月\d+日/);
      expect(text).not.to.match(/20\d\d-\d\d-\d\d/);
    });
}

function desktopModel(model: string) {
  return cy.get(`[data-testid="overview-desktop-model"][data-model="${model}"]`);
}

function mobileModel(model: string) {
  return cy.get(`[data-testid="overview-mobile-model"][data-model="${model}"]`);
}

function platform(hardware: string) {
  return cy.get(`[data-testid="overview-platform"][data-hardware="${hardware}"]`);
}

function textRect(element: Element) {
  const view = element.ownerDocument.defaultView;
  if (view === null) throw new Error('Element has no window');
  const walker = element.ownerDocument.createTreeWalker(element, view.NodeFilter.SHOW_TEXT);
  const text = walker.nextNode();
  if (text === null) throw new Error('Element has no text node');
  const range = element.ownerDocument.createRange();
  range.selectNodeContents(text);
  return range.getBoundingClientRect();
}

describe('Overview page', () => {
  it('defaults to community engine scope and switches with canonical links preserving tier and locale', () => {
    cy.viewport(1280, 900);
    cy.visit('/overview');

    cy.get('[data-testid="overview-engine-scope-switcher"]')
      .should('have.attr', 'aria-label', 'Engine scope')
      .within(() => {
        cy.get('[data-overview-engine-scope="community"]')
          .should('have.attr', 'aria-current', 'true')
          .and('match', 'span')
          .and('have.text', 'Open Source Community Engines (vLLM/SGLang)')
          .and('not.have.attr', 'href');
        cy.get('[data-overview-engine-scope="all"]')
          .should('have.attr', 'href', '/overview?engine=all')
          .and('have.text', 'All Platforms');
      });

    cy.get('[data-testid="overview-tier-switcher"]').then(([tier]) => {
      cy.get('[data-testid="overview-engine-scope-switcher"]').then(([scope]) => {
        const tierRect = tier.getBoundingClientRect();
        const scopeRect = scope.getBoundingClientRect();
        expect((scopeRect.top + scopeRect.bottom) / 2).to.be.closeTo(
          (tierRect.top + tierRect.bottom) / 2,
          8,
        );
      });
    });

    desktopModel('GLM-5.2').within(() => {
      cy.get('[data-testid="overview-model-scenario"]').should('have.text', 'AgentX');
      cy.get('[data-testid="overview-pair-missing"]').should('have.length', 5);
    });
    cy.get(
      '[data-testid="overview-engine-scope-switcher"] [data-overview-engine-scope="all"]',
    ).click();
    cy.location('search').should('eq', '?engine=all');
    desktopModel('GLM-5.2').find('[data-testid="overview-pair-missing"]').should('have.length', 5);
    cy.get('[data-testid="overview-tier-switcher"]')
      .contains('a', '100')
      .should('have.attr', 'href', '/overview?tier=100&engine=all')
      .click();
    cy.location('search').should('eq', '?tier=100&engine=all');

    cy.get('[data-testid="overview-engine-scope-switcher"]')
      .find('[data-overview-engine-scope="community"]')
      .should('have.attr', 'href', '/overview?tier=100');
    cy.get('[data-testid="language-toggle"]')
      .should('have.attr', 'href', '/zh/overview?tier=100&engine=all')
      .click();
    cy.location('pathname').should('eq', '/zh/overview');
    cy.location('search').should('eq', '?tier=100&engine=all');
    cy.get('[data-testid="overview-engine-scope-switcher"]').within(() => {
      cy.get('[data-overview-engine-scope="all"]')
        .should('have.attr', 'aria-current', 'true')
        .and('match', 'span')
        .and('have.text', '所有平台')
        .and('not.have.attr', 'href');
      cy.get('[data-overview-engine-scope="community"]').should(
        'have.text',
        '开源社区引擎（vLLM/SGLang）',
      );
    });
  });

  it('prefers speculative decode and falls back to labelled standard-decode reads', () => {
    cy.viewport(1280, 900);
    cy.visit('/overview');

    desktopModel('Kimi-K2.5').within(() => {
      cy.get('[data-testid="overview-pair-value"]').should('have.length', 3);
      cy.get('[data-testid="overview-pair-missing"]')
        .should('have.length', 2)
        .then(($missing) => {
          expect([...$missing].map((element) => element.getAttribute('title'))).to.deep.equal([
            'no data for this scenario',
            'no data for this scenario',
          ]);
        });
      cy.get('[data-testid="overview-pair-missing"]')
        .children('[aria-hidden="true"]')
        .should('have.length', 2)
        .and('have.text', '——');
      platform('b200').should('contain.text', 'Standard decode');
      platform('mi355x').should('contain.text', 'Standard decode');
      platform('b300').should('contain.text', 'Standard decode');
    });

    desktopModel('DeepSeek-V4-Pro').within(() => {
      cy.contains('Spec decode (MTP)').should('exist');
      platform('b200').within(() => {
        // The estimated cost is itself the evidence link; the run date lives in
        // its hover/focus/screen-reader label, never as visible text.
        cy.get(
          '[data-testid="overview-pair-value"][data-hardware="b200"] [data-testid="overview-cost-evidence-link"]',
        )
          .should(
            'have.attr',
            'title',
            'Estimated from validated benchmark runs. Open raw source dashboard for Jul 18: DeepSeek V4 Pro 1.6T · B200 · SGLang · FP4 · MTP',
          )
          .and(
            'have.attr',
            'aria-label',
            'Approximately $0.067. Estimated from validated benchmark runs. Open raw source dashboard for Jul 18: DeepSeek V4 Pro 1.6T · B200 · SGLang · FP4 · MTP',
          );
        cy.get(
          '[data-testid="overview-pair-value"][data-hardware="b200"] [data-testid="overview-estimate-visible"]',
        ).should('have.text', '≈$0.067');
        cy.get('[data-testid="overview-pair-missing"]').should('not.exist');
      });
      // GB300's two points are a single-node and a multi-node aggregate
      // deployment. They are separate serving series, so neither interpolates
      // to the tier and the cell stays empty instead of blending them.
      platform('gb300').within(() => {
        cy.get('[data-testid="overview-pair-value"]').should('not.exist');
        cy.get('[data-testid="overview-pair-missing"][data-hardware="gb300"]').should(
          'have.attr',
          'title',
          'no exact @50 result',
        );
      });
    });
    desktopModel('MiniMax-M3').within(() => {
      platform('gb300').should('contain.text', 'Spec decode (M3 EAGLE)');
    });
    cy.contains(
      'Priority: speculative FP4 → speculative FP8 → standard FP4 → standard FP8.',
    ).should('exist');
    cy.get('body').should('not.contain.text', 'P90');
  });

  it('color-grades the cost delta against B200 and badges a missing baseline with a neutral ∞', () => {
    cy.viewport(1280, 900);
    cy.visit('/overview');

    desktopModel('Qwen-3.5-397B-A17B').within(() => {
      platform('b200').find('[data-testid="overview-cost-delta"]').should('not.exist');
      platform('mi355x')
        .find('[data-testid="overview-cost-delta"]')
        .should('contain.text', '25%')
        .and('have.attr', 'data-cost-polarity', 'cheaper')
        .then(($badge) => {
          expect($badge.attr('style')).to.contain('rgb(16 185 129 /');
        });
    });

    desktopModel('DeepSeek-V4-Pro').within(() => {
      platform('gb200')
        .find('[data-testid="overview-cost-delta"]')
        .should('contain.text', '+80%')
        .and('have.attr', 'data-cost-polarity', 'pricier')
        .then(($badge) => {
          // +80% saturates the alpha ramp; read the computed value so the
          // assertion survives the browser normalizing `0.40` to `0.4`.
          expect(getComputedStyle($badge[0]).backgroundColor).to.equal('rgba(239, 68, 68, 0.4)');
        });
      // No read at the tier means no delta to grade.
      platform('gb300').find('[data-testid="overview-cost-delta"]').should('not.exist');
    });

    // Priced result with no B200 baseline: the relative badge shows a neutral
    // gray ∞ — availability, not a good/bad judgment, so no red/green tint.
    desktopModel('MiniMax-M3').within(() => {
      platform('gb300')
        .find('[data-testid="overview-cost-delta"]')
        .should('contain.text', '∞')
        .and('have.attr', 'data-cost-polarity', 'no-baseline')
        .and('have.attr', 'title', 'No B200 baseline to compare against')
        .then(($badge) => {
          expect($badge.attr('style') ?? '').not.to.contain('background');
          const color = getComputedStyle($badge[0]).color;
          const [r, g, b] = color.match(/\d+/g)!.map(Number);
          // Neutral gray: no channel dominates the way the red/green ramps do.
          expect(Math.max(r, g, b) - Math.min(r, g, b)).to.be.lessThan(30);
        });
    });

    // Within the ±5% parity band the badge reads as even, not polarity.
    desktopModel('Kimi-K2.5').within(() => {
      platform('b300')
        .find('[data-testid="overview-cost-delta"]')
        .should('contain.text', '+2%')
        .and('have.attr', 'data-cost-polarity', 'even');
    });
  });

  it('renders the full platform matrix for every active model', () => {
    cy.viewport(1280, 900);
    cy.visit('/overview');

    cy.get('[data-testid="chart-section-tabs"]').should('be.visible');
    cy.get('[data-testid="tab-trigger-overview"]')
      .should('have.attr', 'href', '/overview')
      .and('have.class', 'border-secondary');
    cy.get('[data-testid="nav-link-dashboard"]').should('have.class', 'text-brand');

    cy.contains('h1', 'Inference Cost Overview').should('exist');
    cy.contains(
      'Every active model across MI355X, B200, B300, GB200 and GB300 at a glance.',
    ).should('exist');
    cy.contains(
      'Cost per million total tokens from each platform’s best observed serving envelope',
    ).should('exist');
    cy.get('[data-testid="overview-scope"]')
      .should('have.text', SCOPE_LINE)
      .and('not.contain.text', 'tok/s/user')
      .and('not.contain.text', '8K→1K');
    cy.contains(
      'Cost = hyperscaler $/GPU/hr ÷ total tok/s per deployed GPU. Percentages compare against B200.',
    ).should('exist');
    cy.contains('— = no result. ∞ = B200 baseline unavailable.').should('exist');
    cy.contains(
      'Disaggregated results include both prefill and decode GPUs in the denominator.',
    ).should('exist');
    cy.contains(
      'Tier values use the best observed platform serving envelope; ≈ marks estimates between validated runs. No extrapolation.',
    ).should('exist');
    expectNoVisibleDatesOrSnapshot();
    cy.get('[data-testid="overview-pair-topology"]').should('not.exist');
    cy.get('body')
      .invoke('text')
      .should('not.match', /fallback/i);
    cy.get('body')
      .invoke('text')
      .should('not.match', /At 100, .+ leads/);
    cy.get('[data-testid="overview-desktop-matrix"]')
      .should('be.visible')
      .within(() => {
        cy.get('thead th').then(($headers) => {
          expect([...$headers].map((header) => header.textContent?.trim())).to.deep.equal(
            PLATFORM_HEADERS,
          );
        });
        cy.get('[data-testid="overview-desktop-model"]').should('have.length', MODEL_LABELS.length);
        cy.get('[data-testid="overview-platform"]').should('have.length', MODEL_LABELS.length * 5);
        cy.get('[data-testid="overview-model-coverage-note"]').should('not.exist');
        cy.get('details, summary, button').should('not.exist');
        cy.contains(/PRIMARY|Ranked results/).should('not.exist');
      });
    for (const label of MODEL_LABELS) {
      cy.get('[data-testid="overview-desktop-matrix"]').should('contain.text', label);
    }
    for (const model of ['Kimi-K3', 'GLM-5.2']) {
      desktopModel(model)
        .find('[data-testid="overview-model-scenario"]')
        .should('have.text', 'AgentX');
    }
    for (const model of ['DeepSeek-V4-Pro', 'Kimi-K2.5', 'MiniMax-M3', 'Qwen-3.5-397B-A17B']) {
      desktopModel(model)
        .find('[data-testid="overview-model-scenario"]')
        .should('have.text', 'Single-turn · 8K→1K');
    }
  });

  it('keeps the title and metric definition on one desktop row and stacks them below xl', () => {
    for (const width of [1280, 1440]) {
      cy.viewport(width, 900);
      cy.visit('/overview');
      cy.contains('h1', 'Inference Cost Overview').then(([title]) => {
        cy.get('[data-testid="overview-scope"]').then(([scope]) => {
          const titleRect = title.getBoundingClientRect();
          const scopeRect = scope.getBoundingClientRect();
          expect((scopeRect.top + scopeRect.bottom) / 2, `same row at ${width}px`).to.be.closeTo(
            (titleRect.top + titleRect.bottom) / 2,
            8,
          );
          expect(scopeRect.left, `metric right of title at ${width}px`).to.be.greaterThan(
            titleRect.right,
          );
        });
      });
      expectNoHorizontalOverflow();
    }

    for (const width of [320, 390, 768]) {
      cy.viewport(width, 900);
      cy.visit('/overview');
      cy.contains('h1', 'Inference Cost Overview').then(([title]) => {
        cy.get('[data-testid="overview-scope"]').then(([scope]) => {
          expect(
            scope.getBoundingClientRect().top,
            `stacked below title at ${width}px`,
          ).to.be.at.least(title.getBoundingClientRect().bottom - 1);
        });
      });
      expectNoHorizontalOverflow();
    }
  });

  it('links each cost to the raw source dashboard for exactly that configuration', () => {
    cy.viewport(1280, 900);
    cy.visit('/overview');

    desktopModel('Qwen-3.5-397B-A17B').within(() => {
      platform('mi355x').within(() => {
        cy.contains('SGLang · FP8').should('exist');
        cy.get(
          '[data-testid="overview-pair-value"][data-hardware="mi355x"] [data-testid="overview-cost-evidence-link"]',
        )
          .should('have.text', '$0.061')
          .and(
            'have.attr',
            'title',
            'Open raw source dashboard for Jul 18: Qwen3.5 397B · MI355X · SGLang · FP8 · MTP',
          )
          .should('have.attr', 'href')
          .and('include', '/inference?')
          .and('include', 'g_model=Qwen-3.5-397B-A17B')
          .and('include', 'g_rundate=2026-07-18')
          .and('include', 'i_prec=fp8')
          .and('include', 'i_gpus=mi355x_sglang_mtp');
      });
      platform('b200').within(() => {
        cy.get(
          '[data-testid="overview-pair-value"][data-hardware="b200"] [data-testid="overview-cost-evidence-link"]',
        )
          .should('contain.text', '≈$0.082')
          .should('have.attr', 'href')
          .and('include', 'i_prec=fp4')
          .and('include', 'i_gpus=b200_sglang_mtp');
      });
    });

    desktopModel('DeepSeek-V4-Pro').within(() => {
      // A cell without a read at the tier carries no evidence link either.
      platform('gb300').within(() => {
        cy.get('[data-testid="overview-cost-evidence-link"]').should('not.exist');
      });
    });
    expectNoVisibleDatesOrSnapshot();
  });

  it('distinguishes per-platform and whole-row missing results with a plain dash', () => {
    cy.viewport(1280, 900);
    cy.visit('/overview');

    desktopModel('DeepSeek-V4-Pro').within(() => {
      platform('mi355x').within(() => {
        cy.get('[data-testid="overview-pair-missing"][data-hardware="mi355x"]')
          .should('contain.text', '—')
          .and('not.contain.text', '∞')
          .and('have.attr', 'title', 'no exact @50 result');
      });
      platform('gb300').within(() => {
        cy.get('[data-testid="overview-pair-missing"][data-hardware="gb300"]')
          .should('contain.text', '—')
          .and('have.attr', 'title', 'no exact @50 result');
      });
      platform('b200').find('[data-testid="overview-estimate-visible"]').should('exist');
    });

    desktopModel('MiniMax-M3').within(() => {
      platform('b200')
        .find('[data-testid="overview-pair-missing"]')
        .should('contain.text', '—')
        .and('have.attr', 'title', 'no data for this scenario');
      platform('gb300').within(() => {
        cy.get('[data-testid="overview-pair-value"][data-hardware="gb300"]').should(
          'contain.text',
          '$0.113',
        );
        cy.get('[data-testid="overview-cost-delta"][data-hardware="gb300"]').should(
          'have.attr',
          'data-cost-polarity',
          'no-baseline',
        );
      });
    });

    desktopModel('GLM-5.2').within(() => {
      cy.get('[data-testid="overview-pair-missing"]').should('have.length', 5);
      cy.get('[data-testid="overview-model-coverage-note"]').should('not.exist');
    });
    // ∞ appears only inside relative badges, never as a cell value.
    cy.get('[data-testid="overview-pair-missing"]').each(($cell) => {
      expect($cell.text()).not.to.contain('∞');
    });
    cy.contains('— = no result. ∞ = B200 baseline unavailable.').should('exist');
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
    // The metric line never repeats the tier — the switcher states it.
    cy.get('[data-testid="overview-scope"]').should('have.text', SCOPE_LINE);
    cy.get('[data-testid="overview-tier-switcher"]').within(() => {
      cy.get('[aria-current="page"]').should('have.text', '100');
      cy.contains('a', '50').should('have.attr', 'href', '/overview');
    });

    desktopModel('Qwen-3.5-397B-A17B').within(() => {
      platform('b200').should('contain.text', '≈$0.139').and('contain.text', 'FP8');
      platform('mi355x').within(() => {
        cy.get('[data-testid="overview-pair-value"][data-hardware="mi355x"]').should(
          'contain.text',
          '≈$0.074',
        );
      });
      platform('b300').within(() => {
        cy.get('[data-testid="overview-pair-missing"][data-hardware="b300"]')
          .should('contain.text', '—')
          .and('have.attr', 'title', 'cannot reach @100');
      });
    });

    cy.visit('/overview?tier=30');
    desktopModel('DeepSeek-V4-Pro').within(() => {
      platform('b300').within(() => {
        cy.get('[data-testid="overview-pair-missing"][data-hardware="b300"]')
          .should('contain.text', '—')
          .and('have.attr', 'title', 'no exact @30 result');
      });
      platform('b200')
        .find('[data-testid="overview-pair-missing"]')
        .should('contain.text', '—')
        .and('have.attr', 'title', 'no exact @30 result');
    });
    // Exact @30 read priced without a B200 baseline: cost plus the ∞ badge.
    desktopModel('Qwen-3.5-397B-A17B').within(() => {
      platform('b300').within(() => {
        cy.get('[data-testid="overview-pair-value"][data-hardware="b300"]').should(
          'contain.text',
          '$0.050',
        );
        cy.get('[data-testid="overview-cost-delta"][data-hardware="b300"]')
          .should('contain.text', '∞')
          .and('have.attr', 'data-cost-polarity', 'no-baseline');
      });
    });
    cy.get('body')
      .invoke('text')
      .should('not.match', /∞\s*%/);

    cy.visit('/overview?tier=100');
    cy.get('[data-testid="overview-scope"]').should('have.text', SCOPE_LINE);
    cy.get('[data-testid="language-toggle"]')
      .should('have.attr', 'href', '/zh/overview?tier=100')
      .click();
    cy.location('pathname').should('eq', '/zh/overview');
    cy.location('search').should('eq', '?tier=100');
    cy.get('[data-testid="overview-scope"]').should('have.text', SCOPE_LINE_ZH);
  });

  it('uses the same cell semantics on mobile and fits both 390px and 320px widths', () => {
    for (const width of [390, 320]) {
      cy.viewport(width, 844);
      cy.visit('/overview');

      cy.get('[data-testid="mobile-chart-select"]').should('be.visible');
      cy.get('[data-testid="overview-mobile-list"]').should('be.visible');
      cy.get('[data-testid="overview-tier-switcher"]').should('be.visible');
      cy.get('[data-testid="overview-engine-scope-switcher"]')
        .should('be.visible')
        .find('[data-overview-engine-scope]')
        .each(($option) => {
          expect($option[0].getBoundingClientRect().height).to.be.at.least(44);
        });
      cy.get('[data-testid="overview-desktop-matrix"]').should('not.be.visible');
      mobileModel('Qwen-3.5-397B-A17B').within(() => {
        cy.get('[data-testid="overview-platform"]').should('have.length', 5);
        platform('mi355x').within(() => {
          cy.get(
            '[data-testid="overview-pair-value"][data-hardware="mi355x"] [data-testid="overview-cost-evidence-link"]',
          ).should('have.text', '$0.061');
        });
      });
      mobileModel('DeepSeek-V4-Pro').within(() => {
        cy.get(
          '[data-testid="overview-pair-value"][data-hardware="b200"] [data-testid="overview-estimate-visible"]',
        ).should('have.text', '≈$0.067');
        cy.get('[data-testid="overview-pair-missing"][data-hardware="gb300"]').should(
          'have.attr',
          'title',
          'no exact @50 result',
        );
      });
      expectNoVisibleDatesOrSnapshot();
      expectNoHorizontalOverflow();
      expectNoHorizontalScroller('overview-mobile-list');
      expectNoHorizontalScroller('overview-engine-scope-switcher');
    }
  });

  it('aligns every platform to the same compact row axes on phones', () => {
    for (const width of [390, 320]) {
      cy.viewport(width, 844);
      cy.visit('/overview');

      mobileModel('DeepSeek-V4-Pro').within(() => {
        cy.get('[data-testid="overview-mobile-platform-row"]')
          .should('have.length', 5)
          .then(($rows) => {
            const rows = [...$rows];
            const rects = rows.map((row) => row.getBoundingClientRect());
            for (let index = 1; index < rects.length; index += 1) {
              expect(rects[index - 1].bottom).to.be.at.most(rects[index].top + 1);
            }
            expect(rows.every((row) => row.getBoundingClientRect().height <= 88)).to.equal(true);
          });

        cy.get('[data-testid="overview-mobile-hardware"]').then(($labels) => {
          const lefts = [...$labels].map((label) => label.getBoundingClientRect().left);
          expect(Math.max(...lefts) - Math.min(...lefts)).to.be.at.most(1);
        });
        cy.get('[data-testid="overview-pair-value"]').then(($values) => {
          const lefts = [...$values].map((value) => textRect(value).left);
          expect(Math.max(...lefts) - Math.min(...lefts)).to.be.at.most(1);
        });
      });
    }
  });

  it('uses the same five-row comparison layout on phones and tablets', () => {
    for (const width of [320, 390, 768, 1024, 1279]) {
      cy.viewport(width, 900);
      cy.visit('/overview');

      mobileModel('DeepSeek-V4-Pro').within(() => {
        cy.get('[data-testid="overview-mobile-platform-row"]').then(($rows) => {
          const rows = [...$rows];
          expect(rows).to.have.length(5);

          const rects = rows.map((row) => row.getBoundingClientRect());
          for (let index = 1; index < rects.length; index += 1) {
            expect(rects[index - 1].bottom).to.be.at.most(rects[index].top + 1);
          }
        });
      });
    }
  });

  it('keeps percentage badges beside the value and typographically aligned below desktop', () => {
    for (const width of [320, 390, 768, 1024, 1279]) {
      cy.viewport(width, 900);
      cy.visit('/overview');

      mobileModel('Qwen-3.5-397B-A17B').within(() => {
        platform('mi355x').within(() => {
          cy.get('[data-testid="overview-pair-value"][data-hardware="mi355x"]').then(([value]) => {
            cy.get('[data-testid="overview-cost-delta"][data-hardware="mi355x"]').then(
              ([badge]) => {
                const valueRect = value.getBoundingClientRect();
                const badgeRect = badge.getBoundingClientRect();
                const badgeText = badge.querySelector('[aria-hidden="true"]');
                expect(badgeText).not.to.equal(null);

                expect(badgeRect.left - valueRect.right).to.be.at.most(8);
                expect(textRect(badgeText as Element).bottom).to.be.closeTo(
                  textRect(value).bottom,
                  1,
                );
              },
            );
          });
        });
      });
    }
  });

  it('keeps the cost value aligned above configuration metadata', () => {
    cy.viewport(390, 844);
    cy.visit('/overview');

    mobileModel('Qwen-3.5-397B-A17B').within(() => {
      platform('mi355x').within(() => {
        cy.get('[data-testid="overview-pair-value"][data-hardware="mi355x"]').then(([value]) => {
          cy.contains('div', 'SGLang · FP8')
            .should('contain.text', 'Spec decode (MTP)')
            .then(([metadata]) => {
              const valueRect = textRect(value);
              const metadataRect = textRect(metadata);

              expect(metadataRect.top).to.be.at.least(valueRect.bottom);
              expect(getComputedStyle(metadata).fontSize).to.equal('11px');
            });
        });
      });
    });
  });

  it('fits the full matrix without overlap or clipping at desktop widths', () => {
    for (const width of [1280, 1440]) {
      cy.viewport(width, 900);
      cy.visit('/overview');

      cy.get('[data-testid="overview-desktop-matrix"]').should('be.visible');
      cy.get('[data-testid="overview-desktop-matrix"]').then(([table]) => {
        const wrapper = table.parentElement as HTMLElement;
        expect(wrapper.scrollWidth, `matrix scrolls horizontally at ${width}px`).to.be.at.most(
          wrapper.clientWidth + 1,
        );
      });
      expectNoHorizontalOverflow();
      cy.get('[data-testid="overview-cost-delta"]').then(($badges) => {
        const problems: string[] = [];
        $badges.each((_, badge) => {
          const badgeRect = badge.getBoundingClientRect();
          if (badgeRect.width === 0) return;
          const cell = badge.parentElement as HTMLElement;
          const value = cell.querySelector('[data-testid="overview-pair-value"]');
          const hardware = badge.dataset.hardware;
          if (value) {
            const valueRect = value.getBoundingClientRect();
            if (valueRect.right > badgeRect.left + 0.5) {
              problems.push(`${hardware}: cost overlaps delta badge`);
            }
          }
        });
        expect(problems, problems.join(' | ')).to.have.length(0);
      });
    }
  });

  it('renders the Chinese sibling with equivalent matrix copy and semantics', () => {
    cy.viewport(1280, 900);
    cy.visit('/zh/overview');

    cy.get('[data-testid="tab-trigger-overview"]')
      .should('have.attr', 'href', '/zh/overview')
      .and('contain.text', '总览');
    cy.contains('h1', '推理成本总览').should('exist');
    cy.contains('一眼对比各活跃模型在 MI355X、B200、B300、GB200 与 GB300 上的表现。').should(
      'exist',
    );
    cy.contains('按各模型标注的场景，基于各平台最佳观测服务包络线计算每百万总 token 成本').should(
      'exist',
    );
    cy.get('[data-testid="overview-scope"]').should('have.text', SCOPE_LINE_ZH);
    cy.contains(
      '成本 = 超大规模云（hyperscaler）$/GPU/小时 ÷ 每张已部署 GPU 的总 tok/s。百分比均相对 B200。',
    ).should('exist');
    cy.contains('— = 无结果。∞ = 缺少 B200 基线。').should('exist');
    cy.contains('分离式结果的分母同时计入预填充与解码 GPU。').should('exist');
    cy.contains(
      '各档位数值采用最佳观测平台服务包络线；≈ 表示根据已验证运行结果估算。不会外推。',
    ).should('exist');
    expectNoVisibleDatesOrSnapshot();
    desktopModel('DeepSeek-V4-Pro')
      .find(
        '[data-testid="overview-pair-value"][data-hardware="b200"] [data-testid="overview-cost-evidence-link"]',
      )
      .as('estimatedB200')
      .invoke('attr', 'title')
      .should('include', '根据已验证的基准运行结果估算。')
      .and('include', '原始数据仪表板：DeepSeek V4 Pro 1.6T · B200 · SGLang · FP4 · MTP');
    cy.get('@estimatedB200')
      .invoke('attr', 'aria-label')
      .should('include', '约 $0.067。根据已验证的基准运行结果估算。');
    cy.get('@estimatedB200')
      .find('[data-testid="overview-estimate-visible"]')
      .should('have.text', '≈$0.067');
    cy.get('@estimatedB200')
      .should('have.attr', 'href')
      .and('include', '/zh/inference?')
      .and('include', 'g_model=DeepSeek-V4-Pro');
    desktopModel('DeepSeek-V4-Pro')
      .find('[data-testid="overview-pair-missing"][data-hardware="gb300"]')
      .should('contain.text', '—')
      .and('have.attr', 'title', '无精确 @50 结果');
    cy.get('body')
      .invoke('text')
      .should('not.match', /回退/);
    cy.get('body')
      .invoke('text')
      .should('not.match', /100 档由.+领先/);
    desktopModel('Kimi-K2.5').within(() => {
      cy.get('[data-testid="overview-pair-value"]').should('have.length', 3);
      cy.get('[data-testid="overview-pair-missing"]').should('have.length', 2);
      platform('b200').should('contain.text', '标准解码');
      platform('b200').find('[data-testid="overview-cost-delta"]').should('not.exist');
    });
    desktopModel('DeepSeek-V4-Pro').within(() => {
      platform('b200').should('contain.text', '推测解码（MTP）');
    });
    desktopModel('MiniMax-M3').within(() => {
      platform('gb300')
        .find('[data-testid="overview-cost-delta"]')
        .should('contain.text', '∞')
        .and('have.attr', 'data-cost-polarity', 'no-baseline')
        .and('have.attr', 'title', '缺少可比较的 B200 基线');
    });
    desktopModel('GLM-5.2').within(() => {
      cy.get('[data-testid="overview-model-scenario"]').should('have.text', 'AgentX');
      cy.get('[data-testid="overview-pair-missing"]').should('have.length', 5);
      platform('b300')
        .find('[data-testid="overview-pair-missing"]')
        .should('have.attr', 'title', '该场景暂无数据');
    });
    cy.contains('优先顺序：推测解码 FP4 → 推测解码 FP8 → 标准解码 FP4 → 标准解码 FP8。').should(
      'exist',
    );

    cy.visit('/zh/overview?tier=100');
    cy.get('[data-testid="overview-scope"]').should('have.text', SCOPE_LINE_ZH);
    cy.get('[data-testid="overview-tier-switcher"]').within(() => {
      cy.contains('a', '50').should('have.attr', 'href', '/zh/overview');
    });
  });
});
