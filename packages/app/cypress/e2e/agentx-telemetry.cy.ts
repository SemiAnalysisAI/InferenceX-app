import { keepTelemetryTutorial, unlockAgenticGate } from '../support/e2e';

// This spec owns the telemetry-tutorial card's storage, so it opts out of the
// global suppression seeded in support/e2e.ts (which also re-seeds on reload).
keepTelemetryTutorial();

const SECTION_IDS = [
  'why-per-point-telemetry',
  'one-curve-per-stack',
  'point-detail-page',
  'kv-offload',
  'request-timeline',
  'flamegraph',
];

const FIGURE_KEYS = [
  'perPointOverview',
  'chartPointTooltip',
  'pointDetailFull',
  'requestTimeline',
  'flamegraph',
];

describe('AgentX telemetry tutorial — English page', () => {
  beforeEach(() => {
    cy.visit('/agentx/telemetry');
  });

  it('renders the article, every section, and every figure', () => {
    cy.get('[data-testid="agentx-telemetry-article"]').should('be.visible');
    cy.contains('h1', 'Exploring Agentic Workloads: Detailed Telemetry').should('be.visible');

    for (const id of SECTION_IDS) {
      cy.get(`[data-testid="agentx-telemetry-section-${id}"]`).should('exist');
      // Every section id is also an anchor target for the on-this-page nav.
      cy.get(`a[href="#${id}"]`).should('exist');
    }

    for (const key of FIGURE_KEYS) {
      cy.get(`[data-testid="agentx-telemetry-figure-${key}"]`)
        .should('exist')
        // next/image lazy-loads below the fold, so nothing decodes until the
        // figure is scrolled into view.
        .scrollIntoView()
        .find('img')
        // naturalWidth is only non-zero once the file actually decodes, so this
        // fails on a missing or broken asset rather than a missing tag.
        .should(($img) => {
          expect($img[0].naturalWidth, `decoded width of ${key}`).to.be.greaterThan(0);
        });
    }
  });

  it('states the eleven-chart claim the detail page has to back', () => {
    cy.get('[data-testid="agentx-telemetry-article"]')
      .should('contain.text', '11')
      .and('contain.text', 'per-point telemetry charts');
  });

  it('links back to /agentx and out to the agentic results', () => {
    cy.get('[data-testid="agentx-telemetry-results-cta"]')
      .should('be.visible')
      .and('have.attr', 'href', '/inference?i_seq=agentic-traces');

    cy.contains('a', 'AgentX datasets').click();
    cy.location('pathname').should('eq', '/agentx');
  });
});

describe('AgentX telemetry tutorial — Chinese page', () => {
  it('renders translated copy and keeps the same section anchors', () => {
    cy.visit('/zh/agentx/telemetry');
    cy.get('[data-testid="agentx-telemetry-article"]').should('be.visible');
    cy.contains('h1', '深入解读智能体负载：详细遥测数据').should('be.visible');
    // Anchors are language-neutral so a deep link survives the locale switch.
    for (const id of SECTION_IDS) {
      cy.get(`[data-testid="agentx-telemetry-section-${id}"]`).should('exist');
    }
    cy.get('[data-testid="agentx-telemetry-results-cta"]').should(
      'have.attr',
      'href',
      '/zh/inference?i_seq=agentic-traces',
    );
  });
});

describe('AgentX telemetry tutorial — entry point on /agentx', () => {
  it('shows the callout and navigates to the tutorial', () => {
    cy.visit('/agentx');
    cy.get('[data-testid="agentx-telemetry-callout"]').should('be.visible');
    cy.get('[data-testid="agentx-telemetry-cta"]').click();
    cy.location('pathname').should('eq', '/agentx/telemetry');
  });

  it('shows the Chinese callout on /zh/agentx', () => {
    cy.visit('/zh/agentx');
    cy.get('[data-testid="agentx-telemetry-callout"]').should('be.visible');
    cy.get('[data-testid="agentx-telemetry-cta"]').click();
    cy.location('pathname').should('eq', '/zh/agentx/telemetry');
  });
});

describe('AgentX telemetry tutorial — popup on the agentic point-detail page', () => {
  beforeEach(() => {
    // The detail page's own data is irrelevant here; stub it so the spec is
    // about the nudge, not about whichever benchmark row happens to exist.
    cy.intercept('GET', '/api/v1/trace-histograms*', { body: {} });
    cy.intercept('GET', '/api/v1/trace-server-metrics*', { body: null });
    cy.intercept('GET', '/api/v1/benchmark-siblings*', { statusCode: 404 });
    cy.intercept('GET', '/api/v1/request-timeline*', { statusCode: 404 });
    cy.visit('/inference/agentic/206885', {
      onBeforeLoad: (win) => {
        unlockAgenticGate(win);
        win.localStorage.removeItem('inferencex-agentx-telemetry-tutorial-dismissed');
      },
    });
  });

  it('appears after the charts settle, without a backdrop over them', () => {
    cy.get('[data-testid="telemetry-tutorial-modal"]', { timeout: 10_000 }).should('be.visible');
    // A bottom-right card, not a centered dialog — the charts stay usable.
    cy.get('[data-testid="telemetry-tutorial-modal"]').should('have.attr', 'aria-modal', 'false');
    cy.get('[data-testid="telemetry-tutorial-modal"]').should(
      'contain.text',
      'New to these charts?',
    );
  });

  it('opens the tutorial from its primary action', () => {
    cy.get('[data-testid="telemetry-tutorial-modal-action"]', { timeout: 10_000 }).click();
    cy.location('pathname').should('eq', '/agentx/telemetry');
  });

  it('stays dismissed across a reload', () => {
    cy.get('[data-testid="telemetry-tutorial-modal-dismiss"]', { timeout: 10_000 }).click();
    cy.get('[data-testid="telemetry-tutorial-modal"]').should('not.exist');
    cy.reload();
    // Long enough to outlast the 2.5s trigger delay had dismissal not persisted.
    cy.get('[data-testid="detail-view-toggle"]').should('exist');
    cy.get('[data-testid="telemetry-tutorial-modal"]', { timeout: 6_000 }).should('not.exist');
  });
});
