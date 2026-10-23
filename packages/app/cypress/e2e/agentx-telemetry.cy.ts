import { expectNoPageOverflow, keepTelemetryTutorial, unlockAgenticGate } from '../support/e2e';

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

const ROUTE_VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 375, height: 812 },
] as const;

describe('AgentX telemetry tutorial — English page', () => {
  beforeEach(() => {
    cy.visit('/agentx/telemetry');
  });

  it('renders the article, every section, and every figure', () => {
    cy.get('[data-testid="agentx-telemetry-article"]').should('be.visible');
    cy.contains('h1', 'Exploring Agentic Workloads: Detailed Telemetry').should('be.visible');

    for (const id of SECTION_IDS) {
      cy.get(`[data-testid="agentx-telemetry-section-${id}"]`).should('exist');
      cy.get(`a[href="#${id}"]`).should('exist');
    }

    for (const key of FIGURE_KEYS) {
      cy.get(`[data-testid="agentx-telemetry-figure-${key}"]`)
        .should('exist')
        .scrollIntoView()
        .find('img')
        .should(($img) => {
          expect($img[0].naturalWidth, `decoded width of ${key}`).to.be.greaterThan(0);
        });
    }
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
    cy.contains('h1', '通过详细遥测数据解析智能体负载').should('be.visible');
    for (const id of SECTION_IDS) {
      cy.get(`[data-testid="agentx-telemetry-section-${id}"]`).should('exist');
    }
    cy.get('[data-testid="agentx-telemetry-results-cta"]').should(
      'have.attr',
      'href',
      '/zh/inference?i_seq=agentic-traces',
    );
    cy.get('link[rel="alternate"][hreflang="en"]').should(
      'have.attr',
      'href',
      'https://inferencex.semianalysis.com/agentx/telemetry',
    );
    cy.get('link[rel="alternate"][hreflang="zh-CN"]').should(
      'have.attr',
      'href',
      'https://inferencex.semianalysis.com/zh/agentx/telemetry',
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

describe('AgentX telemetry tutorial — responsive locale routes', () => {
  it('renders the full telemetry surface at 1440px and 375px in both locales', () => {
    for (const viewport of ROUTE_VIEWPORTS) {
      for (const locale of ['', '/zh']) {
        cy.viewport(viewport.width, viewport.height);
        cy.visit(`${locale}/agentx/telemetry`, { onBeforeLoad: unlockAgenticGate });
        cy.get('[data-testid="agentx-telemetry-article"]').should('be.visible');
        cy.get('[data-testid^="agentx-telemetry-section-"]').should(
          'have.length',
          SECTION_IDS.length,
        );
        cy.get('[data-testid="agentx-telemetry-results-cta"]').should(
          'have.attr',
          'href',
          `${locale}/inference?i_seq=agentic-traces`,
        );
        cy.get('[data-testid="language-toggle"]').should(
          'have.attr',
          'href',
          locale === '/zh' ? '/agentx/telemetry' : '/zh/agentx/telemetry',
        );
        expectNoPageOverflow();
      }
    }
  });
});

describe('AgentX telemetry tutorial — popup on the agentic point-detail page', () => {
  beforeEach(() => {
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

  it('is the only card in the corner — dashboard nudges stay off this route', () => {
    cy.get('[data-testid="telemetry-tutorial-modal"]', { timeout: 10_000 }).should('be.visible');
    cy.get('[data-testid="telemetry-tutorial-modal"]').should('have.attr', 'aria-modal', 'false');
    cy.get('[data-testid="telemetry-tutorial-modal"]').should(
      'contain.text',
      'New to these charts?',
    );

    cy.get('[data-testid="telemetry-tutorial-modal"]', { timeout: 10_000 }).should('be.visible');
    cy.get('[data-testid="reproducibility-nudge"]').should('not.exist');
    cy.get('[data-testid="filter-hint-nudge"]').should('not.exist');
  });

  it('opens the tutorial from its primary action', () => {
    cy.get('[data-testid="telemetry-tutorial-modal-action"]', { timeout: 10_000 }).click();
    cy.location('pathname').should('eq', '/agentx/telemetry');
  });

  it('stays dismissed across a reload', () => {
    cy.get('[data-testid="telemetry-tutorial-modal-dismiss"]', { timeout: 10_000 }).click();
    cy.get('[data-testid="telemetry-tutorial-modal"]').should('not.exist');
    cy.reload();
    cy.get('[data-testid="detail-view-toggle"]').should('exist');
    cy.wait(3_500);
    cy.get('[data-testid="telemetry-tutorial-modal"]').should('not.exist');
  });
});
