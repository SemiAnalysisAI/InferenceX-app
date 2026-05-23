function joinHeader(headers: Record<string, string | string[] | undefined>, name: string): string {
  const pair = Object.entries(headers).find(([k]) => k.toLowerCase() === name.toLowerCase());
  const v = pair?.[1];
  if (Array.isArray(v)) return v.join(', ');
  return typeof v === 'string' ? v : '';
}

describe('Embed — Scatter Chart', () => {
  describe('default URL', () => {
    before(() => {
      cy.visit('/embed/scatter');
    });

    it('renders the embed root container', () => {
      cy.get('[data-testid="embed-root"]').should('exist');
    });

    it('does not render the site header or footer', () => {
      cy.get('[data-testid="header"]').should('not.exist');
      cy.get('[data-testid="footer"]').should('not.exist');
    });

    it('renders an SVG chart with real data', () => {
      cy.get('[data-testid="embed-scatter-figure"]', { timeout: 15000 }).should('exist');
      cy.get('[data-testid="embed-scatter-figure"]').find('svg').should('exist');
      cy.contains('No data available').should('not.exist');
    });

    it('shows the SemiAnalysis InferenceX attribution link', () => {
      cy.get('[data-testid="embed-attribution"]')
        .should('exist')
        .should('contain.text', 'SemiAnalysis InferenceX');
    });

    it('attribution link points to the canonical /inference URL with seeded params', () => {
      cy.get('[data-testid="embed-attribution"]')
        .should('have.attr', 'href')
        .and('include', '/inference?')
        .and('include', 'g_model=DeepSeek-R1-0528')
        .and('include', 'i_metric=y_tpPerGpu');
    });

    it('does not show the Shift+Scroll instructions text', () => {
      cy.get('[data-testid="embed-chart-instructions"]').should('have.text', '');
    });

    it('has robots noindex meta tag', () => {
      // Root layout may emit its own `meta[name="robots"]` first; embed routes add a noindex tag too.
      cy.get('meta[name="robots"][content*="noindex"]').should('exist');
    });
  });

  describe('custom params (site-style keys)', () => {
    before(() => {
      cy.visit('/embed/scatter?g_model=DeepSeek-R1-0528&i_seq=8k%2F1k&i_prec=fp4&i_metric=y_costh');
    });

    it('renders chart with the custom y metric', () => {
      cy.get('[data-testid="embed-scatter-figure"]', { timeout: 15000 }).should('exist');
      cy.contains('No data available').should('not.exist');
    });

    it('canonical link reflects the y metric override', () => {
      cy.get('[data-testid="embed-attribution"]')
        .should('have.attr', 'href')
        .and('include', 'i_metric=y_costh');
    });

    it('canonical link does not include i_chart', () => {
      cy.get('[data-testid="embed-attribution"]')
        .should('have.attr', 'href')
        .and('not.include', 'i_chart');
    });
  });

  describe('i_active param restricts legend to creator-selected GPUs', () => {
    before(() => {
      cy.visit('/embed/scatter?i_active=b200_sglang');
    });

    it('renders chart without "No data available"', () => {
      cy.get('[data-testid="embed-scatter-figure"]', { timeout: 15000 }).should('exist');
      cy.get('[data-testid="embed-scatter-figure"]').find('svg').should('exist');
      cy.contains('No data available').should('not.exist');
    });

    it('legend contains only the allowed GPU', () => {
      // Each GPU renders as a <li> inside [data-testid="chart-legend"].
      // With i_active=b200_sglang, only that GPU is in the allow-list, so
      // exactly 1 <li> should appear (fp-indicators and controls use <div>).
      cy.get('[data-testid="embed-scatter-figure"]', { timeout: 15000 }).should('exist');
      cy.contains('No data available').should('not.exist');
      cy.get('[data-testid="embed-legend-panel"] [data-testid="chart-legend"] li').should(
        'have.length',
        1,
      );
    });
  });

  describe('i_chart param selects chart variant', () => {
    it('renders e2e chart by default', () => {
      cy.visit('/embed/scatter');
      cy.get('[data-testid="embed-scatter-figure"]', { timeout: 15000 }).should('exist');
    });

    it('renders interactivity chart when i_chart=interactivity', () => {
      cy.visit('/embed/scatter?i_chart=interactivity');
      cy.get('[data-testid="embed-scatter-figure"]', { timeout: 15000 }).should('exist');
      cy.contains('No data available').should('not.exist');
    });
  });

  describe('CSP headers', () => {
    it('embed routes allow framing from any origin', () => {
      cy.request('/embed/scatter').then((resp) => {
        const csp = joinHeader(resp.headers, 'content-security-policy');
        expect(csp).to.include('frame-ancestors *');
      });
    });

    it('non-embed routes restrict framing to self', () => {
      cy.request('/').then((resp) => {
        const csp = joinHeader(resp.headers, 'content-security-policy');
        expect(csp).to.include("frame-ancestors 'self'");
      });
    });
  });

  describe('viewport responsiveness', () => {
    it('renders chart at 600×500 (narrow iframe)', () => {
      cy.viewport(600, 500);
      cy.visit('/embed/scatter');
      cy.get('[data-testid="embed-scatter-figure"]', { timeout: 15000 }).should('exist');
      cy.get('[data-testid="embed-scatter-figure"]').find('svg').should('exist');
      cy.get('[data-testid="embed-legend-panel"]').should('be.visible');
    });

    it('legend dropdown stays inside the card at short height (800×400)', () => {
      cy.viewport(800, 400);
      cy.visit('/embed/scatter');
      cy.get('[data-testid="embed-scatter-figure"]', { timeout: 15000 }).should('exist');
      cy.get('[data-testid="embed-legend-panel"] summary').click();
      cy.get('[data-testid="embed-legend-dropdown"]').should('be.visible');
      cy.get('[data-testid="embed-scatter-figure"] [data-slot="card"]').then(($card) => {
        cy.get('[data-testid="embed-legend-dropdown"]').then(($dd) => {
          const cardTop = $card[0].getBoundingClientRect().top;
          const ddTop = $dd[0].getBoundingClientRect().top;
          expect(ddTop).to.be.at.least(cardTop);
        });
      });
    });

    it('renders chart at 800×600', () => {
      cy.viewport(800, 600);
      cy.visit('/embed/scatter');
      cy.get('[data-testid="embed-scatter-figure"]', { timeout: 15000 }).should('exist');
      cy.get('[data-testid="embed-scatter-figure"]').find('svg').should('exist');
      cy.get('[data-testid="embed-legend-panel"]').should('be.visible');
    });

    it('fits short iframe height without document scroll (1024×420)', () => {
      cy.viewport(1024, 420);
      cy.visit('/embed/scatter');
      cy.get('[data-testid="embed-scatter-figure"]', { timeout: 15000 }).should('exist');
      cy.get('[data-testid="scatter-graph"] svg').should('exist');
      cy.window().then((win) => {
        expect(win.document.documentElement.scrollHeight).to.be.at.most(420);
      });
      cy.get('[data-testid="scatter-graph"] svg')
        .invoke('attr', 'height')
        .then((h) => {
          const n = Number(h);
          expect(n).to.be.at.least(240);
          expect(n).to.be.below(600);
        });
    });

    it('floors chart SVG height at 240px when iframe is very short (1024×250)', () => {
      cy.viewport(1024, 250);
      cy.visit('/embed/scatter');
      cy.get('[data-testid="embed-scatter-figure"]', { timeout: 15000 }).should('exist');
      cy.get('[data-testid="scatter-graph"] svg').invoke('attr', 'height').should('eq', '240');
      cy.window().then((win) => {
        expect(win.document.documentElement.scrollHeight).to.be.above(
          win.document.documentElement.clientHeight,
        );
      });
    });
  });

  describe('unofficial run overlay', () => {
    it('renders overlay points when unofficialrun param is provided', () => {
      cy.intercept('GET', '/api/unofficial-run*', {
        statusCode: 200,
        body: {
          runInfos: [
            {
              id: 99999,
              branch: 'test-branch',
              url: 'https://github.com/test/repo/actions/runs/99999',
            },
          ],
          benchmarks: [
            {
              model: 'DeepSeek-R1-0528',
              sequence: '8k/1k',
              chart_type: 'e2e',
              precision: 'fp4',
              hw_type: 'b200_sglang',
              tp: 8,
              concurrency: 64,
              ttft_ms: 300,
              tpot_ms: 10,
              e2e_latency_ms: 600,
              total_throughput: 2000,
              throughput_per_gpu: 250,
              run_url: 'https://github.com/test/repo/actions/runs/99999',
            },
          ],
        },
      }).as('unofficialRun');

      cy.visit('/embed/scatter?unofficialrun=99999');
      cy.get('[data-testid="embed-scatter-figure"]', { timeout: 15000 }).should('exist');
      cy.get('[data-testid="embed-scatter-figure"]').find('svg').should('exist');
    });
  });
});
