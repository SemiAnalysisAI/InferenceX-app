import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';

import AppError from '@/app/error';
import { NotFoundContent } from '@/components/not-found-content';
import { registerAnalyticsClient } from '@/lib/analytics';

describe('App error boundary localization', () => {
  it('preserves the English recovery UI and tracks retry', () => {
    const capture = cy.stub().as('capture');
    const reset = cy.stub().as('reset');
    registerAnalyticsClient({ capture });
    cy.stub(console, 'error');

    cy.mount(
      <PathnameContext.Provider value="/inference">
        <AppError
          error={Object.assign(new Error('fixture failure'), { digest: 'en-1' })}
          reset={reset}
        />
      </PathnameContext.Provider>,
    );

    cy.contains('h2', 'Something went wrong!').should('be.visible');
    cy.contains('button', 'Try again').click();
    cy.get('@reset').should('have.been.calledOnce');
    cy.get('@capture').should('have.been.calledWith', 'error_page_retry', { locale: 'en' });
  });

  it('renders Chinese recovery copy and records the Chinese locale', () => {
    const capture = cy.stub().as('capture');
    const reset = cy.stub().as('reset');
    registerAnalyticsClient({ capture });
    cy.stub(console, 'error');

    cy.mount(
      <PathnameContext.Provider value="/zh/inference">
        <AppError
          error={Object.assign(new Error('fixture failure'), { digest: 'zh-1' })}
          reset={reset}
        />
      </PathnameContext.Provider>,
    );

    cy.contains('h2', '页面出了点问题').should('be.visible');
    cy.contains('发生意外错误。请重试。').should('be.visible');
    cy.contains('button', '重试').click();
    cy.get('@reset').should('have.been.calledOnce');
    cy.get('@capture').should('have.been.calledWith', 'error_page_retry', { locale: 'zh' });
  });

  it('keeps the Chinese recovery action reachable without mobile overflow', () => {
    cy.viewport(375, 812);
    registerAnalyticsClient({ capture: cy.stub() });
    cy.stub(console, 'error');

    cy.mount(
      <PathnameContext.Provider value="/zh/inference">
        <AppError error={new Error('x'.repeat(400))} reset={cy.stub()} />
      </PathnameContext.Provider>,
    );

    cy.contains('button', '重试').then(($button) => {
      expect($button[0].getBoundingClientRect().height).to.be.at.least(44);
    });
    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth);
    });
  });
});

describe('Not-found recovery analytics', () => {
  it('tracks the locale when returning from a Chinese 404', () => {
    const capture = cy.stub().as('capture');
    registerAnalyticsClient({ capture });

    cy.mount(<NotFoundContent locale="zh" />);
    cy.contains('a', '返回首页')
      .should('have.class', 'inline-flex')
      .and('have.class', 'items-center')
      .and('have.class', 'justify-center')
      .then(($link) => {
        expect($link[0].getBoundingClientRect().height).to.be.at.least(44);
      })
      .invoke('removeAttr', 'href')
      .click();

    cy.get('@capture').should('have.been.calledWith', 'not_found_home_clicked', { locale: 'zh' });
  });
});
