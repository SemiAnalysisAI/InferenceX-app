// Order mirrors DEFAULT_MODELS (MODEL_CONFIG insertion order), which fixes the
// matrix row order.
const MODEL_LABELS = [
  'DeepSeek V4 Pro 1.6T',
  'Kimi K3 2.8T',
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
/** Five models, three of them with both a single-turn and an AgentX row. */
const MATRIX_ROWS = 8;
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
          // Radix selects render an aria-hidden native <select> clipped to 1px,
          // which Firefox reports as scrollable; hidden elements cannot scroll.
          el.getAttribute('aria-hidden') !== 'true' &&
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
      clone.querySelectorAll('script, style, .sr-only').forEach((node) => node.remove());
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
  it('updates selectors through cached overview JSON without an RSC round trip', () => {
    cy.viewport(1280, 900);
    cy.visit('/overview');
    let jsonRequests = 0;
    let rscRequests = 0;
    const rscUrls: string[] = [];
    cy.intercept('GET', '**/api/v1/overview*', () => {
      jsonRequests += 1;
    }).as('overviewJson');
    cy.intercept('GET', '**/overview*', (request) => {
      const url = new URL(request.url);
      if (
        (url.pathname === '/overview' || url.pathname === '/zh/overview') &&
        (url.searchParams.has('_rsc') || request.headers.rsc === '1')
      ) {
        rscRequests += 1;
        rscUrls.push(`${url.pathname}${url.search}`);
      }
    });
    cy.window().then((win) => {
      (win as Window & { __overviewNavigationSentinel?: string }).__overviewNavigationSentinel =
        'preserved';
    });

    cy.get('[data-testid="overview-tier-switcher"]').contains('a', '75').click();
    cy.wait('@overviewJson');
    cy.location('search', { timeout: 15_000 }).should('eq', '?tier=75');
    cy.window().its('__overviewNavigationSentinel').should('eq', 'preserved');

    cy.get('[data-testid="overview-tier-switcher"]').contains('a', '50').click();
    cy.location('search').should('eq', '');
    cy.get('[data-testid="overview-tier-switcher"]').contains('a', '75').click();
    cy.location('search').should('eq', '?tier=75');
    cy.then(() => {
      expect(jsonRequests, 'one request; both visited selections are cached').to.equal(1);
      expect(rscUrls, 'selector RSC requests').to.deep.equal([]);
    });

    cy.get('[data-testid="overview-engine-scope-switcher"]')
      .find('[data-overview-engine-scope="all"]')
      .click();
    cy.wait('@overviewJson');
    cy.location('search', { timeout: 15_000 }).should('eq', '?tier=75&engine=all');
    cy.window().its('__overviewNavigationSentinel').should('eq', 'preserved');

    cy.get('[data-overview-comparison="30d"]').click();
    cy.wait('@overviewJson');
    cy.location('search', { timeout: 15_000 }).should('eq', '?tier=75&engine=all&compare=30d');
    cy.window().its('__overviewNavigationSentinel').should('eq', 'preserved');

    cy.go('back');
    cy.get('[data-overview-comparison="hardware"]').should('have.attr', 'aria-current', 'true');
    cy.location('search', { timeout: 15_000 }).should('eq', '?tier=75&engine=all');
    cy.then(() => {
      expect(rscRequests, 'selector and popstate RSC requests').to.equal(0);
    });
  });

  it('leaves overview through browser history without requesting overview data', () => {
    cy.viewport(1280, 900);
    cy.visit('/overview');
    cy.intercept('GET', '**/api/v1/overview*').as('overviewJson');
    cy.get('[data-testid="overview-tier-switcher"]').contains('a', '75').click();
    cy.wait('@overviewJson');
    cy.location('search').should('eq', '?tier=75');

    cy.window().then((win) => {
      let overviewRequests = 0;
      const fetch = win.fetch.bind(win);
      cy.stub(win, 'fetch').callsFake((input, init) => {
        const url = input instanceof win.Request ? input.url : input.toString();
        if (url.startsWith('/api/v1/overview')) {
          overviewRequests += 1;
          return new Promise<Response>(() => {});
        }
        return fetch(input, init);
      });

      win.history.pushState(win.history.state, '', '/inference');
      win.dispatchEvent(new win.PopStateEvent('popstate', { state: win.history.state }));
      expect(overviewRequests, 'overview requests after leaving overview').to.equal(0);
    });
  });

  it('preserves pending selections when controls are changed rapidly', () => {
    cy.viewport(1280, 900);
    cy.visit('/overview');
    // Hold the first response open so the second click lands inside the pending
    // window; without the delay the clicks may serialize and never race.
    cy.intercept('GET', '**/api/v1/overview*', (request) => {
      request.continue((response) => {
        response.setDelay(600);
      });
    }).as('overviewJson');

    cy.get('[data-testid="overview-tier-switcher"]').contains('a', '75').click();
    cy.get('[data-testid="overview-engine-scope-switcher"]')
      .find('[data-overview-engine-scope="all"]')
      .click();

    cy.location('search', { timeout: 15_000 }).should('eq', '?tier=75&engine=all');
    // The rendered state, not just the URL: the losing response must not win.
    cy.get('[data-testid="overview-tier-switcher"] [aria-current="page"]', {
      timeout: 15_000,
    }).should('have.text', '75');
    cy.get('[data-overview-engine-scope="all"]').should('have.attr', 'aria-current', 'true');
    cy.location('search').should('eq', '?tier=75&engine=all');
  });

  it('shows a busy state while an uncached selection loads', () => {
    cy.viewport(1280, 900);
    cy.visit('/overview');
    cy.intercept('GET', '**/api/v1/overview*', (request) => {
      request.continue((response) => {
        response.setDelay(800);
      });
    }).as('overviewJson');

    cy.get('[data-testid="overview-tier-switcher"]').contains('a', '75').click();
    cy.get('[data-testid="overview-page"] [aria-busy="true"]').should('exist');
    cy.wait('@overviewJson');
    cy.get('[data-testid="overview-page"] [aria-busy="true"]', { timeout: 15_000 }).should(
      'not.exist',
    );
  });

  it('rewrites one history entry when the overview request fails', () => {
    cy.viewport(1280, 900);
    cy.visit('/inference');
    cy.visit('/overview');
    cy.intercept('GET', '**/api/v1/overview*', { statusCode: 500 }).as('overviewJsonFailure');

    cy.window().then((win) => {
      const before = win.history.length;
      cy.get('[data-testid="overview-tier-switcher"]').contains('a', '75').click();
      cy.wait('@overviewJsonFailure');
      cy.location('search', { timeout: 15_000 }).should('eq', '?tier=75');
      // A plain `.should` would be satisfied by the transient extra entry.
      cy.window().then((after) => {
        expect(after.history.length - before, 'one entry for one selection').to.equal(1);
      });
    });

    cy.go('back');
    cy.location('search', { timeout: 15_000 }).should('eq', '');
    cy.go('back');
    cy.location('pathname', { timeout: 15_000 }).should('eq', '/inference');
  });

  it('warms a hovered option and derives the reference without a request', () => {
    cy.viewport(1280, 900);
    cy.visit('/overview');
    let jsonRequests = 0;
    cy.intercept('GET', '**/api/v1/overview*', () => {
      jsonRequests += 1;
    }).as('overviewJson');

    cy.get('[data-testid="overview-tier-switcher"]').contains('a', '100').trigger('pointerover');
    cy.wait('@overviewJson');
    cy.location('search').should('eq', '');
    cy.then(() => {
      expect(jsonRequests, 'hover warms exactly one response').to.equal(1);
    });

    cy.get('[data-testid="overview-tier-switcher"]').contains('a', '100').click();
    cy.location('search').should('eq', '?tier=100');
    cy.then(() => {
      expect(jsonRequests, 'the click reuses the warmed response').to.equal(1);
    });

    cy.get('[data-testid="overview-reference-select"]').click();
    cy.get('[data-overview-reference="b300"]').click();
    cy.location('search', { timeout: 15_000 }).should('eq', '?tier=100&ref=b300');
    cy.get('[data-overview-comparison="hardware"]').should('contain.text', 'vs B300');
    cy.then(() => {
      expect(jsonRequests, 'a reference change is derived, not fetched').to.equal(1);
    });
  });

  it('keeps focus on the option the keyboard activated', () => {
    cy.viewport(1280, 900);
    cy.visit('/overview');

    cy.get('[data-overview-comparison="30d"]').click();
    cy.get('[data-overview-comparison="30d"]', { timeout: 15_000 }).should(
      'have.attr',
      'aria-current',
      'true',
    );
    cy.focused().should('have.attr', 'data-overview-comparison', '30d');
  });

  it('reveals deprecated and maintenance models via the bottom toggle', () => {
    cy.viewport(1280, 900);
    cy.visit('/overview');
    cy.get('[data-testid="overview-desktop-model"][data-model="gpt-oss-120b"]').should('not.exist');

    cy.get('[data-testid="overview-model-scope-toggle"]')
      .find('[data-overview-model-scope="all"]')
      .click();
    cy.location('search').should('eq', '?models=all');

    desktopModel('gpt-oss-120b')
      .find('[data-testid="overview-model-category-badge"]')
      .should('have.attr', 'data-category', 'deprecated')
      .and('contain.text', 'Deprecated');
    desktopModel('DeepSeek-R1-0528')
      .find('[data-testid="overview-model-category-badge"]')
      .should('have.attr', 'data-category', 'maintenance');
    desktopModel('DeepSeek-V4-Pro', SINGLE_TURN)
      .find('[data-testid="overview-model-category-badge"]')
      .should('not.exist');
    cy.get('[data-testid="overview-desktop-model"]').then(([...rows]) => {
      const models = rows.map((row) => row.dataset.model);
      expect(models.indexOf('gpt-oss-120b')).to.be.greaterThan(
        models.lastIndexOf('Qwen-3.5-397B-A17B'),
      );
    });

    cy.get('[data-testid="overview-tier-switcher"]').contains('a', '75').click();
    cy.location('search').should('eq', '?tier=75&models=all');
    cy.get('[data-testid="overview-desktop-model"][data-model="gpt-oss-120b"]').should('exist');

    cy.get('[data-testid="overview-model-scope-toggle"]')
      .find('[data-overview-model-scope="default"]')
      .click();
    cy.location('search').should('eq', '?tier=75');
    cy.get('[data-testid="overview-desktop-model"][data-model="gpt-oss-120b"]').should('not.exist');
  });

  it('localizes the model scope toggle and badges on the Chinese route', () => {
    cy.viewport(1280, 900);
    cy.visit('/zh/overview?models=all');

    cy.get('[data-testid="overview-model-scope-toggle"]').should(
      'contain.text',
      '隐藏已弃用与维护模式模型',
    );
    desktopModel('gpt-oss-120b')
      .find('[data-testid="overview-model-category-badge"]')
      .should('contain.text', '已弃用');
  });

  it('uses a selectable hardware reference and preserves it across overview controls', () => {
    cy.viewport(1280, 900);
    cy.visit('/overview');

    cy.get('[data-testid="overview-reference-select"]').click();
    cy.get('[data-overview-reference="b300"]').click();
    cy.location('search').should('eq', '?ref=b300');

    cy.get('[data-overview-comparison="hardware"]')
      .should('have.attr', 'aria-current', 'true')
      .and('contain.text', 'vs B300');
    cy.get('[data-testid="overview-desktop-matrix"] thead').within(() => {
      cy.contains('th', 'B300 · Reference').should('exist');
      cy.contains('th', 'B200 · Reference').should('not.exist');
    });
    desktopModel('Qwen-3.5-397B-A17B', SINGLE_TURN).within(() => {
      platform('b300').find('[data-testid="overview-cost-delta"]').should('not.exist');
      platform('b200').find('[data-testid="overview-cost-delta"]').should('exist');
    });

    cy.get('[data-testid="overview-tier-switcher"]')
      .contains('a', '100')
      .should('have.attr', 'href', '/overview?tier=100&ref=b300');
    cy.get('[data-testid="overview-engine-scope-switcher"]')
      .find('[data-overview-engine-scope="all"]')
      .should('have.attr', 'href', '/overview?engine=all&ref=b300');
    cy.get('[data-overview-comparison="30d"]').should(
      'have.attr',
      'href',
      '/overview?ref=b300&compare=30d',
    );
    cy.get('[data-testid="language-toggle"]')
      .should('have.attr', 'href', '/zh/overview?ref=b300')
      .click();
    cy.location('pathname').should('eq', '/zh/overview');
    cy.location('search').should('eq', '?ref=b300');
    cy.get('[data-overview-comparison="hardware"]').should('contain.text', '对比 B300');
  });

  it('uses rack SKU labels when GB200 or GB300 is the comparison reference', () => {
    cy.viewport(1280, 900);
    cy.visit('/overview?ref=gb200');

    cy.get('[data-overview-comparison="hardware"]').should('contain.text', 'vs GB200 NVL72');
    cy.get('[data-testid="overview-methodology"]').should('contain.text', 'GB200 NVL72 baseline');
  });

  it('switches between B200 and 30-day comparison without losing page state', () => {
    cy.viewport(1280, 900);
    cy.visit('/overview');

    cy.get('[data-testid="overview-page"]')
      .children('[data-testid="overview-comparison-switcher"]')
      .should('have.length', 1)
      .and('have.class', 'justify-center');
    cy.get('[data-testid="overview-comparison-switcher"]')
      .should('have.attr', 'aria-label', 'Compare')
      .within(() => {
        cy.get('[data-overview-comparison="hardware"]')
          .should('have.attr', 'aria-current', 'true')
          .and('match', 'span')
          .and('have.text', 'vs B200')
          .then(([active]) => {
            const style = getComputedStyle(active);
            expect(style.borderBottomWidth).to.equal('2px');
            expect(style.backgroundColor).to.match(/rgba\(0, 0, 0, 0\)|transparent/);
          });
        cy.get('[data-overview-comparison="30d"]')
          .should('have.attr', 'href', '/overview?compare=30d')
          .and('have.text', 'Change over time')
          .click();
      });

    cy.location('search').should('eq', '?compare=30d');
    cy.get('[data-testid="overview-comparison-switcher"]')
      .find('[data-overview-comparison="30d"]')
      .should('have.attr', 'aria-current', 'true')
      .and('match', 'span');
    cy.get('[data-testid="overview-desktop-matrix"] thead').should('contain.text', 'B200');
    cy.get('[data-testid="overview-desktop-matrix"] thead').should('not.contain.text', 'Reference');

    cy.get('[data-testid="overview-tier-switcher"]')
      .contains('a', '100')
      .should('have.attr', 'href', '/overview?tier=100&compare=30d');
    cy.get('[data-testid="overview-engine-scope-switcher"]')
      .find('[data-overview-engine-scope="all"]')
      .should('have.attr', 'href', '/overview?engine=all&compare=30d');
    cy.get('[data-testid="language-toggle"]')
      .should('have.attr', 'href', '/zh/overview?compare=30d')
      .click();
    cy.location('pathname').should('eq', '/zh/overview');
    cy.location('search').should('eq', '?compare=30d');
    cy.get('[data-testid="overview-comparison-switcher"]')
      .should('have.attr', 'aria-label', '对比方式')
      .within(() => {
        cy.get('[data-overview-comparison="hardware"]').should('have.text', '对比 B200');
        cy.get('[data-overview-comparison="30d"]')
          .should('have.attr', 'aria-current', 'true')
          .and('have.text', '对比 1 个月前');
      });
    cy.contains('当前成本及其相对 30–60 天前最近一次有效平台结果的变化。').should('exist');
    cy.contains('缺少有效 30 天对比的平台仅显示当前成本。').should('exist');
  });

  it('switches the history window through the embedded selector', () => {
    cy.viewport(1280, 900);
    cy.visit('/overview?compare=30d');

    cy.get('[data-testid="overview-history-window-select"]').click();
    cy.get('[data-overview-window="7d"]').click();
    cy.location('search', { timeout: 15_000 }).should('eq', '?compare=7d');
    cy.get('[data-overview-comparison="7d"]').should('have.attr', 'aria-current', 'true');
    cy.contains(
      'Current cost and change versus the latest validated platform result 7–14 days earlier.',
    ).should('exist');

    cy.get('[data-testid="overview-history-window-select"]').click();
    cy.get('[data-overview-window="90d"]').click();
    cy.location('search', { timeout: 15_000 }).should('eq', '?compare=90d');
    cy.contains(
      'Current cost and change versus the latest validated platform result 90–180 days earlier.',
    ).should('exist');
  });

  it('compares each platform with its own validated result from 30–60 days earlier', () => {
    cy.viewport(1280, 900);
    cy.visit('/overview?compare=30d');

    desktopModel('Qwen-3.5-397B-A17B', SINGLE_TURN).within(() => {
      cy.contains('a', 'View details').should('not.exist');
      // Unlike the hardware view, B200 is a normal platform in the historical
      // view and receives its own change badge and heat-map tint.
      platform('b200')
        .find('[data-testid="overview-cost-delta"]')
        .as('b200HistoryDelta')
        .should('have.attr', 'data-history-status', 'comparable')
        .and('have.attr', 'data-cost-polarity', 'cheaper')
        .and('contain.text', '-17%');
      cy.get('@b200HistoryDelta')
        .should(($badge) => {
          expect($badge).not.to.have.attr('aria-label');
        })
        .find('.sr-only')
        .should('have.text', '17% cheaper than this platform’s Jun 10 result');
      platform('mi355x')
        .find('[data-testid="overview-cost-delta"]')
        .should('have.attr', 'data-history-status', 'comparable')
        .and('have.attr', 'data-cost-polarity', 'cheaper')
        .and('contain.text', '-25%');
      platform('b300').find('[data-testid="overview-cost-delta"]').should('not.exist');
      platform('b300').find('[data-testid="overview-history-detail-link"]').should('not.exist');
      platform('b300').then(([cell]) => {
        expect(getComputedStyle(cell.closest('td')!).backgroundColor).to.match(
          /rgba\(0, 0, 0, 0\)|transparent/,
        );
      });
      platform('gb200').find('[data-testid="overview-cost-delta"]').should('not.exist');
      platform('mi355x')
        .find('[data-testid="overview-history-detail-link"]')
        .should('have.text', 'Compare curves')
        .and('have.attr', 'href')
        .then((href) => {
          const url = new URL(String(href), 'https://inferencex.local');
          expect(url.pathname).to.equal('/inference');
          expect(url.searchParams.get('g_model')).to.equal('Qwen-3.5-397B-A17B');
          expect(url.searchParams.get('i_metric')).to.equal('y_costh');
          expect(url.searchParams.get('i_xmode')).to.equal('interactivity');
          const comparisonEntries = url.searchParams.get('i_dates')?.split(',') ?? [];
          expect(comparisonEntries).to.have.length(2);
          expect(comparisonEntries[0]).to.equal(url.searchParams.get('g_rundate'));
          expect(comparisonEntries[1]).to.match(/^\d{4}-\d{2}-\d{2}(?:~r\d+)?$/u);
          const currentKey = url.searchParams.get('i_overview_current');
          const baselineKey = url.searchParams.get('i_overview_baseline');
          expect(currentKey).to.be.a('string');
          expect(currentKey).not.to.equal('');
          expect(baselineKey).to.be.a('string');
          expect(baselineKey).not.to.equal('');
          expect(url.searchParams.has('i_spec')).to.equal(false);
          expect(url.searchParams.has('i_disagg')).to.equal(false);
        });
    });

    desktopModel('DeepSeek-V4-Pro', AGENTX).within(() => {
      platform('b200')
        .find('[data-testid="overview-cost-delta"]')
        .should('have.attr', 'data-history-status', 'comparable');
      platform('mi355x')
        .find('[data-testid="overview-cost-delta"]')
        .should('have.attr', 'data-history-status', 'comparable');
    });

    cy.contains(
      'Current cost and change versus the latest validated platform result 30–60 days earlier.',
    ).should('exist');
    cy.get('[data-testid="overview-cost-delta"]').should('not.contain.text', '∞');
    cy.contains('Platforms without a valid 30-day comparison show current cost only.').should(
      'exist',
    );
    expectNoVisibleDatesOrSnapshot();
  });

  it('releases the exact history pair after a model change', () => {
    cy.viewport(1280, 900);
    cy.visit('/overview?compare=30d');

    desktopModel('Qwen-3.5-397B-A17B', SINGLE_TURN)
      .find('[data-testid="overview-history-detail-link"]')
      .first()
      .then(($link) => {
        const href = String($link.attr('href'));
        cy.visit(href);

        cy.get('[data-testid="inference-chart-display"]').should('exist');
        cy.get('[data-testid="model-selector"]').click();
        cy.contains('[role="option"]', 'DeepSeek V4 Pro 1.6T').click();
        cy.get('[data-testid="model-selector"]').should('contain.text', 'DeepSeek V4 Pro 1.6T');
        cy.get('[data-testid="inference-chart-display"]').should(
          'not.contain.text',
          'No data available',
        );
        cy.get('[data-testid="chart-figure"] svg').should('exist');
      });
  });

  it('does not flag the comparison date range after following a history cell', () => {
    cy.viewport(1280, 900);
    cy.visit('/overview?compare=30d');

    desktopModel('Qwen-3.5-397B-A17B', SINGLE_TURN)
      .find('[data-testid="overview-history-detail-link"]')
      .first()
      .then(($link) => {
        cy.visit(String($link.attr('href')));

        cy.contains('Comparison Date Range').should('be.visible');
        cy.contains('button', 'Select date range').should('not.have.class', 'animate-pulse');
      });
  });

  it('keeps the historical comparison complete and non-scrolling across desktop, tablet and phone', () => {
    for (const width of [320, 390, 768, 1024, 1279, 1280, 1440]) {
      cy.viewport(width, 900);
      cy.visit('/overview?compare=30d');

      cy.get('[data-testid="overview-comparison-switcher"]')
        .should('be.visible')
        .find('[data-overview-comparison]')
        .each(($option) => {
          expect($option[0].getBoundingClientRect().height).to.be.at.least(44);
        });
      cy.get('[data-testid="overview-cost-delta"][data-hardware="b200"]').should('exist');
      cy.get('[data-testid="overview-history-detail-link"]')
        .filter(':visible')
        .first()
        .then(([link]) => {
          expect(link.getBoundingClientRect().height).to.be.at.least(width < 1280 ? 44 : 32);
        });
      expectNoHorizontalOverflow();
      if (width < 1280) {
        expectNoHorizontalScroller('overview-mobile-list');
        expectNoHorizontalScroller('overview-comparison-switcher');
      } else {
        expectNoHorizontalScroller('overview-desktop-matrix');
      }
    }
  });

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

    // Standard decode is the exception, so that cell badges STP. Qwen's GB300
    // slice is standard-decode only; its other platforms stay speculative.
    desktopModel('Qwen-3.5-397B-A17B', SINGLE_TURN).within(() => {
      platform('gb300').should('contain.text', 'SGLang · FP8 · STP');
      platform('b200').should('not.contain.text', 'STP');
      platform('mi355x').should('not.contain.text', 'STP');
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
          'contain.text',
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
    for (const model of ['DeepSeek-V4-Pro', 'MiniMax-M3', 'Qwen-3.5-397B-A17B']) {
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
          .and('contain.text', 'no exact @50 result');
      });
      platform('gb300').within(() => {
        cy.get('[data-testid="overview-pair-missing"][data-hardware="gb300"]')
          .should('contain.text', '—')
          .and('contain.text', 'no exact @50 result');
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
        .and('contain.text', 'no data for this scenario');
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
          .and('contain.text', 'cannot reach @100');
      });
    });

    cy.visit('/overview?tier=30');
    desktopModel('DeepSeek-V4-Pro', SINGLE_TURN).within(() => {
      platform('b300').within(() => {
        cy.get('[data-testid="overview-pair-missing"][data-hardware="b300"]')
          .should('contain.text', '—')
          .and('contain.text', 'no exact @30 result');
      });
      platform('b200')
        .find('[data-testid="overview-pair-missing"]')
        .should('contain.text', '—')
        .and('contain.text', 'no exact @30 result');
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

      cy.get('[data-testid="mobile-chart-select"]').should('not.exist');
      cy.get('[data-testid="overview-mobile-list"]').should('be.visible');
      cy.get('[data-testid="overview-tier-switcher"]').should('be.visible');
      cy.get('[data-testid="overview-engine-scope-switcher"]')
        .should('be.visible')
        .find('[data-overview-engine-scope]')
        .each(($option) => {
          expect($option[0].getBoundingClientRect().height).to.be.at.least(44);
        });
      cy.get('[data-testid="overview-desktop-matrix"]').should('not.exist');
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
          'contain.text',
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
                // Electron can report a 1.5 CSS-pixel font-rasterization delta;
                // two pixels still constrains both labels to the same baseline.
                expect(textRect(badgeText as Element).bottom).to.be.closeTo(
                  textRect(value).bottom,
                  2,
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
      .and('contain.text', '无精确 @50 结果');
    cy.get('body')
      .invoke('text')
      .should('not.match', /回退/);
    cy.get('body')
      .invoke('text')
      .should('not.match', /100 档由.+领先/);
    desktopModel('Qwen-3.5-397B-A17B', SINGLE_TURN).within(() => {
      // Stack badges stay English on the Chinese page: framework, precision and
      // the STP decode marker are all product identifiers, not UI copy.
      platform('gb300').should('contain.text', 'SGLang · FP8 · STP');
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
        .should('contain.text', '该场景暂无数据');
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
