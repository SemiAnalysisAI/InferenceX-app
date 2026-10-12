import { captureCsvDownloads, exportFirstChart, readCapturedCsv } from '../support/csv-download';

interface ExportRoute {
  route: string;
  ready: string;
  headers: readonly string[];
}

const routes: readonly ExportRoute[] = [
  {
    route: '/inference',
    ready: '[data-testid="scatter-graph"] svg .dot-group',
    headers: ['Hardware Key', 'Throughput/Chip (tok/s)', 'Mean TTFT (s)'],
  },
  {
    route: '/reliability?r_range=all-time',
    ready: '#reliability-chart svg rect.bar',
    headers: ['Chip Key', 'Success Rate (%)', 'Successful Runs', 'Total Runs'],
  },
  {
    route: '/evaluation',
    ready: '[data-testid="evaluation-chart-display"]',
    headers: ['Benchmark', 'Mean Score', 'Hardware Key'],
  },
  {
    route: '/calculator',
    ready: '[data-testid="calculator-bar-chart"] svg .bar',
    headers: ['Hardware Key', 'Total Throughput (tok/s/chip)', 'Target Interactivity (tok/s/user)'],
  },
  {
    route: '/historical',
    ready: '[data-testid="historical-trend-figure"] svg circle',
    headers: ['Hardware Key', 'Date', 'Synthetic', 'Target Interactivity (tok/s/user)'],
  },
];

describe('CSV download route contract', () => {
  it('exports nonempty data with route-specific headers on every chart surface', () => {
    for (const { route, ready, headers } of routes) {
      cy.log(`CSV contract: ${route}`);
      cy.visit(route, {
        onBeforeLoad(win) {
          win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
          captureCsvDownloads(win);
        },
      });
      cy.get(ready).should('be.visible');
      if (route === '/evaluation') {
        cy.get('[data-testid="evaluation-chart-view-btn"]').click();
        cy.get('#evaluation-chart svg circle').should('have.length.greaterThan', 0);
      }
      cy.get('[data-testid="export-button"]').first().click();
      cy.get('[data-testid="export-png-button"]')
        .should('be.visible')
        .and('contain.text', 'Download PNG');
      cy.get('body').type('{esc}');
      exportFirstChart();
      readCapturedCsv().then((csv) => {
        const lines = csv
          .trim()
          .split(/\r?\n/u)
          .filter((line) => !line.startsWith('#'));
        expect(lines.length, `${route} header and data rows`).to.be.greaterThan(1);
        for (const header of headers) expect(lines[0], route).to.contain(header);
        expect(lines.slice(1).join('\n'), `${route} numeric fixture data`).to.match(/\d/u);
        expect(csv, `${route} finite values`).not.to.match(/\b(?:NaN|Infinity|undefined)\b/u);
      });
    }
  });
});
