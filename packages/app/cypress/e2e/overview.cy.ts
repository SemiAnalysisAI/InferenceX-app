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

// No trailing Details column: the link sits in the model cell instead.
const PLATFORM_HEADERS = [
  'Model · Scenario',
  'B200 · Reference',
  'MI355X',
  'B300',
  'GB200 NVL72',
  'GB300 NVL72',
];

const SINGLE_TURN = 'single_turn_8k1k';
/** Six models, three of them with both a single-turn and an AgentX row. */
const MATRIX_ROWS = 9;
const AGENTX = 'agentx';
const AGENTX_LABEL = 'Long Context Multi-Turn Realistic Agentic Scenario (AgentX)';
const AGENTX_LABEL_ZH = '长上下文多轮真实智能体场景（AgentX）';

const PAGE_TITLE = 'Inference Cost per Million Tokens';
const PAGE_TITLE_ZH = '推理每百万 token 成本';
const SOURCE_NOTE = 'Source: InferenceX & SemiAnalysis Market July 2026 AI Cloud TCO Model';
const SOURCE_LINK_TEXT = 'SemiAnalysis Market July 2026 AI Cloud TCO Model';
const SOURCE_NOTE_ZH = '来源：InferenceX 与 SemiAnalysis Market July 2026 AI Cloud TCO Model';
const SOURCE_HREF = 'https://semianalysis.com/ai-cloud-tco-model/';
const SCOPE_METRIC = 'Hyperscaler cost';
const SCOPE_DIRECTION = '↓ Lower is better';
const SCOPE_LINE = `${SCOPE_METRIC} · ${SCOPE_DIRECTION} · ${SOURCE_NOTE}`;
const SCOPE_METRIC_ZH = '超大规模云（hyperscaler）成本';
const SCOPE_DIRECTION_ZH = '↓ 越低越好';
const SCOPE_LINE_ZH = `${SCOPE_METRIC_ZH} · ${SCOPE_DIRECTION_ZH} · ${SOURCE_NOTE_ZH}`;

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
    .then(([body]) => {
      // Next.js RSC payload scripts retain evidence dates for reproducibility.
      // Assert only against rendered page text, not serialized script/style data.
      const clone = body.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('script, style').forEach((node) => node.remove());
      return clone.textContent ?? '';
    })
    .should((text) => {
      expect(text).not.to.match(/Database snapshot/i);
      expect(text).not.to.match(/快照/);
      expect(text).not.to.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d/);
      expect(text).not.to.match(/\d+月\d+日/);
      expect(text).not.to.match(/20\d\d-\d\d-\d\d/);
    });
}

/** A model benchmarked on both scenarios has one row per scenario, so every
 *  such model must be addressed by (model, scenario) — not by model alone. */
function desktopModel(model: string, scenario?: string) {
  const row = scenario === undefined ? '' : `[data-scenario="${scenario}"]`;
  return cy.get(`[data-testid="overview-desktop-model"][data-model="${model}"]${row}`);
}

function mobileModel(model: string, scenario?: string) {
  const row = scenario === undefined ? '' : `[data-scenario="${scenario}"]`;
  return cy.get(`[data-testid="overview-mobile-model"][data-model="${model}"]${row}`);
}

/** The comparison shade sits on the table cell wrapping the platform block. */
function expectCellTint(hardware: string, expected: string) {
  platform(hardware).then(([cell]) => {
    expect(getComputedStyle(cell.closest('td')!).backgroundColor).to.contain(expected);
  });
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
      cy.get('[data-testid="overview-model-scenario"]').should('have.text', AGENTX_LABEL);
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
      // Standard decode is the exception, so those cells badge STP.
      platform('b200').should('contain.text', 'SGLang · FP4 · STP');
      platform('mi355x').should('contain.text', 'SGLang · FP4 · STP');
      platform('b300').should('contain.text', 'SGLang · FP8 · STP');
    });

    desktopModel('DeepSeek-V4-Pro', SINGLE_TURN).within(() => {
      // Speculative decode is the expected case and goes unlabelled; the stack
      // badge stops at framework and precision.
      cy.contains('SGLang · FP4').should('exist');
      cy.get('[data-testid="overview-platform"]').should('not.contain.text', 'STP');
      cy.root().should('not.contain.text', 'Spec decode');
      platform('b200').within(() => {
        // The estimated cost is itself the evidence link; the run date lives in
        // its hover/focus/screen-reader label, never as visible text.
        cy.get(
          '[data-testid="overview-pair-value"][data-hardware="b200"] [data-testid="overview-cost-evidence-link"]',
        ).should('have.text', '$0.059');
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
            'Approximately $0.059. Estimated from validated benchmark runs. Open raw source dashboard for Jul 18: DeepSeek V4 Pro 1.6T · B200 · SGLang · FP4 · MTP',
          );
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
    desktopModel('MiniMax-M3', SINGLE_TURN).within(() => {
      platform('gb300')
        .should('contain.text', 'SGLang · FP8')
        .and('not.contain.text', 'M3 EAGLE')
        .and('not.contain.text', 'STP');
    });
    cy.contains(
      'If a chip does not have FP4 spec decoding available, the next best available configuration is used.',
    ).should('exist');
    cy.get('body').should('not.contain.text', 'P90');
  });

  it('color-grades the whole cell against B200 and badges a missing baseline with a neutral ∞', () => {
    cy.viewport(1280, 900);
    cy.visit('/overview');

    desktopModel('Qwen-3.5-397B-A17B', SINGLE_TURN).within(() => {
      platform('b200').find('[data-testid="overview-cost-delta"]').should('not.exist');
      platform('mi355x')
        .find('[data-testid="overview-cost-delta"]')
        .should('contain.text', '-14%')
        .and('have.attr', 'data-cost-polarity', 'cheaper')
        .then(($badge) => {
          // The shade lives on the cell now, never on the badge itself.
          expect($badge.attr('style') ?? '').not.to.contain('background');
        });
      // Cheaper than B200: the whole cell carries the green wash.
      expectCellTint('mi355x', 'rgba(16, 185, 129,');
    });

    desktopModel('DeepSeek-V4-Pro', SINGLE_TURN).within(() => {
      platform('gb200')
        .find('[data-testid="overview-cost-delta"]')
        .should('contain.text', '+71%')
        .and('have.attr', 'data-cost-polarity', 'pricier');
      // +71% saturates the alpha ramp; read the computed value so the
      // assertion survives the browser normalizing `0.40` to `0.4`.
      expectCellTint('gb200', 'rgba(239, 68, 68, 0.4)');
      // No read at the tier means nothing to grade — the cell stays untinted.
      platform('gb300').find('[data-testid="overview-cost-delta"]').should('not.exist');
      platform('gb300').then(([cell]) => {
        expect(getComputedStyle(cell.closest('td')!).backgroundColor).to.match(
          /rgba\(0, 0, 0, 0\)|transparent/,
        );
      });
    });

    // The B200 reference column is never washed: its null delta means "no
    // comparison against itself", not the ∞ state.
    desktopModel('Qwen-3.5-397B-A17B', SINGLE_TURN).within(() => {
      platform('b200').then(([cell]) => {
        const td = cell.closest('td')!;
        expect(td.getAttribute('style') ?? '').not.to.contain('background');
        expect(td.className).to.contain('bg-muted/30');
      });
    });

    // Priced result with no B200 baseline: neutral gray ∞ and a neutral cell —
    // availability, not a good/bad judgment, so no red/green tint.
    desktopModel('MiniMax-M3', SINGLE_TURN).within(() => {
      platform('gb300')
        .find('[data-testid="overview-cost-delta"]')
        .should('contain.text', '∞')
        .and('have.attr', 'data-cost-polarity', 'no-baseline')
        .and('have.attr', 'title', 'No B200 baseline to compare against');
      platform('gb300').then(([cell]) => {
        const [r, g, b] = getComputedStyle(cell.closest('td')!)
          .backgroundColor.match(/\d+/g)!
          .map(Number);
        // Slate gray: no channel dominates the way the red (spread 171) and
        // green (spread 169) ramps do.
        expect(Math.max(r, g, b) - Math.min(r, g, b)).to.be.lessThan(60);
      });
    });

    // Outside the ±5% parity band the cell carries the matching polarity.
    desktopModel('Kimi-K2.5').within(() => {
      platform('b300')
        .find('[data-testid="overview-cost-delta"]')
        .should('contain.text', '+11%')
        .and('have.attr', 'data-cost-polarity', 'pricier');
      expectCellTint('b300', 'rgba(239, 68, 68,');
    });
  });

  it('renders the full platform matrix for every active model', () => {
    cy.viewport(1280, 900);
    cy.visit('/overview');

    cy.get('[data-testid="chart-section-tabs"]').should('not.exist');
    cy.get('[data-testid="nav-link-overview"]')
      .should('have.attr', 'href', '/overview')
      .and('have.class', 'text-brand');
    cy.get('[data-testid="nav-link-dashboard"]').should('not.have.class', 'text-brand');

    cy.contains('h1', PAGE_TITLE).should('exist');
    cy.contains(
      'Cost per million total tokens from each platform’s best observed serving envelope',
    ).should('exist');
    cy.get('[data-testid="overview-scope"]')
      .should('have.text', SCOPE_LINE)
      .and('not.contain.text', 'tok/s/user')
      .and('not.contain.text', '$/1M')
      .and('not.contain.text', '8K→1K');
    // The TCO model behind every $/GPU/hr is cited under the metric.
    cy.get('[data-testid="overview-source-link"]')
      .should('have.text', SOURCE_LINK_TEXT)
      .and('have.attr', 'href', SOURCE_HREF)
      .and('have.attr', 'target', '_blank')
      .and('have.attr', 'rel', 'noopener noreferrer');
    // Opening off-site is signalled by the shared external-link glyph.
    cy.get('[data-testid="overview-source-link"] svg').should('exist');
    // The standing blurb above the switchers is gone.
    cy.get('body').should('not.contain.text', 'at a glance');
    cy.contains('— = no result. ∞ = B200 baseline unavailable.').should('exist');
    // The methodology block is now just the cell-state legend and the
    // configuration-fallback note; the cost-formula, comparability, and
    // interpolation notes were removed.
    cy.get('[data-testid="overview-methodology"]').children('p').should('have.length', 2);
    cy.get('body')
      .invoke('text')
      .should('not.match', /Cost = hyperscaler/)
      .and('not.match', /Each row compares platforms/)
      .and('not.match', /prefill and decode GPUs in the denominator/)
      .and('not.match', /No extrapolation/);
    cy.get('body').should('not.contain.text', '≈');
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
          // Column headers read at 14px, a step up from the 12px metadata.
          for (const header of $headers) {
            expect(getComputedStyle(header).fontSize).to.equal('14px');
          }
        });
        // One row per curated (model, scenario) pair: six models, three of
        // which (DeepSeek, MiniMax, Qwen) carry a second AgentX row.
        cy.get('[data-testid="overview-desktop-model"]').should('have.length', MATRIX_ROWS);
        cy.get('[data-testid="overview-platform"]').should('have.length', MATRIX_ROWS * 5);
        cy.get('[data-testid="overview-model-coverage-note"]').should('not.exist');
        // One link per row, inside that row's model cell.
        cy.get('a').contains('View details').should('exist');
        cy.get('th[scope="row"]')
          .find('a')
          .filter(':contains("View details")')
          .should('have.length', MATRIX_ROWS);
        cy.get('details, summary, button').should('not.exist');
        cy.contains(/PRIMARY|Ranked results/).should('not.exist');
      });
    for (const label of MODEL_LABELS) {
      cy.get('[data-testid="overview-desktop-matrix"]').should('contain.text', label);
    }
    for (const model of ['Kimi-K3', 'GLM-5.2']) {
      desktopModel(model)
        .find('[data-testid="overview-model-scenario"]')
        .should('have.text', AGENTX_LABEL);
    }
    for (const model of ['DeepSeek-V4-Pro', 'Kimi-K2.5', 'MiniMax-M3', 'Qwen-3.5-397B-A17B']) {
      desktopModel(model, SINGLE_TURN)
        .find('[data-testid="overview-model-scenario"]')
        .should('have.text', '8K/1K');
    }
  });

  it('gives a model benchmarked on both scenarios one row each, priced independently', () => {
    cy.viewport(1280, 900);
    cy.visit('/overview');

    cy.get('[data-testid="overview-desktop-model"][data-model="DeepSeek-V4-Pro"]').should(
      'have.length',
      2,
    );
    // Single-turn first, AgentX directly below it, both under the same label.
    cy.get('[data-testid="overview-desktop-model"][data-model="DeepSeek-V4-Pro"]').then(($rows) => {
      expect([...$rows].map((row) => row.dataset.scenario)).to.deep.equal([SINGLE_TURN, AGENTX]);
    });

    desktopModel('DeepSeek-V4-Pro', AGENTX).within(() => {
      cy.get('[data-testid="overview-model-scenario"]').should('have.text', AGENTX_LABEL);
      cy.contains('DeepSeek V4 Pro 1.6T').should('exist');
      // Priced from the AgentX rows alone — the single-turn sweep never leaks in.
      cy.get(
        '[data-testid="overview-pair-value"][data-hardware="b200"] [data-testid="overview-cost-evidence-link"]',
      ).should('have.text', '$0.064');
      cy.get(
        '[data-testid="overview-pair-value"][data-hardware="mi355x"] [data-testid="overview-cost-evidence-link"]',
      ).should('have.text', '$0.069');
      cy.get('[data-testid="overview-pair-missing"]').should('have.length', 3);
      // Its detail link points at the agentic-traces workload, not 8K→1K.
      cy.contains('a', 'View details')
        .should('have.attr', 'href')
        .and('include', 'i_seq=agentic-traces');
      // ...and names its scenario, so the two rows' links are distinguishable
      // to a screen reader rather than both reading "View details: <model>".
      cy.contains('a', 'View details').should(
        'have.attr',
        'aria-label',
        `View details: DeepSeek V4 Pro 1.6T · ${AGENTX_LABEL}`,
      );
    });
    desktopModel('DeepSeek-V4-Pro', SINGLE_TURN).within(() => {
      cy.contains('a', 'View details').should(
        'have.attr',
        'aria-label',
        'View details: DeepSeek V4 Pro 1.6T · 8K/1K',
      );
    });
  });

  it('stacks the metric definition under the title at every width', () => {
    cy.viewport(1280, 900);
    cy.visit('/overview');
    cy.get('[data-testid="overview-scope-metric"]')
      .should('have.text', SCOPE_METRIC)
      .and('have.css', 'font-size', '16px')
      .and('have.css', 'font-weight', '600');
    cy.get('[data-testid="overview-scope-direction"]')
      .should('have.text', SCOPE_DIRECTION)
      .and('have.css', 'font-size', '14px')
      .and('have.css', 'font-weight', '400');
    cy.get('[data-testid="overview-scope-metric"]').then(([metric]) => {
      cy.get('[data-testid="overview-scope-direction"]').then(([direction]) => {
        expect(getComputedStyle(direction).color).not.to.equal(getComputedStyle(metric).color);
      });
    });

    for (const width of [320, 390, 768, 1280, 1440]) {
      cy.viewport(width, 900);
      cy.visit('/overview');
      cy.contains('h1', PAGE_TITLE).then(([title]) => {
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

    desktopModel('Qwen-3.5-397B-A17B', SINGLE_TURN).within(() => {
      platform('mi355x').within(() => {
        cy.contains('SGLang · FP8').should('exist');
        cy.get(
          '[data-testid="overview-pair-value"][data-hardware="mi355x"] [data-testid="overview-cost-evidence-link"]',
        )
          .should('have.text', '$0.062')
          .and(
            'have.attr',
            'title',
            'Open raw source dashboard for Jul 18: Qwen3.5 397B · MI355X · SGLang · FP8 · MTP',
          )
          .and(
            'have.attr',
            'aria-label',
            '$0.062. Open raw source dashboard for Jul 18: Qwen3.5 397B · MI355X · SGLang · FP8 · MTP',
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
          .should('contain.text', '$0.073')
          .should('have.attr', 'href')
          .and('include', 'i_prec=fp4')
          .and('include', 'i_gpus=b200_sglang_mtp');
      });
    });

    desktopModel('DeepSeek-V4-Pro', SINGLE_TURN).within(() => {
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

    desktopModel('DeepSeek-V4-Pro', SINGLE_TURN).within(() => {
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
      platform('b200')
        .find('[data-testid="overview-cost-evidence-link"]')
        .should('have.attr', 'title')
        .and('include', 'Estimated from validated benchmark runs.');
    });

    desktopModel('MiniMax-M3', SINGLE_TURN).within(() => {
      platform('b200')
        .find('[data-testid="overview-pair-missing"]')
        .should('contain.text', '—')
        .and('have.attr', 'title', 'no data for this scenario');
      platform('gb300').within(() => {
        cy.get('[data-testid="overview-pair-value"][data-hardware="gb300"]').should(
          'contain.text',
          '$0.099',
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

    // The tier control is labelled SLO, not "Service level".
    cy.get('[data-testid="overview-tier-switcher"]')
      .should('have.attr', 'aria-label', 'SLO')
      .and('contain.text', 'SLO');
    cy.get('body').should('not.contain.text', 'Service level');
    cy.get('[data-testid="overview-tier-switcher"]').within(() => {
      cy.get('[aria-current="page"]').should('have.text', '50');
      // 30 / 75 / 100 / 150 / 200 link out; the active 50 is inert text.
      cy.get('a').should('have.length', 5);
      cy.contains('a', '30').should('have.attr', 'href', '/overview?tier=30');
      cy.contains('a', '150').should('have.attr', 'href', '/overview?tier=150');
      cy.contains('a', '200').should('have.attr', 'href', '/overview?tier=200');
      cy.contains('a', '100').should('have.attr', 'href', '/overview?tier=100').click();
    });

    cy.location('search').should('eq', '?tier=100');
    // The metric line never repeats the tier — the switcher states it.
    cy.get('[data-testid="overview-scope"]').should('have.text', SCOPE_LINE);
    cy.get('[data-testid="overview-tier-switcher"]').within(() => {
      cy.get('[aria-current="page"]').should('have.text', '100');
      cy.contains('a', '50').should('have.attr', 'href', '/overview');
    });

    desktopModel('Qwen-3.5-397B-A17B', SINGLE_TURN).within(() => {
      platform('b200').should('contain.text', '$0.124').and('contain.text', 'FP8');
      platform('mi355x').within(() => {
        cy.get('[data-testid="overview-pair-value"][data-hardware="mi355x"]').should(
          'contain.text',
          '$0.075',
        );
      });
      platform('b300').within(() => {
        cy.get('[data-testid="overview-pair-missing"][data-hardware="b300"]')
          .should('contain.text', '—')
          .and('have.attr', 'title', 'cannot reach @100');
      });
    });

    cy.visit('/overview?tier=30');
    desktopModel('DeepSeek-V4-Pro', SINGLE_TURN).within(() => {
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
    desktopModel('Qwen-3.5-397B-A17B', SINGLE_TURN).within(() => {
      platform('b300').within(() => {
        cy.get('[data-testid="overview-pair-value"][data-hardware="b300"]').should(
          'contain.text',
          '$0.049',
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
      mobileModel('Qwen-3.5-397B-A17B', SINGLE_TURN).within(() => {
        cy.get('[data-testid="overview-platform"]').should('have.length', 5);
        platform('mi355x').within(() => {
          cy.get(
            '[data-testid="overview-pair-value"][data-hardware="mi355x"] [data-testid="overview-cost-evidence-link"]',
          ).should('have.text', '$0.062');
        });
      });
      mobileModel('DeepSeek-V4-Pro', SINGLE_TURN).within(() => {
        cy.get(
          '[data-testid="overview-pair-value"][data-hardware="b200"] [data-testid="overview-cost-evidence-link"]',
        ).should('have.text', '$0.059');
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

      mobileModel('DeepSeek-V4-Pro', SINGLE_TURN).within(() => {
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

      mobileModel('DeepSeek-V4-Pro', SINGLE_TURN).within(() => {
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

      mobileModel('Qwen-3.5-397B-A17B', SINGLE_TURN).within(() => {
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

    mobileModel('Qwen-3.5-397B-A17B', SINGLE_TURN).within(() => {
      platform('mi355x').within(() => {
        cy.get('[data-testid="overview-pair-value"][data-hardware="mi355x"]').then(([value]) => {
          cy.contains('div', 'SGLang · FP8')
            .should('not.contain.text', 'STP')
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

  it('pins the matrix header to the top of the viewport while the page scrolls', () => {
    cy.viewport(1280, 700);
    cy.visit('/overview');

    // Tall enough to scroll the header off a non-sticky layout.
    cy.get('[data-testid="overview-desktop-matrix"]').then(([table]) => {
      expect(table.getBoundingClientRect().height).to.be.greaterThan(700);
    });
    cy.scrollTo(0, 800);
    // Pinned just below the sticky site header (h-14 = 56px), never under it.
    cy.get('header.sticky').then(([siteHeader]) => {
      const siteBottom = siteHeader.getBoundingClientRect().bottom;
      cy.get('[data-testid="overview-desktop-matrix"] thead').should(([head]) => {
        expect(head.getBoundingClientRect().top, 'header pinned below the nav').to.be.closeTo(
          siteBottom,
          2,
        );
      });
    });
    // Opaque and above the rows it overlaps, not blended with them.
    cy.document().then((doc) => {
      cy.get('[data-testid="overview-desktop-matrix"] thead').then(([head]) => {
        const rect = head.getBoundingClientRect();
        const hit = doc.elementFromPoint(rect.left + 40, rect.top + rect.height / 2);
        expect(head.contains(hit), 'header paints over the scrolled rows').to.equal(true);
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

    cy.get('[data-testid="chart-section-tabs"]').should('not.exist');
    cy.get('[data-testid="nav-link-overview"]')
      .should('have.attr', 'href', '/zh/overview')
      .and('contain.text', '总览');
    cy.contains('h1', PAGE_TITLE_ZH).should('exist');
    cy.contains('按各模型标注的场景，基于各平台最佳观测服务包络线计算每百万总 token 成本').should(
      'exist',
    );
    cy.get('[data-testid="overview-scope"]').should('have.text', SCOPE_LINE_ZH);
    cy.get('[data-testid="overview-source-link"]')
      .should('have.text', SOURCE_LINK_TEXT)
      .and('have.attr', 'href', SOURCE_HREF);
    cy.get('body').should('not.contain.text', '一眼对比');
    cy.contains('— = 无结果。∞ = 缺少 B200 基线。').should('exist');
    cy.get('[data-testid="overview-methodology"]').children('p').should('have.length', 2);
    cy.get('body')
      .invoke('text')
      .should('not.match', /成本 = 超大规模云/)
      .and('not.match', /每行均在该模型标注的场景内比较各平台/)
      .and('not.match', /分离式结果的分母同时计入预填充与解码 GPU/)
      .and('not.match', /不会外推/);
    cy.get('body').should('not.contain.text', '≈');
    expectNoVisibleDatesOrSnapshot();
    desktopModel('DeepSeek-V4-Pro', SINGLE_TURN)
      .find(
        '[data-testid="overview-pair-value"][data-hardware="b200"] [data-testid="overview-cost-evidence-link"]',
      )
      .as('estimatedB200')
      .invoke('attr', 'title')
      .should('include', '根据已验证的基准运行结果估算。')
      .and('include', '原始数据仪表板：DeepSeek V4 Pro 1.6T · B200 · SGLang · FP4 · MTP');
    cy.get('@estimatedB200')
      .invoke('attr', 'aria-label')
      .should('include', '约 $0.059。根据已验证的基准运行结果估算。');
    cy.get('@estimatedB200').should('have.text', '$0.059');
    cy.get('@estimatedB200')
      .should('have.attr', 'href')
      .and('include', '/zh/inference?')
      .and('include', 'g_model=DeepSeek-V4-Pro');
    desktopModel('DeepSeek-V4-Pro', SINGLE_TURN)
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
      platform('b200').should('contain.text', 'SGLang · FP4 · STP');
      platform('b200').find('[data-testid="overview-cost-delta"]').should('not.exist');
    });
    desktopModel('DeepSeek-V4-Pro', SINGLE_TURN).within(() => {
      platform('b200').should('contain.text', 'SGLang · FP4').and('not.contain.text', 'STP');
    });
    desktopModel('MiniMax-M3', SINGLE_TURN).within(() => {
      platform('gb300')
        .find('[data-testid="overview-cost-delta"]')
        .should('contain.text', '∞')
        .and('have.attr', 'data-cost-polarity', 'no-baseline')
        .and('have.attr', 'title', '缺少可比较的 B200 基线');
    });
    desktopModel('GLM-5.2').within(() => {
      cy.get('[data-testid="overview-model-scenario"]').should('have.text', AGENTX_LABEL_ZH);
      cy.get('[data-testid="overview-pair-missing"]').should('have.length', 5);
      platform('b300')
        .find('[data-testid="overview-pair-missing"]')
        .should('have.attr', 'title', '该场景暂无数据');
    });
    desktopModel('DeepSeek-V4-Pro', AGENTX).within(() => {
      cy.get('[data-testid="overview-model-scenario"]').should('have.text', AGENTX_LABEL_ZH);
      cy.get(
        '[data-testid="overview-pair-value"][data-hardware="b200"] [data-testid="overview-cost-evidence-link"]',
      ).should('have.text', '$0.064');
    });
    cy.contains('若某款芯片不支持 FP4 推测解码，则采用次优的可用配置。').should('exist');

    cy.visit('/zh/overview?tier=100');
    cy.get('[data-testid="overview-scope"]').should('have.text', SCOPE_LINE_ZH);
    cy.get('[data-testid="overview-tier-switcher"]')
      .should('have.attr', 'aria-label', 'SLO')
      .and('contain.text', 'SLO');
    cy.get('body').should('not.contain.text', '服务档位');
    cy.get('[data-testid="overview-tier-switcher"]').within(() => {
      cy.contains('a', '50').should('have.attr', 'href', '/zh/overview');
    });
  });
});
