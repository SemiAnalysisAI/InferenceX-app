import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';

import AppError from '@/app/error';
import { NotFoundContent } from '@/components/not-found-content';
import { registerAnalyticsClient } from '@/lib/analytics';

describe('App error boundary localization', () => {
  it('preserves the accessible English recovery UI and tracks its lifecycle', () => {
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

    cy.get('[role="alert"]').should('have.attr', 'lang', 'en');
    cy.contains('h2', 'Something went wrong!').should('be.visible');
    cy.contains('An unexpected error has occurred.').should('be.visible');
    cy.get('@capture').should('have.been.calledWith', 'error_page_shown', {
      message: 'fixture failure',
      digest: 'en-1',
      locale: 'en',
    });
    cy.contains('button', 'Try again').click();
    cy.get('@reset').should('have.been.calledOnce');
    cy.get('@capture').should('have.been.calledWith', 'error_page_retry', { locale: 'en' });
  });

  it('keeps the localized Chinese recovery flow usable on mobile', () => {
    const message = 'x'.repeat(400);
    const capture = cy.stub().as('capture');
    const reset = cy.stub().as('reset');
    registerAnalyticsClient({ capture });
    cy.stub(console, 'error');
    cy.viewport(375, 812);

    cy.mount(
      <PathnameContext.Provider value="/zh/inference">
        <AppError error={Object.assign(new Error(message), { digest: 'zh-1' })} reset={reset} />
      </PathnameContext.Provider>,
    );

    cy.get('[role="alert"]').should('have.attr', 'lang', 'zh-CN');
    cy.contains('h2', '页面出了点问题').should('be.visible');
    cy.contains('发生意外错误。请重试。').should('be.visible');
    cy.contains('p', message).should('have.attr', 'lang', 'en');
    cy.get('@capture').should('have.been.calledWith', 'error_page_shown', {
      message,
      digest: 'zh-1',
      locale: 'zh',
    });
    cy.contains('button', '重试').then(($button) => {
      expect($button[0].getBoundingClientRect().height).to.be.at.least(44);
    });
    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth);
    });
    cy.contains('button', '重试').click();
    cy.get('@reset').should('have.been.calledOnce');
    cy.get('@capture').should('have.been.calledWith', 'error_page_retry', { locale: 'zh' });
  });
});

describe('Not-found recovery analytics', () => {
  it('tracks the locale when returning from a Chinese 404', () => {
    const capture = cy.stub().as('capture');
    registerAnalyticsClient({ capture });

    cy.mount(<NotFoundContent locale="zh" />);
    cy.contains('a[href="/zh"]', '返回首页')
      .then(($link) => {
        expect($link[0].getBoundingClientRect().height).to.be.at.least(44);
      })
      .invoke('removeAttr', 'href')
      .click();

    cy.get('@capture').should('have.been.calledWith', 'not_found_home_clicked', { locale: 'zh' });
  });
});
