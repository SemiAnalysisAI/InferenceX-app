import { expectNoPageOverflow } from '../support/e2e';

describe('AgentX quickstart', () => {
  for (const prefix of ['', '/zh']) {
    it(`opens the guide from AgentX and the About FAQ (${prefix || 'en'})`, () => {
      for (const entry of ['/agentx', '/about']) {
        cy.visit(`${prefix}${entry}`);
        cy.get('[data-testid="agentx-quickstart-callout"]').within(() => {
          cy.contains('code', "pip install 'agentx-harness==1.0.7'").should('exist');
          cy.get(`a[href="${prefix}/agentx/quickstart"]`).click();
        });
        cy.location('pathname').should('eq', `${prefix}/agentx/quickstart`);
        cy.get('[data-testid="agentx-quickstart-article"]').should('be.visible');
      }
    });

    it(`copies the complete command and optional headers on mobile (${prefix || 'en'})`, () => {
      cy.viewport(375, 812);
      cy.visit(`${prefix}/agentx/quickstart`, {
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
          expect(command).to.include('--url "http://127.0.0.1:8000"');
          expect(command).to.include('--model "$HUGGINGFACE_MODEL_NAME"');
          expect(command).to.include('--concurrency "$CONC_SESSIONS"');
          expect(command).to.include('--public-dataset "semianalysis_cc_traces_weka_062126"');
          expect(command).to.include('--output-artifact-dir "output_dir_results"');
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
      cy.get('details summary').click();
      cy.get('details code').should('be.visible').and('contain', 'python3.11 -m venv .venv');
      cy.get('details summary').click();
      cy.get('details').should('not.have.attr', 'open');
      cy.get('link[rel="canonical"]').should(
        'have.attr',
        'href',
        `https://inferencex.semianalysis.com${prefix}/agentx/quickstart`,
      );
      cy.get('link[hreflang="zh-CN"]').should(
        'have.attr',
        'href',
        'https://inferencex.semianalysis.com/zh/agentx/quickstart',
      );
      expectNoPageOverflow();
    });
  }

  it('keeps the command selectable when clipboard access is denied', () => {
    cy.visit('/agentx/quickstart', {
      onBeforeLoad(win) {
        Object.defineProperty(win.navigator, 'clipboard', {
          configurable: true,
          value: { writeText: cy.stub().rejects(new Error('Clipboard denied')) },
        });
      },
    });
    cy.get('#run button').click();
    cy.get('#run [role="status"]').should('be.visible').and('contain', 'Select the code');
    cy.get('#run pre').should('be.visible').and('have.attr', 'tabindex', '0');
  });
});
