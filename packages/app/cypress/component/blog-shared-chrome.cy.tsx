import { HeadingLink } from '@/components/blog/heading-link';
import { registerAnalyticsClient } from '@/lib/analytics';

describe('Blog shared chrome', () => {
  it('localizes heading-link feedback and tracks a Chinese copy interaction', () => {
    const capture = cy.stub().as('capture');
    const writeText = cy.stub();
    writeText.resolves();
    cy.wrap(writeText).as('writeText');
    registerAnalyticsClient({ capture });
    cy.window().then((win) => {
      win.history.replaceState(null, '', '/zh/blog/example');
      Object.defineProperty(win.navigator, 'clipboard', {
        configurable: true,
        value: { writeText },
      });
    });

    cy.mount(<HeadingLink id="test-section" locale="zh" />);
    cy.get('a[aria-label="复制本节链接"]').click();

    cy.window().then((win) => {
      cy.get('@writeText').should(
        'have.been.calledWith',
        `${win.location.origin}/zh/blog/example#test-section`,
      );
    });
    cy.contains('链接已复制').should('be.visible');
    cy.get('@capture').should('have.been.calledWith', 'blog_heading_link_clicked', {
      id: 'test-section',
      locale: 'zh',
    });
    cy.get('@capture').should('have.been.calledWith', 'blog_heading_link_copied', {
      id: 'test-section',
      locale: 'zh',
    });
  });
});
