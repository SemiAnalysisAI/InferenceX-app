// Merged from tabs.cy.ts and first-load-navigation.cy.ts
// to reduce per-file Cypress startup overhead (~500ms per file)

describe('Chart Section Tabs — E2E', () => {
  before(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
    cy.visit('/inference');
  });

  it('updates the URL path when switching tabs', () => {
    cy.get('[data-testid="tab-trigger-evaluation"]').click();
    cy.url().should('include', '/evaluation');

    cy.get('[data-testid="tab-trigger-historical"]').click();
    cy.url().should('include', '/historical');

    cy.get('[data-testid="tab-trigger-calculator"]').click();
    cy.url().should('include', '/calculator');

    cy.get('[data-testid="tab-trigger-gpu-specs"]').click();
    cy.url().should('include', '/gpu-specs');

    cy.get('[data-testid="tab-trigger-inference"]').click();
    cy.url().should('include', '/inference');
  });

  it('opens GPU Reliability from the footer link', () => {
    cy.get('[data-testid="tab-trigger-reliability"]').should('not.exist');

    cy.get('[data-testid="footer-link-reliability"]').scrollIntoView().click();
    cy.url().should('include', '/reliability');
    cy.get('[data-testid="reliability-chart-display"]').should('exist');
  });

  it('shows mobile chart select dropdown on small viewport', () => {
    cy.viewport(375, 812);
    cy.visit('/inference');
    cy.get('[data-testid="mobile-chart-select"]').should('be.visible');
  });

  it('keeps the sliding indicator aligned after the ↑↑↓↓ unlock inserts the Hidden trigger', () => {
    // Start locked: testIsolation is off, so an unlock persisted by an earlier
    // test would make the konami sequence below a no-op (nothing would insert,
    // nothing would shift, and the assertion would pass vacuously).
    cy.visit('/inference', {
      onBeforeLoad(win) {
        win.localStorage.removeItem('inferencex-feature-gate');
      },
    });
    cy.get('[data-testid="tab-trigger-hidden"]').should('not.exist');
    cy.get('[data-testid="chart-section-tabs"] .tab-indicator').should('exist');
    // Unlock mid-session: inserting the Hidden trigger reflows the
    // justify-evenly tabs WITHOUT resizing the nav box, so the nav's
    // ResizeObserver never fires — only the gateUnlocked remeasure keeps
    // the indicator under the active tab.
    cy.get('body').type('{upArrow}{upArrow}{downArrow}{downArrow}');
    cy.get('[data-testid="tab-trigger-hidden"]').should('be.visible');
    cy.get('[data-testid="chart-section-tabs"] .tab-indicator').should(($indicator) => {
      const active = $indicator
        .closest('[data-testid="chart-section-tabs"]')
        .find('[data-tab-active="true"]')[0];
      expect(active, 'active tab link').to.not.equal(undefined);
      const indicator = $indicator[0];
      const match = /translateX\((?<left>-?[\d.]+)px\)/u.exec(indicator.style.transform);
      expect(match, 'indicator transform').to.not.equal(null);
      expect(Number(match!.groups!.left)).to.be.closeTo(active.offsetLeft, 1);
      expect(indicator.getBoundingClientRect().width).to.be.closeTo(active.offsetWidth, 1);
    });
    // Re-lock so the unlock doesn't leak into later tests (testIsolation off).
    cy.window().then((win) => win.localStorage.removeItem('inferencex-feature-gate'));
  });
});

describe('First-load navigation', () => {
  beforeEach(() => {
    cy.visit('/', {
      onBeforeLoad(win) {
        win.localStorage.removeItem('inferencex-starred');
        // Snoozed, not cleared: the star modal is the eligible landing nudge
        // on first load, and its corner card would sit over the footer links
        // these specs click.
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
        win.localStorage.removeItem('inferencex-openai-rubin-banner-dismissed');
      },
    });

    cy.get('body').should('not.have.attr', 'data-scroll-locked');
  });

  it('navigates to articles from the footer', () => {
    cy.get('[data-testid="footer-link-articles"]').scrollIntoView().click();
    cy.location('pathname').should('eq', '/blog');
  });

  it('navigates to overview from the top-level header link', () => {
    cy.get('[data-testid="nav-link-overview"]').click();
    cy.location('pathname').should('eq', '/overview');
  });

  it('navigates to dashboard from the header with one click', () => {
    cy.get('[data-testid="nav-link-dashboard"]').click();
    cy.location('pathname').should('eq', '/inference');
  });

  it('navigates to comparisons from the header with one click', () => {
    cy.get('[data-testid="nav-link-compare"]').click();
    cy.location('pathname').should('eq', '/compare');
  });

  it('navigates to AgentX from the header with one click', () => {
    cy.get('[data-testid="nav-link-agentx"]')
      .should('have.attr', 'href', '/agentx')
      .find('[data-nav-badge="agentx"]')
      .should('be.visible')
      .and('have.text', 'NEW');
    cy.get('[data-testid="nav-link-agentx"]').click();
    cy.location('pathname').should('eq', '/agentx');
  });

  it('leads the landing page with the AgentX hero and its two CTAs', () => {
    cy.get('[data-testid="compare-agentx-primary"]').within(() => {
      // The hero owns /compare's h1; on the landing page it is a section heading.
      cy.get('h2').should('have.text', 'Compare Realistic Agentic Inference Perf');
      cy.get('h1').should('not.exist');
      cy.get('[data-testid="compare-agentx-overview-link"]')
        .should('contain.text', 'Overview')
        .and('have.attr', 'href', '/overview');
      cy.get('[data-testid="compare-agentx-dashboard-link"]')
        .should('contain.text', 'Full dashboard')
        .and('have.attr', 'href', '/inference/kimi-k3');
      cy.get('[data-testid="compare-agentx-methodology-link"]').should('not.exist');
      cy.get('[data-testid^="compare-agentx-model-"]').should('have.length', 6);
      // Editorial order, not alphabetical — see FEATURED_AGENTX_MODEL_SLUGS.
      cy.get('[data-testid^="compare-agentx-model-"]').then(($rows) => {
        const slugs = [...$rows].map((row) =>
          (row.dataset.testid ?? '').replace('compare-agentx-model-', ''),
        );
        expect(slugs).to.deep.equal([
          'kimi-k3',
          'deepseek-v4',
          'glm-5-2',
          'minimax-m3',
          'qwen-3-5',
          'qwen-3-8-flash-next',
        ]);
      });
      // Every featured ledger row carries the NEW pill.
      cy.get('[data-testid^="compare-agentx-model-"] [data-new-badge="agentx-ledger"]')
        .should('have.length', 6)
        .each(($badge) => expect($badge.text()).to.equal('NEW'));
    });
    cy.get('[data-testid="compare-agentx-overview-link"]').click();
    cy.location('pathname').should('eq', '/overview');
  });

  it('navigates to submissions from the landing CTA', () => {
    cy.get('[data-testid="landing-submissions-link"]').click();
    cy.location('pathname').should('eq', '/submissions');
  });
});
