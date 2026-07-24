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
  };
}

function rectOf(selector: string) {
  return cy.get(selector).then(($el) => $el[0].getBoundingClientRect());
}

describe('Header', () => {
  beforeEach(() => {
    const mockRouter = createMockRouter();
    cy.mount(
      <AppRouterContext.Provider value={mockRouter}>
        <PathnameContext.Provider value="/">
          <QueryClientProvider client={queryClient}>
            <ThemeProvider attribute="class" defaultTheme="light" disableTransitionOnChange>
              <Header />
            </ThemeProvider>
          </QueryClientProvider>
        </PathnameContext.Provider>
      </AppRouterContext.Provider>,
    );
  });

  it('displays the InferenceX title', () => {
    cy.get('[data-testid="header"]').contains('InferenceX').should('be.visible');
  });

  it('displays the SemiAnalysis logo', () => {
    cy.get('[data-testid="header"]').find('img[alt="SemiAnalysis logo"]').should('exist');
  });

  it('shows Dashboard nav link', () => {
    cy.get('[data-testid="nav-link-dashboard"]').should('be.visible');
    cy.get('[data-testid="nav-link-dashboard"]').should('have.attr', 'href', '/inference');
  });

  it('shows Comparisons nav link', () => {
    cy.get('[data-testid="nav-link-compare"]').should('be.visible');
    cy.get('[data-testid="nav-link-compare"]').should('have.attr', 'href', '/compare');
  });

  it('shows Supporters nav link', () => {
    cy.get('[data-testid="nav-link-supporters"]').should('be.visible');
    cy.get('[data-testid="nav-link-supporters"]').should('have.attr', 'href', '/quotes');
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
      cy.contains('a', 'Dashboard').should('be.visible').and('have.attr', 'href', '/inference');
      cy.contains('a', 'Comparisons').should('be.visible').and('have.attr', 'href', '/compare');
      cy.contains('a', 'Supporters').should('be.visible').and('have.attr', 'href', '/quotes');
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
        ['Home', 'Dashboard', 'Comparisons', 'Supporters', 'Datasets', 'Articles', 'About'].forEach(
          (label) => {
            cy.contains('a', label).should('be.visible');
          },
        );
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
