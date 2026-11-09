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
    cy.visit('/infx/agentx/telemetry');
  });

  it('renders the article, every section, and every figure', () => {
    cy.get('[data-testid="agentx-telemetry-article"]').should('be.visible');
    cy.contains('h1', 'Exploring agentic workloads: detailed telemetry').should('be.visible');

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

  it('links back to /infx/agentx and out to the agentic results', () => {
    cy.get('[data-testid="agentx-telemetry-results-cta"]')
      .should('be.visible')
      .and('have.attr', 'href', '/infx/inference?i_seq=agentic-traces');

    cy.contains('a', 'AgentX datasets').click();
    cy.location('pathname').should('eq', '/infx/agentx');
  });
});

describe('AgentX telemetry tutorial — Chinese page', () => {
  it('renders translated copy and keeps the same section anchors', () => {
    cy.visit('/zh/infx/agentx/telemetry');
    cy.get('[data-testid="agentx-telemetry-article"]').should('be.visible');
    cy.get('[data-testid="agentx-telemetry-results-cta"]').should(
      'have.attr',
      'href',
      '/zh/infx/inference?i_seq=agentic-traces',
    );
    cy.get('link[rel="alternate"][hreflang="en"]').should(
      'have.attr',
      'href',
      'https://inferencex.semianalysis.com/infx/agentx/telemetry',
    );
    cy.get('link[rel="alternate"][hreflang="zh-CN"]').should(
      'have.attr',
      'href',
      'https://inferencex.semianalysis.com/zh/infx/agentx/telemetry',
    );
  });
});

describe('AgentX telemetry tutorial — entry point on /infx/agentx', () => {
  it('shows the callout and navigates to the tutorial', () => {
    cy.visit('/infx/agentx');
    cy.get('[data-testid="agentx-telemetry-callout"]').should('be.visible');
    cy.get('[data-testid="agentx-telemetry-cta"]').click();
    cy.location('pathname').should('eq', '/infx/agentx/telemetry');
  });

  it('shows the Chinese callout on /zh/infx/agentx', () => {
    cy.visit('/zh/infx/agentx');
    cy.get('[data-testid="agentx-telemetry-callout"]').should('be.visible');
    cy.get('[data-testid="agentx-telemetry-cta"]').click();
    cy.location('pathname').should('eq', '/zh/infx/agentx/telemetry');
  });
});

describe('AgentX telemetry tutorial — responsive locale routes', () => {
  it('renders the full telemetry surface at 1440px and 375px in both locales', () => {
    for (const viewport of ROUTE_VIEWPORTS) {
      for (const locale of ['', '/zh']) {
        cy.viewport(viewport.width, viewport.height);
        cy.visit(`${locale}/infx/agentx/telemetry`, { onBeforeLoad: unlockAgenticGate });
        cy.get('[data-testid="agentx-telemetry-article"]').should('be.visible');
        cy.get('[data-testid^="agentx-telemetry-section-"]').should(
          'have.length',
          SECTION_IDS.length,
        );
        cy.get('[data-testid="agentx-telemetry-results-cta"]').should(
          'have.attr',
          'href',
          `${locale}/infx/inference?i_seq=agentic-traces`,
        );
        cy.get('[data-testid="language-toggle"]').should(
          'have.attr',
          'href',
          locale === '/zh' ? '/infx/agentx/telemetry' : '/zh/infx/agentx/telemetry',
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
    cy.visit('/infx/inference/agentic/206885', {
      onBeforeLoad: (win) => {
        unlockAgenticGate(win);
        win.localStorage.removeItem('inferencex-agentx-telemetry-tutorial-dismissed');
      },
    });
  });

  it('is the only card in the corner — dashboard nudges stay off this route', () => {
    cy.get('[data-testid="telemetry-tutorial-modal"]').should('be.visible');
    cy.get('[data-testid="reproducibility-nudge"]').should('not.exist');
    cy.get('[data-testid="filter-hint-nudge"]').should('not.exist');

    cy.get('[data-testid="telemetry-tutorial-modal-action"]').click();
    cy.location('pathname').should('eq', '/infx/agentx/telemetry');
  });
});
