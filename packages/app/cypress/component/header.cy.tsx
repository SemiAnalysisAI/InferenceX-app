import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';

import { Header } from '@/components/header/header';
import { ThemeProvider } from '@/components/ui/theme-provider';

// Mounted outside the Next app shell; next-style-loader inserts the global
// stylesheet before this anchor, so it must exist before the import below.
const cssAnchor = document.createElement('noscript');
cssAnchor.id = '__next_css__DO_NOT_USE__';
document.head.append(cssAnchor);
require('@/app/globals.css');

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

/** Minimum touch target, per WCAG 2.5.8 and the `size-11` / `min-h-11` utilities. */
const MIN_TOUCH_PX = 44;
/** Tolerance for sub-pixel layout rounding. */
const EPSILON = 0.5;

function createMockRouter() {
  return {
    push: cy.stub(),
    replace: cy.stub(),
    refresh: cy.stub(),
    back: cy.stub(),
    forward: cy.stub(),
    prefetch: cy.stub().resolves(),
    bfcacheId: '',
  };
}

function rectOf(selector: string) {
  return cy.get(selector).then(($el) => $el[0].getBoundingClientRect());
}

describe('Header', () => {
  let mockRouter: ReturnType<typeof createMockRouter>;

  function mountHeader(pathname: string) {
    cy.mount(
      <AppRouterContext.Provider value={mockRouter}>
        <PathnameContext.Provider value={pathname}>
          <QueryClientProvider client={queryClient}>
            <ThemeProvider attribute="class" defaultTheme="light" disableTransitionOnChange>
              <Header />
            </ThemeProvider>
          </QueryClientProvider>
        </PathnameContext.Provider>
      </AppRouterContext.Provider>,
    );
  }

  beforeEach(() => {
    mockRouter = createMockRouter();
    mountHeader('/');
  });

  it('displays the InferenceX title', () => {
    cy.get('[data-testid="header"]').contains('InferenceX').should('be.visible');
  });

  it('displays the SemiAnalysis logo', () => {
    cy.get('[data-testid="header"]').find('img[alt="SemiAnalysis logo"]').should('exist');
  });

  it('shows Overview as a top-level nav link', () => {
    cy.get('[data-testid="nav-link-overview"]')
      .should('be.visible')
      .and('have.attr', 'href', '/overview');
  });

  it('uses resilient app navigation for the desktop Overview link', () => {
    cy.clock();
    cy.get('[data-testid="nav-link-overview"]').click();
    cy.wrap(mockRouter.push).should('have.been.calledOnceWith', '/overview');
    cy.tick(250);
    cy.wrap(mockRouter.push).should('have.been.calledTwice');
  });

  it('makes a click on the tab already showing a no-op', () => {
    mountHeader('/overview');
    cy.get('[data-testid="nav-link-overview"]').click();
    cy.wrap(mockRouter.push).should('not.have.been.called');
  });

  it('still navigates to Dashboard from a sibling dashboard tab', () => {
    // `/evaluation` lights up the Dashboard tab but is a different page, so the
    // no-op guard must not fire — otherwise the link is dead on nine routes.
    mountHeader('/evaluation');
    cy.get('[data-testid="nav-link-dashboard"]').click();
    cy.wrap(mockRouter.push).should('have.been.calledWith', '/inference');
  });

  it('shows Dashboard nav link', () => {
    cy.get('[data-testid="nav-link-dashboard"]').should('be.visible');
    cy.get('[data-testid="nav-link-dashboard"]').should('have.attr', 'href', '/inference');
  });

  it('shows Comparisons nav link', () => {
    cy.get('[data-testid="nav-link-compare"]').should('be.visible');
    cy.get('[data-testid="nav-link-compare"]').should('have.attr', 'href', '/compare');
  });

  it('shows AgentX as a top-level nav link and highlights AgentX child pages', () => {
    cy.get('[data-testid="nav-link-agentx"]')
      .should('be.visible')
      .and('have.attr', 'href', '/agentx')
      .find('[data-nav-badge="agentx"]')
      .should('have.text', 'NEW');

    mountHeader('/agentx/claude-code-traces');
    cy.get('[data-testid="nav-link-agentx"]').should('have.class', 'text-brand');
  });

  it('keeps AgentX in the Chinese navigation tree', () => {
    mountHeader('/zh/agentx');
    cy.get('[data-testid="nav-link-agentx"]')
      .should('be.visible')
      .and('contain.text', 'AgentX')
      .and('have.attr', 'href', '/zh/agentx')
      .and('have.class', 'text-brand');
    cy.get('[data-testid="nav-link-agentx"]')
      .find('[data-nav-badge="agentx"]')
      .should('have.text', '新');
  });

  it('orders the nav with Home first and AgentX second', () => {
    const expected = [
      'Home',
      'AgentX',
      'Overview',
      'Dashboard',
      'Telemetry',
      'Comparisons',
      'About',
    ];
    cy.get('[data-testid^="nav-link-"]').then(($links) => {
      // Strip the NEW badge so the comparison is against the label alone.
      const labels = [...$links].map((link) => (link.textContent ?? '').replace('NEW', '').trim());
      expect(labels).to.deep.equal(expected);
    });
  });

  it('keeps footer destinations out of the primary nav', () => {
    cy.get('[data-testid="nav-link-supporters"]').should('not.exist');
    cy.get('[data-testid="nav-link-blog"]').should('not.exist');
  });

  it('shows the GitHub stars button linking to the correct repo', () => {
    cy.get('[data-testid="header-star-button"]').should('be.visible');
    cy.get('[data-testid="header-star-button"]')
      .should('have.attr', 'href')
      .and('include', 'github.com/SemiAnalysisAI/InferenceX');
  });

  it('shows the theme toggle button', () => {
    cy.get('[data-testid="theme-toggle"]').should('be.visible');
  });

  it('shows mobile hamburger menu on small viewports', () => {
    cy.viewport(375, 812);
    cy.get('[data-testid="nav-link-dashboard"]').should('not.be.visible');
    cy.get('[data-testid="mobile-menu-toggle"]')
      .should('be.visible')
      .and('have.attr', 'aria-expanded', 'false')
      .click()
      .should('have.attr', 'aria-expanded', 'true');
    cy.get('[data-testid="mobile-menu"]').within(() => {
      cy.contains('a', 'Overview').should('be.visible').and('have.attr', 'href', '/overview');
      cy.contains('a', 'Dashboard').should('be.visible').and('have.attr', 'href', '/inference');
      cy.contains('a', 'Comparisons').should('be.visible').and('have.attr', 'href', '/compare');
      cy.contains('a', 'AgentX')
        .should('be.visible')
        .and('have.attr', 'href', '/agentx')
        .find('[data-nav-badge="agentx"]')
        .should('have.text', 'NEW');
      cy.contains('a', 'Supporters').should('not.exist');
      cy.contains('a', 'Articles').should('not.exist');
    });
  });

  it('uses resilient app navigation for the mobile Overview link', () => {
    cy.clock();
    cy.viewport(375, 812);
    cy.get('[data-testid="mobile-menu-toggle"]').click();
    cy.get('[data-testid="mobile-menu"]').contains('a', 'Overview').click();
    cy.wrap(mockRouter.push).should('have.been.calledOnceWith', '/overview');
    cy.tick(250);
    cy.wrap(mockRouter.push).should('have.been.calledTwice');
  });

  it('uses the hamburger without horizontal overflow from 1009 through 1024 CSS pixels', () => {
    [1009, 1012, 1020, 1024].forEach((width) => {
      cy.viewport(width, 720);
      cy.get('[data-testid="nav-link-dashboard"]').should('not.be.visible');
      cy.get('[data-testid="mobile-menu-toggle"]').should('be.visible');
      cy.document().then((doc) => {
        expect(doc.documentElement.scrollWidth, `${width}px document scrollWidth`).to.be.at.most(
          doc.documentElement.clientWidth,
        );
      });
      cy.get('[data-testid="header"]').then(($header) => {
        const header = $header[0];
        expect(header.scrollWidth, `${width}px header scrollWidth`).to.be.at.most(
          header.clientWidth,
        );
      });
    });
  });

  it('keeps every primary link inside the header at the xl desktop breakpoint', () => {
    cy.viewport(1280, 720);
    cy.get('[data-testid="header"]').then(($header) => {
      const header = $header[0];
      const bounds = header.getBoundingClientRect();
      expect(header.scrollWidth, 'header scrollWidth').to.be.at.most(header.clientWidth);

      cy.get('[data-testid^="nav-link-"]:visible').each(($link) => {
        const rect = $link[0].getBoundingClientRect();
        expect(rect.left, `${$link.text()} left edge`).to.be.at.least(bounds.left - EPSILON);
        expect(rect.right, `${$link.text()} right edge`).to.be.at.most(bounds.right + EPSILON);
      });
    });
  });

  describe('at 320x700', () => {
    beforeEach(() => {
      cy.viewport(320, 700);
    });

    it('hides the GitHub star control', () => {
      cy.get('[data-testid="header-star-button"]').should('not.be.visible');
    });

    it('keeps the remaining controls inside the header bounds', () => {
      cy.get('[data-testid="header"]').then(($header) => {
        const bounds = $header[0].getBoundingClientRect();
        const selectors = [
          '[data-testid="header-brand"]',
          '[data-testid="language-toggle"]',
          '[data-testid="theme-toggle"]',
          '[data-testid="mobile-menu-toggle"]',
        ];
        selectors.forEach((selector) => {
          rectOf(selector).then((rect) => {
            expect(rect.left, `${selector} left edge`).to.be.at.least(bounds.left - EPSILON);
            expect(rect.right, `${selector} right edge`).to.be.at.most(bounds.right + EPSILON);
          });
        });
      });
    });

    it('gives the brand and language controls a 44px touch height', () => {
      ['[data-testid="header-brand"]', '[data-testid="language-toggle"]'].forEach((selector) => {
        rectOf(selector).then((rect) => {
          expect(rect.height, `${selector} height`).to.be.at.least(MIN_TOUCH_PX - EPSILON);
        });
      });
    });

    it('gives the icon controls a 44px touch target in both dimensions', () => {
      ['[data-testid="theme-toggle"]', '[data-testid="mobile-menu-toggle"]'].forEach((selector) => {
        rectOf(selector).then((rect) => {
          expect(rect.width, `${selector} width`).to.be.at.least(MIN_TOUCH_PX - EPSILON);
          expect(rect.height, `${selector} height`).to.be.at.least(MIN_TOUCH_PX - EPSILON);
        });
      });
    });

    it('does not overflow horizontally', () => {
      cy.get('[data-testid="header"]').then(($header) => {
        const header = $header[0];
        expect(header.scrollWidth, 'header scrollWidth').to.be.at.most(header.clientWidth);
      });
    });

    it('still opens the menu and exposes its links', () => {
      cy.get('[data-testid="mobile-menu-toggle"]').click();
      cy.get('[data-testid="mobile-menu"]').should('be.visible');
      cy.get('[data-testid="mobile-menu"]').within(() => {
        ['Home', 'Overview', 'Dashboard', 'Comparisons', 'AgentX', 'About'].forEach((label) => {
          cy.contains('a', label).should('be.visible');
        });
        ['Supporters', 'Articles'].forEach((label) => {
          cy.contains('a', label).should('not.exist');
        });
      });
      cy.get('[data-testid="mobile-menu"] a').each(($link) => {
        const rect = $link[0].getBoundingClientRect();
        expect(rect.height, `${$link.text()} link height`).to.be.at.least(MIN_TOUCH_PX - EPSILON);
      });
    });

    it('exposes the minecraft audio toggles in the mobile menu without overflowing', () => {
      cy.get('[data-testid="theme-toggle"]').click();
      cy.get('[data-testid="theme-toggle"]').click();
      cy.get('html').should('have.class', 'minecraft');
      cy.get('[data-testid="mobile-menu-toggle"]').click();
      cy.get('[data-testid="mobile-menu"]').within(() => {
        cy.get('button[aria-label="Mute music"]').should('be.visible');
        cy.get('button[aria-label="Mute click sounds"]').should('be.visible');
      });
      cy.get('[data-testid="header"]').then(($header) => {
        const header = $header[0];
        expect(header.scrollWidth, 'header scrollWidth').to.be.at.most(header.clientWidth);
      });
    });
  });
});
