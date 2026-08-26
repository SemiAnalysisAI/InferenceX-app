import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';

import { FaqQuestionLink } from '@/components/about/faq-question-link';

const ID = 'faq-normalized-interactivity';
const QUESTION = 'What is the difference between normalized interactivity and interactivity?';

function mountFaqQuestionLink(pathname = '/about') {
  cy.mount(
    <PathnameContext.Provider value={pathname}>
      <div className="w-[760px] p-4 font-medium">
        <FaqQuestionLink id={ID} question={QUESTION} />
      </div>
    </PathnameContext.Provider>,
  );
}

describe('FaqQuestionLink', () => {
  it('shows an icon-only control and copies the direct URL', () => {
    cy.window().then((win) => {
      cy.stub(win.navigator.clipboard, 'writeText').as('writeFaqLink').resolves();
    });
    mountFaqQuestionLink();

    cy.get(`a[href="#${ID}"]`).should('have.text', QUESTION);
    cy.get(`[data-testid="faq-copy-link-${ID}"]`)
      .should('be.visible')
      .and('have.text', '')
      .and('have.attr', 'title', 'Copy link')
      .and('have.attr', 'aria-label', `Copy link: ${QUESTION}`)
      .find('svg.lucide-link')
      .should('be.visible');
    cy.get(`[data-testid="faq-copy-link-${ID}"]`)
      .click()
      .should('have.attr', 'title', 'Copied')
      .and('have.attr', 'aria-label', `Copied: ${QUESTION}`)
      .find('svg.lucide-check')
      .should('be.visible');
    cy.get('@writeFaqLink').should(
      'have.been.calledOnceWith',
      Cypress.sinon.match(new RegExp(`#${ID}$`, 'u')),
    );
  });

  it('uses concise Chinese button copy on the Chinese route', () => {
    mountFaqQuestionLink('/zh/about');

    cy.get(`[data-testid="faq-copy-link-${ID}"]`)
      .should('be.visible')
      .and('have.attr', 'aria-label', `复制链接: ${QUESTION}`)
      .and('have.attr', 'title', '复制链接')
      .find('svg.lucide-link')
      .should('be.visible');
  });
});
