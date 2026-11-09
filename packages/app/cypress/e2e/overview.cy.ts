import { TCO_SOURCE_TITLE, TCO_SOURCE_URL } from '@semianalysisai/inferencex-constants';

const MODEL_LABELS = [
  'Muse Spark Open 816B',
  'DeepSeek V4.1 Flash 552B',
  'Kimi K3.1 Pro 2.8T',
  'MiniMax M3.1 Flash 428B',
  'GLM5.2/GLM5.3',
  'Qwen3.5 397B',
];

const PLATFORM_HEADERS = [
  'Model · scenario',
  'B200 · Reference',
  'MI355X',
  'B300',
  'GB200 NVL72',
  'GB300 NVL72',
];

const SINGLE_TURN = 'single_turn_8k1k';
const MATRIX_ROWS = 8;
const AGENTX = 'agentx';
const AGENTX_LABEL = 'Long-context multi-turn realistic agentic scenario (AgentX)';
const AGENTX_SHORT = 'AgentX';

const PAGE_TITLE = 'Agentic inference costs';
const SOURCE_NOTE = `Source: InferenceX & ${TCO_SOURCE_TITLE}`;
const SOURCE_NOTE_ZH = `来源：InferenceX 与 ${TCO_SOURCE_TITLE}`;
const SCOPE_METRIC = 'Hyperscaler cost';
const SCOPE_DIRECTION = '↓ Lower is better';
const SCOPE_LINE = `${SCOPE_METRIC} · ${SCOPE_DIRECTION}`;
const SCOPE_METRIC_ZH = '超大规模云厂商成本';
const SCOPE_DIRECTION_ZH = '↓ 越低越好';
const SCOPE_LINE_ZH = `${SCOPE_METRIC_ZH} · ${SCOPE_DIRECTION_ZH}`;
const OVERVIEW_TIERS = [30, 50, 75, 100, 150, 200] as const;

function selectOverviewTier(tier: (typeof OVERVIEW_TIERS)[number]) {
  const targetIndex = OVERVIEW_TIERS.indexOf(tier);
  cy.get('[data-testid="overview-page"] [aria-busy]').should('have.attr', 'aria-busy', 'false');
  return cy.get<HTMLInputElement>('[data-testid="overview-tier-slider"]').should(([slider]) => {
    const view = slider.ownerDocument.defaultView;
    if (view === null) throw new Error('Slider has no window');
    const tracker = (slider as { _valueTracker?: { setValue: (next: string) => void } })
      ._valueTracker;
    expect(tracker, 'tier slider is hydrated').to.not.eq(undefined);
    const nativeValueSetter = Object.getOwnPropertyDescriptor(
      view.HTMLInputElement.prototype,
      'value',
    )?.set;
    if (nativeValueSetter === undefined) throw new Error('Range input has no native value setter');
    nativeValueSetter.call(slider, String(targetIndex));
    tracker?.setValue('');
    slider.dispatchEvent(new view.Event('input', { bubbles: true }));
    expect(slider.dataset.tier, 'slider committed tier').to.eq(String(tier));
  });
}

function expectScope(line: string, sourceNote: string) {
  cy.get('[data-testid="overview-scope"]').should('have.text', line);
  cy.get('[data-testid="overview-source-link"]').parent().should('have.text', sourceNote);
}

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
          el.getAttribute('aria-hidden') !== 'true' &&
          getComputedStyle(el).display !== 'inline' &&
          el.scrollWidth > el.clientWidth + 1,
      )
      .map((el) => `${el.tagName} ${el.scrollWidth}>${el.clientWidth}`);
    expect(scrollers, `horizontally scrollable inside ${testId}`).to.deep.equal([]);
  });
}

function expectAgentxScenario(fullLabel: string) {
  cy.get('[data-testid="overview-model-scenario"]')
    .should('have.attr', 'title', fullLabel)
    .within(() => {
      cy.get('.sr-only').should('have.text', fullLabel);
      cy.get('[aria-hidden="true"]').should('have.text', AGENTX_SHORT);
    });
}

function expectNoVisibleDatesOrSnapshot() {
  cy.get('[data-testid="overview-pair-evidence-date"]').should('not.exist');
  cy.get('body')
    .then(([body]) => {
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

function desktopModel(model: string, scenario?: string) {
  const row = scenario === undefined ? '' : `[data-scenario="${scenario}"]`;
  return cy.get(`[data-testid="overview-desktop-model"][data-model="${model}"]${row}`);
}

function mobileModel(model: string, scenario?: string) {
  const row = scenario === undefined ? '' : `[data-scenario="${scenario}"]`;
  return cy.get(`[data-testid="overview-mobile-model"][data-model="${model}"]${row}`);
}

function expectCellTint(hardware: string, token: '--success' | '--destructive', alpha: number) {
  platform(hardware).then(([cell]) => {
    const probe = cell.ownerDocument.createElement('span');
    probe.style.backgroundColor = `oklch(from var(${token}) l c h)`;
    cell.ownerDocument.body.append(probe);
    const tokenColor = getComputedStyle(probe).backgroundColor;
    probe.remove();
    const background = getComputedStyle(cell.closest('td')!).backgroundColor;
    expect(tokenColor).to.match(/^oklch\(/);
    expect(background).to.match(/^oklch\(/);
    const [tokenChannels, cellChannels] = [tokenColor, background].map((color) =>
      color.match(/[\d.]+/g)!.map(Number),
    );
    tokenChannels.forEach((channel, index) => {
      expect(cellChannels[index]).to.be.closeTo(channel, 0.01);
    });
    expect(cellChannels[3]).to.eq(alpha);
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
  for (const locale of ['', '/zh']) {
    it(`defaults to one month ago at 100 tok/s/user in ${locale || 'en'}`, () => {
      cy.visit(`${locale}/overview`);
      cy.get('[data-testid="overview-tier-slider"]').should('have.attr', 'data-tier', '100');
      cy.get('[data-overview-comparison="30d"]').should('have.attr', 'aria-current', 'true');
      cy.request('/api/v1/views/overview').then(({ body }) => {
        expect(body.params).to.include({ tier: 100, compare: '30d' });
        expect(body.historicalWindow.key).to.eq('30d');
      });
      cy.get('[data-overview-comparison="hardware"]').click();
      cy.location('search').should('eq', '?compare=hardware');
      selectOverviewTier(50);
      cy.location('search').should('eq', '?tier=50&compare=hardware');
      cy.reload();
      cy.get('[data-testid="overview-tier-slider"]').should('have.attr', 'data-tier', '50');
      cy.get('[data-overview-comparison="hardware"]').should('have.attr', 'aria-current', 'true');
    });
  }

  for (const locale of ['', '/zh']) {
    it(`gates the Flash matrix row through unlock, reload, and relock in ${locale || 'en'}`, () => {
      cy.viewport(1280, 900);
      cy.visit(`${locale}/overview?tier=50&compare=hardware`, {
        onBeforeLoad(win) {
          win.localStorage.removeItem('inferencex-feature-gate-konami-v1');
        },
      });
      cy.get('[data-testid="overview-desktop-model"]').should('have.length', MATRIX_ROWS);
      desktopModel('GLM-5.3-Flash', AGENTX).should('not.exist');
      cy.window().then((win) => {
        win.localStorage.setItem('inferencex-feature-gate-konami-v1', '1');
        win.dispatchEvent(new win.Event('inferencex:feature-gate:unlocked'));
      });
      cy.get('[data-testid="overview-desktop-model"]').should('have.length', MATRIX_ROWS + 1);
      desktopModel('GLM-5.3-Flash', AGENTX)
        .should('contain.text', 'GLM 5.3 Flash')
        .then(($row) => {
          const platforms = $row.find('[data-testid="overview-platform"]').length;
          const blank = $row.find('[data-testid="overview-row-no-results"]').length;
          expect(platforms === 5 || (platforms === 0 && blank === 1)).to.equal(true);
        });
      cy.reload();
      cy.get('[data-testid="overview-desktop-model"]').should('have.length', MATRIX_ROWS + 1);
      desktopModel('GLM-5.3-Flash', AGENTX).scrollIntoView().should('be.visible');
      cy.window().then((win) => {
        win.localStorage.removeItem('inferencex-feature-gate-konami-v1');
        win.dispatchEvent(new win.Event('inferencex:feature-gate:locked'));
      });
      cy.get('[data-testid="overview-desktop-model"]').should('have.length', MATRIX_ROWS);
      desktopModel('GLM-5.3-Flash', AGENTX).should('not.exist');
    });
  }

  it('updates selectors through cached overview JSON without an RSC round trip', () => {
    cy.viewport(1280, 900);
    cy.visit('/overview?tier=50&compare=hardware');
    cy.get('[data-overview-comparison="hardware"]').should('have.attr', 'aria-current', 'true');
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

    selectOverviewTier(75);
    cy.wait('@overviewJson');
    cy.location('search').should('eq', '?tier=75&compare=hardware');
    cy.window().its('__overviewNavigationSentinel').should('eq', 'preserved');

    selectOverviewTier(50);
    cy.location('search').should('eq', '?tier=50&compare=hardware');
    selectOverviewTier(75);
    cy.location('search').should('eq', '?tier=75&compare=hardware');
    cy.then(() => {
      expect(jsonRequests, 'one request; both visited selections are cached').to.equal(1);
      expect(rscUrls, 'selector RSC requests').to.deep.equal([]);
    });

    cy.get('[data-testid="overview-engine-scope-switcher"]')
      .find('[data-overview-engine-scope="all"]')
      .click();
    cy.wait('@overviewJson');
    cy.location('search').should('eq', '?tier=75&engine=all&compare=hardware');
    cy.window().its('__overviewNavigationSentinel').should('eq', 'preserved');

    cy.get('[data-overview-comparison="30d"]').click();
    cy.wait('@overviewJson');
    cy.location('search').should('eq', '?tier=75&engine=all');
    cy.window().its('__overviewNavigationSentinel').should('eq', 'preserved');

    cy.go('back');
    cy.get('[data-overview-comparison="hardware"]').should('have.attr', 'aria-current', 'true');
    cy.location('search').should('eq', '?tier=75&engine=all&compare=hardware');
    cy.then(() => {
      expect(rscRequests, 'selector and popstate RSC requests').to.equal(0);
    });
  });

  it('keeps one history entry when the overview request fails', () => {
    cy.viewport(1280, 900);
    cy.visit('/infx/inference');
    cy.visit('/overview?tier=50&compare=hardware');
    cy.get('[data-overview-comparison="hardware"]').should('have.attr', 'aria-current', 'true');
    cy.intercept('GET', '**/api/v1/overview*', { statusCode: 500 }).as('overviewJsonFailure');

    cy.window().then((win) => {
      const before = win.history.length;
      selectOverviewTier(75);
      cy.wait('@overviewJsonFailure');
      cy.location('search').should('eq', '?tier=75&compare=hardware');
      cy.window().then((after) => {
        expect(after.history.length - before, 'one entry for one selection').to.equal(1);
      });
      selectOverviewTier(75);
      cy.wait('@overviewJsonFailure');
      cy.location('search').should('eq', '?tier=75&compare=hardware');
      cy.window().then((after) => {
        expect(after.history.length - before, 'retry adds no history entry').to.equal(1);
      });
    });

    cy.go('back');
    cy.location('search').should('eq', '?tier=50&compare=hardware');
    cy.go('back');
    cy.location('pathname').should('eq', '/infx/inference/kimi-k31-pro');
  });

  it('reveals deprecated and maintenance models via the toolbar toggle', () => {
    cy.viewport(1280, 900);
    cy.visit('/overview?tier=50&compare=hardware');
    cy.get('[data-testid="overview-desktop-model"][data-model="gpt-oss-120b"]').should('not.exist');
    desktopModel('MiniMax-M3').should('not.exist');
    desktopModel('DeepSeek-V4-Pro').should('not.exist');
    desktopModel('MiniMax-M3.1-Flash', AGENTX).should('exist');

    cy.get('[data-testid="overview-model-scope-toggle"]')
      .find('[data-overview-model-scope="all"]')
      .click();
    cy.location('search').should('eq', '?tier=50&compare=hardware&models=all');

    desktopModel('gpt-oss-120b')
      .find('[data-testid="overview-model-category-badge"]')
      .should('have.attr', 'data-category', 'deprecated')
      .and('contain.text', 'Deprecated')
      .and('contain.text', 'Model is no longer actively benchmarked.');
    desktopModel('MiniMax-M3', AGENTX)
      .find('[data-testid="overview-model-category-badge"]')
      .should('have.attr', 'data-category', 'deprecated');
    desktopModel('DeepSeek-R1-0528')
      .find('[data-testid="overview-model-category-badge"]')
      .should('have.attr', 'data-category', 'maintenance');
    desktopModel('DeepSeek-V4-Pro', AGENTX)
      .find('[data-testid="overview-model-category-badge"]')
      .should('have.attr', 'data-category', 'deprecated');
    cy.get('[data-testid="overview-desktop-model"]').then(([...rows]) => {
      const models = rows.map((row) => row.dataset.model);
      expect(models.indexOf('gpt-oss-120b')).to.be.greaterThan(
        models.lastIndexOf('Qwen-3.5-397B-A17B'),
      );
    });

    selectOverviewTier(75);
    cy.location('search').should('eq', '?tier=75&compare=hardware&models=all');
    cy.get('[data-testid="overview-desktop-model"][data-model="gpt-oss-120b"]').should('exist');

    cy.get('[data-testid="overview-model-scope-toggle"]')
      .find('[data-overview-model-scope="default"]')
      .click();
    cy.location('search').should('eq', '?tier=75&compare=hardware');
    cy.get('[data-testid="overview-desktop-model"][data-model="gpt-oss-120b"]').should('not.exist');
    desktopModel('MiniMax-M3').should('not.exist');
    desktopModel('DeepSeek-V4-Pro').should('not.exist');
  });

  it('uses a selectable hardware reference and preserves it across overview controls', () => {
    cy.viewport(1280, 900);
    cy.visit('/overview?tier=50&compare=hardware');

    cy.get('[data-testid="overview-reference-select"]').click();
    cy.get('[data-overview-reference="b300"]').click();
    cy.location('search').should('eq', '?tier=50&ref=b300&compare=hardware');

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

    selectOverviewTier(100);
    cy.location('search').should('eq', '?ref=b300&compare=hardware');
    cy.get('[data-testid="overview-engine-scope-switcher"]')
      .find('[data-overview-engine-scope="all"]')
      .should('have.attr', 'href', '/overview?engine=all&ref=b300&compare=hardware');
    cy.get('[data-overview-comparison="30d"]').should('have.attr', 'href', '/overview?ref=b300');
    cy.get('[data-testid="language-toggle"]')
      .should('have.attr', 'href', '/zh/overview?ref=b300&compare=hardware')
      .click();
    cy.location('pathname').should('eq', '/zh/overview');
    cy.location('search').should('eq', '?ref=b300&compare=hardware');
    cy.get('[data-overview-comparison="hardware"]').should('contain.text', '对比 B300');
  });

  it('sends one RSC request when a slow language switch preserves overview state', () => {
    let zhOverviewRscRequests = 0;

    cy.intercept('GET', '/zh/overview*', (request) => {
      if (request.query._rsc === undefined && request.headers.rsc !== '1') return;

      zhOverviewRscRequests += 1;
      request.continue((response) => {
        response.setDelay(600);
      });
    });

    cy.visit('/overview?ref=b300&compare=hardware');
    cy.get('[data-testid="language-toggle"]')
      .should('have.attr', 'href', '/zh/overview?ref=b300&compare=hardware')
      .click();

    cy.location('pathname').should('eq', '/zh/overview');
    cy.location('search').should('eq', '?ref=b300&compare=hardware');
    cy.then(() => expect(zhOverviewRscRequests).to.equal(1));
  });

  it('switches between B200 and 30-day comparison without losing page state', () => {
    cy.viewport(1280, 900);
    cy.visit('/overview?tier=50&compare=hardware');

    cy.get('[data-testid="overview-presentation-surface"]')
      .find('[data-testid="overview-comparison-switcher"]')
      .should('have.length', 1)
      .and('have.class', 'justify-start');
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
          .should('have.attr', 'href', '/overview?tier=50')
          .and('have.text', 'Change over time')
          .click();
      });

    cy.location('search').should('eq', '?tier=50');
    cy.get('[data-testid="overview-comparison-switcher"]')
      .find('[data-overview-comparison="30d"]')
      .should('have.attr', 'aria-current', 'true')
      .and('match', 'span');
    cy.get('[data-testid="overview-desktop-matrix"] thead').should('contain.text', 'B200');
    cy.get('[data-testid="overview-desktop-matrix"] thead').should('not.contain.text', 'Reference');

    selectOverviewTier(100);
    cy.location('search').should('eq', '');
    cy.get('[data-testid="overview-engine-scope-switcher"]')
      .find('[data-overview-engine-scope="all"]')
      .should('have.attr', 'href', '/overview?engine=all');
    cy.get('[data-testid="language-toggle"]').should('have.attr', 'href', '/zh/overview').click();
    cy.location('pathname').should('eq', '/zh/overview');
    cy.location('search').should('eq', '');
    cy.get('[data-testid="overview-comparison-switcher"]')
      .should('have.attr', 'aria-label', '对比方式')
      .within(() => {
        cy.get('[data-overview-comparison="hardware"]').should('have.text', '对比 B200');
        cy.get('[data-overview-comparison="30d"]')
          .should('have.attr', 'aria-current', 'true')
          .and('have.text', '对比 1 个月前');
      });
    cy.get('[data-testid="overview-methodology"] p')
      .eq(0)
      .should('be.visible')
      .and('contain.text', '30')
      .should('contain.text', '60');
    cy.get('[data-testid="overview-methodology"] p')
      .eq(1)
      .should('be.visible')
      .and('contain.text', '30');
  });

  it('switches the history window through the embedded selector', () => {
    cy.viewport(1280, 900);
    cy.visit('/overview?tier=50');

    cy.get('[data-testid="overview-history-window-select"]').click();
    cy.get('[data-overview-window="7d"]').click();
    cy.location('search').should('eq', '?tier=50&compare=7d');
    cy.get('[data-overview-comparison="7d"]').should('have.attr', 'aria-current', 'true');
    cy.contains(
      'Current cost and change versus the latest validated platform result 7–14 days earlier.',
    ).should('exist');

    cy.get('[data-testid="overview-history-window-select"]').click();
    cy.get('[data-overview-window="90d"]').click();
    cy.location('search').should('eq', '?tier=50&compare=90d');
    cy.contains(
      'Current cost and change versus the latest validated platform result 90–180 days earlier.',
    ).should('exist');
  });

  it('compares each platform with its own validated result from 30–60 days earlier', () => {
    cy.viewport(1280, 900);
    cy.visit('/overview?tier=50&models=all');

    desktopModel('Qwen-3.5-397B-A17B', SINGLE_TURN).within(() => {
      cy.contains('a', 'View details').should('not.exist');
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
          expect(url.pathname).to.equal('/infx/inference');
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
      platform('mi355x').find('[data-testid="overview-cost-delta"]').should('not.exist');
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
    cy.visit('/overview?tier=50');

    desktopModel('Qwen-3.5-397B-A17B', SINGLE_TURN)
      .find('[data-testid="overview-history-detail-link"]')
      .first()
      .then(($link) => {
        const href = String($link.attr('href'));
        cy.visit(href);

        cy.get('[data-testid="inference-chart-display"]').should('exist');
        cy.contains('Comparison date range').should('be.visible');
        cy.contains('button', 'Select date range').should('not.have.class', 'animate-pulse');
        cy.get('[data-testid="model-selector"]').click();
        cy.contains('[role="option"]', 'DeepSeek V4 Pro 0813 1.6T').click();
        cy.get('[data-testid="model-selector"]').should(
          'contain.text',
          'DeepSeek V4 Pro 0813 1.6T',
        );
        cy.get('[data-testid="inference-chart-display"]').should(
          'not.contain.text',
          'No data available',
        );
        cy.get('[data-testid="chart-figure"] svg').should('exist');
      });
  });

  it('keeps a benchmark result usable without comparison dates', () => {
    cy.viewport(1280, 900);
    cy.visit('/overview?tier=50&compare=hardware');

    desktopModel('Qwen-3.5-397B-A17B', SINGLE_TURN)
      .find(
        '[data-testid="overview-pair-value"][data-hardware="mi355x"] [data-testid="overview-cost-evidence-link"]',
      )
      .then(($link) => {
        const href = String($link.attr('href'));
        expect(href).not.to.contain('i_dates=');
        cy.visit(href);

        cy.contains('Comparison date range').should('be.visible');
        cy.contains('button', 'Select date range')
          .should('not.have.class', 'animate-pulse')
          .and('not.have.class', 'border-red-500');
        cy.get('[data-testid="scatter-graph"]').should('be.visible');
        cy.scatterPoints().should('have.length.greaterThan', 0);
        cy.contains('Select a date range or add a run to view chip comparison').should('not.exist');
      });
  });

  it('does not require comparison dates when opening AgentX details', () => {
    cy.viewport(1280, 900);
    cy.visit('/overview?tier=50&compare=hardware');

    desktopModel('Qwen-3.5-397B-A17B', AGENTX)
      .contains('a', 'View details')
      .then(($link) => {
        const href = String($link.attr('href'));
        expect(href).to.contain('i_seq=agentic-traces');
        expect(href).not.to.contain('i_dates=');
        cy.visit(href);

        cy.contains('Comparison date range').should('not.exist');
      });
  });

  it('keeps the historical comparison complete and non-scrolling across desktop, tablet and phone', () => {
    for (const width of [320, 390, 768, 1024, 1279, 1280, 1440]) {
      cy.viewport(width, 900);
      cy.visit('/overview?tier=50');

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

  it('narrows the matrix when the row filter is clicked in either comparison mode', () => {
    cy.viewport(1280, 900);

    for (const [href, attribute, key, sentence] of [
      ['/overview?tier=50', 'data-overview-row-scope', 'rows=changed', 'no 30-day change'],
      [
        '/overview?tier=50&compare=hardware',
        'data-overview-hardware-row-scope',
        'hwrows=priced',
        'no result on any platform',
      ],
    ] as const) {
      cy.visit(href);
      cy.get('[data-testid="overview-desktop-model"]').should('have.length', MATRIX_ROWS);

      cy.get(`a[${attribute}]`)
        .should('contain.text', 'Hide ')
        .invoke('text')
        .then((label) => {
          const hidden = Number(/\d+/.exec(label)?.[0]);
          expect(hidden, `hidden row count in "${label}"`).to.be.greaterThan(0);

          cy.get(`a[${attribute}]`).click();
          cy.location('search').should('contain', key);
          cy.get('[data-testid="overview-desktop-model"]').should(
            'have.length',
            MATRIX_ROWS - hidden,
          );
          cy.get(`a[${attribute}]`)
            .should('contain.text', 'Show all rows')
            .and('contain.text', String(hidden))
            .and('have.attr', 'aria-label', `Show ${hidden} rows with ${sentence}`);
          cy.window().then((win) => {
            win.localStorage.setItem('inferencex-feature-gate-konami-v1', '1');
            win.dispatchEvent(new win.Event('inferencex:feature-gate:unlocked'));
          });
          cy.get(`a[${attribute}]`).should(
            'have.attr',
            'aria-label',
            `Show ${hidden + 1} rows with ${sentence}`,
          );
          cy.get('[data-testid="overview-desktop-model"]').should(
            'have.length',
            MATRIX_ROWS - hidden,
          );
          cy.window().then((win) => {
            win.localStorage.removeItem('inferencex-feature-gate-konami-v1');
            win.dispatchEvent(new win.Event('inferencex:feature-gate:locked'));
          });
          cy.get(`a[${attribute}]`)
            .should('have.attr', 'aria-label', `Show ${hidden} rows with ${sentence}`)
            .click();
          cy.get('[data-testid="overview-desktop-model"]').should('have.length', MATRIX_ROWS);
          cy.get(`a[${attribute}]`).should(
            'have.attr',
            'aria-label',
            `Hide ${hidden} rows with ${sentence}`,
          );
        });
    }
  });

  it('defaults to community engine scope and switches with canonical links preserving tier and locale', () => {
    cy.viewport(1280, 900);
    cy.visit('/overview?tier=50&compare=hardware');

    cy.get('[data-testid="overview-engine-scope-switcher"]')
      .should('have.attr', 'aria-label', 'Engine scope')
      .within(() => {
        cy.get('[data-overview-engine-scope="community"]')
          .should('have.attr', 'aria-current', 'true')
          .and('match', 'span')
          .and('have.text', 'Open-source community engines (vLLM/SGLang)')
          .and('not.have.attr', 'href');
        cy.get('[data-overview-engine-scope="all"]')
          .should('have.attr', 'href', '/overview?tier=50&engine=all&compare=hardware')
          .and('have.text', 'All platforms');
      });

    cy.get('[data-testid="overview-controls-panel"]')
      .should('match', 'fieldset')
      .and('contain.text', 'Benchmark config')
      .within(() => {
        cy.get('label').should('contain.text', 'SLO (tok/s/user)');
        cy.get('label').should('contain.text', 'Engine scope');
      });
    cy.get('[data-testid="overview-tier-switcher"]').then(([tier]) => {
      cy.get('[data-testid="overview-engine-scope-switcher"]').then(([scope]) => {
        expect(scope.getBoundingClientRect().top).to.be.closeTo(
          tier.getBoundingClientRect().top,
          2,
        );
      });
    });

    desktopModel('GLM-5.2').within(() => {
      expectAgentxScenario(AGENTX_LABEL);
      cy.get('[data-testid="overview-pair-missing"]').should('not.exist');
      cy.get('[data-testid="overview-row-no-results"]').should(
        'have.text',
        'No results at this SLO',
      );
    });
    cy.get(
      '[data-testid="overview-engine-scope-switcher"] [data-overview-engine-scope="all"]',
    ).click();
    cy.location('search').should('eq', '?tier=50&engine=all&compare=hardware');
    desktopModel('GLM-5.2').find('[data-testid="overview-row-no-results"]').should('exist');
    selectOverviewTier(100);
    cy.location('search').should('eq', '?engine=all&compare=hardware');

    cy.get('[data-testid="overview-engine-scope-switcher"]')
      .find('[data-overview-engine-scope="community"]')
      .should('have.attr', 'href', '/overview?compare=hardware');
    cy.get('[data-testid="language-toggle"]')
      .should('have.attr', 'href', '/zh/overview?engine=all&compare=hardware')
      .click();
    cy.location('pathname').should('eq', '/zh/overview');
    cy.location('search').should('eq', '?engine=all&compare=hardware');
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
    cy.visit('/overview?tier=50&compare=hardware&models=all');

    desktopModel('Qwen-3.5-397B-A17B', SINGLE_TURN).within(() => {
      platform('gb300').should('contain.text', 'SGLang · FP8 · STP');
      platform('b200').should('not.contain.text', 'STP');
      platform('mi355x').should('not.contain.text', 'STP');
    });

    desktopModel('DeepSeek-V4-Pro', AGENTX).within(() => {
      cy.contains('SGLang · FP4').should('exist');
      cy.get('[data-testid="overview-platform"]').should('not.contain.text', 'STP');
      cy.root().should('not.contain.text', 'Spec decode');
      platform('b200').within(() => {
        cy.get(
          '[data-testid="overview-pair-value"][data-hardware="b200"] [data-testid="overview-cost-evidence-link"]',
        ).should('have.text', '$0.059');
        cy.get(
          '[data-testid="overview-pair-value"][data-hardware="b200"] [data-testid="overview-cost-evidence-link"]',
        )
          .should(
            'have.attr',
            'title',
            'Estimated from validated benchmark runs. Open raw source dashboard for Jul 18: DeepSeek V4 Pro 0813 1.6T · B200 · SGLang · FP4 · MTP',
          )
          .and(
            'have.attr',
            'aria-label',
            'Approximately $0.059. Estimated from validated benchmark runs. Open raw source dashboard for Jul 18: DeepSeek V4 Pro 0813 1.6T · B200 · SGLang · FP4 · MTP',
          );
        cy.get('[data-testid="overview-pair-missing"]').should('not.exist');
      });
      platform('gb300').within(() => {
        cy.get('[data-testid="overview-pair-value"]').should('not.exist');
        cy.get('[data-testid="overview-pair-missing"][data-hardware="gb300"]').should(
          'contain.text',
          'no exact @50 result',
        );
      });
    });
    desktopModel('MiniMax-M3', AGENTX).within(() => {
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
    cy.visit('/overview?tier=50&compare=hardware&models=all');

    desktopModel('Qwen-3.5-397B-A17B', SINGLE_TURN).within(() => {
      platform('b200').find('[data-testid="overview-cost-delta"]').should('not.exist');
      platform('mi355x')
        .find('[data-testid="overview-cost-delta"]')
        .should('contain.text', '-14%')
        .and('have.attr', 'data-cost-polarity', 'cheaper')
        .then(($badge) => {
          expect($badge.attr('style') ?? '').not.to.contain('background');
        });
      expectCellTint('mi355x', '--success', 0.15);
    });

    desktopModel('DeepSeek-V4-Pro', AGENTX).within(() => {
      platform('gb200')
        .find('[data-testid="overview-cost-delta"]')
        .should('contain.text', '+71%')
        .and('have.attr', 'data-cost-polarity', 'pricier');
      expectCellTint('gb200', '--destructive', 0.32);
      platform('gb300').find('[data-testid="overview-cost-delta"]').should('not.exist');
      platform('gb300').then(([cell]) => {
        expect(getComputedStyle(cell.closest('td')!).backgroundColor).to.match(
          /rgba\(0, 0, 0, 0\)|transparent/,
        );
      });
    });

    desktopModel('Qwen-3.5-397B-A17B', SINGLE_TURN).within(() => {
      platform('b200').then(([cell]) => {
        const td = cell.closest('td')!;
        expect(td.getAttribute('style') ?? '').not.to.contain('background');
        expect(td.className).to.contain('bg-muted/15');
      });
    });

    desktopModel('MiniMax-M3', AGENTX).within(() => {
      platform('gb300')
        .find('[data-testid="overview-cost-delta"]')
        .should('contain.text', '∞')
        .and('have.attr', 'data-cost-polarity', 'no-baseline');
      platform('gb300').then(([cell]) => {
        expect(cell.closest('td')!.getAttribute('style') ?? '').not.to.contain('background');
      });
    });
  });

  it('renders the full platform matrix for every publicly visible active model', () => {
    cy.viewport(1280, 900);
    cy.visit('/overview?tier=50&compare=hardware');

    cy.get('[data-testid="chart-section-tabs"]').should('not.exist');
    cy.get('[data-testid="nav-link-overview"]')
      .should('have.attr', 'href', '/overview')
      .and('have.attr', 'aria-current', 'page');
    cy.get('[data-testid="nav-link-dashboard"]').should('not.have.attr', 'aria-current');

    cy.get('[data-testid="overview-source-link"]')
      .should('have.attr', 'href', TCO_SOURCE_URL)
      .and('have.attr', 'target', '_blank')
      .and('have.attr', 'rel', 'noopener noreferrer');
    cy.get('[data-testid="overview-source-link"] svg').should('exist');
    cy.get('body').should('not.contain.text', 'at a glance');
    cy.get('[data-testid="overview-methodology"]').children('p').should('have.length', 2);
    cy.get('body').should('not.contain.text', '≈');
    expectNoVisibleDatesOrSnapshot();
    cy.get('body')
      .invoke('text')
      .should('not.match', /fallback/i);
    cy.get('[data-testid="overview-desktop-matrix"]')
      .should('be.visible')
      .within(() => {
        cy.get('thead th').then(($headers) => {
          expect([...$headers].map((header) => header.textContent?.trim())).to.deep.equal(
            PLATFORM_HEADERS,
          );
        });
        cy.get('[data-testid="overview-desktop-model"]').should('have.length', MATRIX_ROWS);
        cy.root().then(($root) => {
          const blankRows = $root.find('[data-testid="overview-row-no-results"]').length;
          cy.get('[data-testid="overview-platform"]').should(
            'have.length',
            (MATRIX_ROWS - blankRows) * 5,
          );
        });
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
    for (const model of ['DeepSeek-V4.1-Flash', 'GLM-5.2']) {
      desktopModel(model).within(() => {
        expectAgentxScenario(AGENTX_LABEL);
      });
    }
    desktopModel('Qwen-3.5-397B-A17B', SINGLE_TURN)
      .find('[data-testid="overview-model-scenario"]')
      .should('have.text', '8K/1K');
  });

  it('gives a model benchmarked on both scenarios one row each, priced independently', () => {
    cy.viewport(1280, 900);
    cy.visit('/overview?tier=50&compare=hardware&models=all');

    cy.get('[data-testid="overview-desktop-model"][data-model="Qwen-3.5-397B-A17B"]').should(
      'have.length',
      2,
    );
    cy.get('[data-testid="overview-desktop-model"][data-model="Qwen-3.5-397B-A17B"]').then(
      ($rows) => {
        expect([...$rows].map((row) => row.dataset.scenario)).to.deep.equal([AGENTX, SINGLE_TURN]);
      },
    );

    desktopModel('Qwen-3.5-397B-A17B', AGENTX).within(() => {
      expectAgentxScenario(AGENTX_LABEL);
      cy.contains('Qwen3.5 397B').should('exist');
      cy.contains('a', 'View details')
        .should('have.attr', 'href')
        .and('include', 'i_seq=agentic-traces');
      cy.contains('a', 'View details').should(
        'have.attr',
        'aria-label',
        `View details: Qwen3.5 397B · ${AGENTX_LABEL}`,
      );
    });
    desktopModel('Qwen-3.5-397B-A17B', SINGLE_TURN).within(() => {
      cy.contains('a', 'View details').should(
        'have.attr',
        'aria-label',
        'View details: Qwen3.5 397B · 8K/1K',
      );
    });

    cy.get('[data-testid="overview-desktop-model"][data-model="DeepSeek-V4-Pro"]').should(
      'have.length',
      1,
    );
    desktopModel('DeepSeek-V4-Pro', AGENTX).within(() => {
      expectAgentxScenario(AGENTX_LABEL);
      cy.contains('DeepSeek V4 Pro 0813 1.6T').should('exist');
      cy.get(
        '[data-testid="overview-pair-value"][data-hardware="b200"] [data-testid="overview-cost-evidence-link"]',
      ).should('have.text', '$0.059');
      cy.get('[data-testid="overview-pair-missing"]').should('have.length', 3);
      cy.contains('a', 'View details')
        .should('have.attr', 'href')
        .and('include', 'i_seq=agentic-traces');
    });
  });

  it('stacks the metric definition under the title at every width', () => {
    for (const width of [320, 390, 768, 1280, 1440]) {
      cy.viewport(width, 900);
      cy.visit('/overview?tier=50&compare=hardware');
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
    cy.visit('/overview?tier=50&compare=hardware&models=all');

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
          .and('include', '/infx/inference?')
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

    desktopModel('DeepSeek-V4-Pro', AGENTX).within(() => {
      platform('gb300').within(() => {
        cy.get('[data-testid="overview-cost-evidence-link"]').should('not.exist');
      });
    });
    expectNoVisibleDatesOrSnapshot();
  });

  it('distinguishes per-platform and whole-row missing results with a plain dash', () => {
    cy.viewport(1280, 900);
    cy.visit('/overview?tier=50&compare=hardware&models=all');

    desktopModel('DeepSeek-V4-Pro', AGENTX).within(() => {
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

    desktopModel('MiniMax-M3', AGENTX).within(() => {
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
      cy.get('[data-testid="overview-row-no-results"]').should('have.length', 1);
    });
    cy.get('[data-testid="overview-pair-missing"]').each(($cell) => {
      expect($cell.text()).not.to.contain('∞');
    });
    cy.get('body').invoke('text').should('not.match', /∞\s*%/);
  });

  it('re-renders the whole matrix from the six-stop SLO slider', () => {
    cy.viewport(1280, 900);
    cy.visit('/overview?tier=50&compare=hardware');

    cy.get('[data-testid="overview-tier-switcher"]')
      .should('have.attr', 'aria-label', 'SLO')
      .and('contain.text', 'SLO');
    cy.get('body').should('not.contain.text', 'Service level');
    cy.get('[data-testid="overview-tier-switcher"]').within(() => {
      cy.get('a, button').should('not.exist');
      cy.get('[data-tier-option]').should('have.length', 6);
      cy.get('[data-tier-option="50"]').should('have.attr', 'data-selected', 'true');
      cy.get('[data-testid="overview-tier-ridge"]').should('have.length', 6);
      cy.get('[data-tier-ridge="30"]').should('have.attr', 'data-state', 'filled');
      cy.get('[data-tier-ridge="50"]').should('have.attr', 'data-state', 'selected');
      cy.get('[data-tier-ridge="75"]').should('have.attr', 'data-state', 'unfilled');
      cy.get('[data-testid="overview-tier-slider"]')
        .should('have.attr', 'min', '0')
        .and('have.attr', 'max', '5')
        .and('have.attr', 'step', '1')
        .and('have.value', '1')
        .and('have.attr', 'data-tier', '50')
        .and('have.attr', 'aria-valuetext', '50 tok/s/user');
    });

    selectOverviewTier(100);

    cy.location('search').should('eq', '?compare=hardware');
    expectScope(SCOPE_LINE, SOURCE_NOTE);
    cy.get('[data-testid="overview-tier-switcher"]').within(() => {
      cy.get('[data-tier-option="100"]').should('have.attr', 'data-selected', 'true');
      cy.get('[data-tier-ridge="75"]').should('have.attr', 'data-state', 'filled');
      cy.get('[data-tier-ridge="100"]').should('have.attr', 'data-state', 'selected');
      cy.get('[data-tier-ridge="150"]').should('have.attr', 'data-state', 'unfilled');
      cy.get('[data-testid="overview-tier-slider"]')
        .should('have.attr', 'type', 'range')
        .should('have.value', '3')
        .and('have.attr', 'data-tier', '100')
        .and('have.attr', 'aria-valuetext', '100 tok/s/user');
    });
    selectOverviewTier(75);
    cy.location('search').should('eq', '?tier=75&compare=hardware');
    selectOverviewTier(100);
    cy.location('search').should('eq', '?compare=hardware');

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

    cy.visit('/overview?tier=30&compare=hardware&models=all');
    desktopModel('DeepSeek-V4-Pro', AGENTX).within(() => {
      cy.get('[data-testid="overview-platform"]').should('not.exist');
      cy.get('[data-testid="overview-row-no-results"]').should(
        'have.text',
        'No results at this SLO',
      );
    });
    desktopModel('Qwen-3.5-397B-A17B', SINGLE_TURN).within(() => {
      platform('b200')
        .find('[data-testid="overview-pair-missing"]')
        .should('contain.text', '—')
        .and('contain.text', 'no exact @30 result');
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
    cy.get('body').invoke('text').should('not.match', /∞\s*%/);

    cy.visit('/overview?compare=hardware');
    expectScope(SCOPE_LINE, SOURCE_NOTE);
    cy.get('[data-testid="language-toggle"]')
      .should('have.attr', 'href', '/zh/overview?compare=hardware')
      .click();
    cy.location('pathname').should('eq', '/zh/overview');
    cy.location('search').should('eq', '?compare=hardware');
    expectScope(SCOPE_LINE_ZH, SOURCE_NOTE_ZH);
  });

  it('uses the same cell semantics on mobile and fits both 390px and 320px widths', () => {
    for (const width of [390, 320]) {
      cy.viewport(width, 844);
      cy.visit('/overview?tier=50&compare=hardware&models=all');

      cy.get('[data-testid="mobile-chart-select"]').should('not.exist');
      cy.get('[data-testid="overview-mobile-list"]').should('be.visible');
      cy.get('[data-testid="overview-tier-switcher"]').should('be.visible');
      cy.get('[data-testid="overview-engine-scope-switcher"]').should('be.visible');
      cy.get('[data-testid="overview-engine-scope-select"]')
        .should('be.visible')
        .then(([select]) => {
          expect(select.getBoundingClientRect().height).to.be.at.least(44);
        });
      cy.get('[data-overview-engine-scope]').should('not.be.visible');
      cy.get('[data-testid="overview-desktop-matrix"]').should('not.exist');
      mobileModel('Qwen-3.5-397B-A17B', SINGLE_TURN).within(() => {
        cy.get('[data-testid="overview-platform"]').should('have.length', 5);
        platform('mi355x').within(() => {
          cy.get(
            '[data-testid="overview-pair-value"][data-hardware="mi355x"] [data-testid="overview-cost-evidence-link"]',
          ).should('have.text', '$0.062');
        });
      });
      mobileModel('DeepSeek-V4-Pro', AGENTX).within(() => {
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
      cy.visit('/overview?tier=50&compare=hardware&models=all');

      mobileModel('DeepSeek-V4-Pro', AGENTX).within(() => {
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

    for (const width of [320, 390, 768, 1024, 1279]) {
      cy.viewport(width, 900);
      cy.visit('/overview?tier=50&compare=hardware&models=all');

      mobileModel('DeepSeek-V4-Pro', AGENTX).within(() => {
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
      cy.visit('/overview?tier=50&compare=hardware');

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
                  2,
                );
              },
            );
          });
        });
      });
    }

    cy.viewport(390, 844);
    cy.visit('/overview?tier=50&compare=hardware');

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
    cy.visit('/overview?tier=50&compare=hardware');
    cy.get('[data-overview-comparison="hardware"]').should('have.attr', 'aria-current', 'true');

    cy.get('[data-testid="overview-desktop-matrix"]').then(([table]) => {
      expect(table.getBoundingClientRect().height).to.be.greaterThan(700);
    });
    cy.scrollTo(0, 800);
    cy.get('header.sticky').then(([siteHeader]) => {
      const siteBottom = siteHeader.getBoundingClientRect().bottom;
      cy.get('[data-testid="overview-desktop-matrix"] thead').should(([head]) => {
        expect(head.getBoundingClientRect().top, 'header pinned below the nav').to.be.closeTo(
          siteBottom,
          2,
        );
      });
    });
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
      cy.visit('/overview?tier=50&compare=hardware');

      cy.get('[data-testid="overview-desktop-matrix"]').should('be.visible');
      cy.get('[data-testid="overview-desktop-matrix"]').then(([table]) => {
        const wrapper = table.parentElement as HTMLElement;
        const card = table.closest('[data-slot="card"]')!;
        const style = getComputedStyle(card);
        expect(style.overflowX).to.equal('clip');
        expect(style.overflowY).to.equal('clip');
        expect(parseFloat(style.borderTopLeftRadius)).to.be.greaterThan(0);
        expect(parseFloat(style.borderTopRightRadius)).to.be.greaterThan(0);
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
});
