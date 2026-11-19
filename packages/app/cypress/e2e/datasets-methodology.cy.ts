import { expectNoPageOverflow, unlockAgenticGate } from '../support/e2e';

const DATASET = {
  id: 'agentx-v1-full',
  slug: 'agentx-v1-full',
  label: 'AgentX v1.0 (full)',
  variant: 'full',
  description: 'The complete AgentX v1.0 replay set.',
  hf_url: null,
  license: 'apache-2.0',
  conversation_count: 393,
  summary: {
    medianRequestsPerConversation: 20,
    meanRequestsPerConversation: 24,
    mainTurns: 7800,
    subagentGroups: 1300,
    cachedPct: 0.84,
    totalIn: 56_000_000,
    totalOut: 175_000,
  },
  ingested_at: '2026-06-21T00:00:00Z',
};

const ROUTE_VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 375, height: 812 },
] as const;

describe('AgentX dataset methodology', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/datasets', { statusCode: 200, body: [DATASET] });
  });

  it('publishes the full English methodology with sourced figures and locale pairing', () => {
    cy.visit('/infx/agentx/methodology', { onBeforeLoad: unlockAgenticGate });

    cy.get('[data-testid="agentx-methodology-article"]').within(() => {
      cy.get('[data-testid="agentx-methodology-figure-corpus"]')
        .parent('a')
        .should('have.attr', 'href', '/images/agentx-methodology/corpus-scale.png')
        .and('have.attr', 'target', '_blank');
      [
        'requestDistributions256k',
        'subagentDistributions256k',
        'replayJoined',
        'replayFlatspawn',
        'replaySidecars',
      ].forEach((figure) => {
        cy.get(`[data-testid="agentx-methodology-figure-${figure}"] img`)
          .should('be.visible')
          .invoke('attr', 'alt')
          .should('not.be.empty');
      });
      cy.get('a[href="https://arxiv.org/abs/2604.09557"]').should('exist');
    });
  });

  it('renders the landing and methodology click path at 1440px and 375px in both locales', () => {
    for (const viewport of ROUTE_VIEWPORTS) {
      for (const locale of ['', '/zh']) {
        cy.viewport(viewport.width, viewport.height);
        cy.visit(`${locale}/infx/agentx`, { onBeforeLoad: unlockAgenticGate });
        cy.get('[data-testid="agentx-methodology"]').should('be.visible');
        cy.get('[data-testid="agentx-methodology-cta"]').should(
          'have.attr',
          'href',
          `${locale}/infx/agentx/methodology`,
        );
        cy.get('[data-testid="agentx-telemetry-callout"]').should('exist');
        cy.get('[data-testid="agentx-optimizations-callout"]').should('exist');
        expectNoPageOverflow();

        cy.visit(`${locale}/infx/agentx/methodology`, { onBeforeLoad: unlockAgenticGate });
        cy.get('[data-testid="agentx-methodology-article"]').should('be.visible');
        cy.get('figure[data-testid^="agentx-methodology-figure-"]').should('have.length', 21);
        cy.get('[data-testid="language-toggle"]').should(
          'have.attr',
          'href',
          locale === '/zh' ? '/infx/agentx/methodology' : '/zh/infx/agentx/methodology',
        );
        expectNoPageOverflow();
      }
    }
  });

  it('permanently redirects legacy dataset routes without dropping path or query', () => {
    cy.request({
      url: '/datasets/test-set/conversations/abc?turn=3',
      followRedirect: false,
    }).then((response) => {
      expect(response.status).to.eq(308);
      expect(response.headers.location).to.eq('/infx/agentx/test-set/conversations/abc?turn=3');
    });

    cy.request({ url: '/zh/datasets', followRedirect: false }).then((response) => {
      expect(response.status).to.eq(308);
      expect(response.headers.location).to.eq('/zh/infx/agentx');
    });
  });
});

describe('AgentX quickstart', () => {
  for (const prefix of ['', '/zh']) {
    it(`opens the guide from AgentX and the About FAQ (${prefix || 'en'})`, () => {
      for (const entry of ['/infx/agentx', '/about']) {
        cy.visit(`${prefix}${entry}`);
        cy.get('[data-testid="agentx-quickstart-callout"]').within(() => {
          cy.get('[data-testid="copyable-code-block"]').should('have.length', 1);
          cy.contains('code', "pip install 'agentx-harness==1.0.14'").should('exist');
          cy.get(`a[href="${prefix}/infx/agentx/quickstart"]`).click();
        });
        cy.location('pathname').should('eq', `${prefix}/infx/agentx/quickstart`);
        cy.get('[data-testid="agentx-quickstart-article"]').should('be.visible');
        cy.contains('#run code', "pip install 'agentx-harness==1.0.14'").should('exist');
        cy.contains('header', 'agentx-harness · 1.0.14').should('be.visible');
        cy.get(
          'a[href="https://github.com/SemiAnalysisAI/agentx-harness/tree/agentx-v1.0.14"]',
        ).should('be.visible');
      }
    });
  }

  it('copies the complete command and optional headers on mobile (en)', () => {
    cy.viewport(375, 812);
    cy.visit('/infx/agentx/quickstart', {
      onBeforeLoad(win) {
        Object.defineProperty(win.navigator, 'clipboard', {
          configurable: true,
          value: { writeText: cy.stub().as('writeText').resolves() },
        });
      },
    });
    expectNoPageOverflow();
    cy.get('#run code')
      .invoke('text')
      .then((command) => {
        cy.get('#run button').click();
        cy.get('@writeText').should('have.been.calledWithExactly', command);
      });
    cy.get('#routing code')
      .invoke('text')
      .then((flags) => {
        expect(flags).to.include('AIPERF_HTTP_X_DYNAMO_SESSION_ID_FROM_CORRELATION_ID=true');
        expect(flags).to.include('AIPERF_HTTP_X_SESSION_ID_FROM_CORRELATION_ID=true');
        expect(flags).to.include('X-Dynamo-Parent-Session-ID');
        cy.get('#routing button').click();
        cy.get('@writeText').should('have.been.calledWithExactly', flags);
      });
    cy.get('[data-testid="agentx-quickstart-article"] details').should('not.exist');
    cy.get('[data-testid="agentx-quickstart-article"] [data-testid="copyable-code-block"]').should(
      'have.length',
      2,
    );
    cy.get('link[rel="canonical"]').should(
      'have.attr',
      'href',
      'https://inferencex.semianalysis.com/infx/agentx/quickstart',
    );
    cy.get('link[hreflang="zh-CN"]').should(
      'have.attr',
      'href',
      'https://inferencex.semianalysis.com/zh/infx/agentx/quickstart',
    );
    expectNoPageOverflow();
  });
});
