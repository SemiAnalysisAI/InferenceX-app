import { ChartButtons } from '@/components/ui/chart-buttons';

describe('ChartButtons', () => {
  describe('without CSV export', () => {
    beforeEach(() => {
      cy.mount(
        <div style={{ position: 'relative', width: 400, height: 200 }}>
          <div id="test-chart">Chart content</div>
          <ChartButtons chartId="test-chart" analyticsPrefix="test" />
        </div>,
      );
    });

    it('zoom reset dispatches custom event', () => {
      cy.window().then((win) => {
        const handler = cy.stub().as('zoomReset');
        win.addEventListener('test_zoom_reset_test-chart', handler);
      });
      cy.get('[data-testid="zoom-reset-button"]').click();
      cy.get('@zoomReset').should('have.been.calledOnce');
    });
  });

  describe('with CSV export', () => {
    it('shows dropdown with PNG and CSV options', () => {
      const onExportCsv = cy.stub().as('csvExport');
      cy.mount(
        <div style={{ position: 'relative', width: 400, height: 200 }}>
          <div id="test-chart">Chart content</div>
          <ChartButtons chartId="test-chart" analyticsPrefix="test" onExportCsv={onExportCsv} />
        </div>,
      );
      cy.get('[data-testid="export-button"]').click();
      cy.get('[data-testid="export-png-button"]').should('be.visible');
      cy.get('[data-testid="export-csv-button"]').should('be.visible');
    });

    it('clicking CSV calls onExportCsv', () => {
      const onExportCsv = cy.stub().as('csvExport');
      cy.mount(
        <div style={{ position: 'relative', width: 400, height: 200 }}>
          <div id="test-chart">Chart content</div>
          <ChartButtons chartId="test-chart" analyticsPrefix="test" onExportCsv={onExportCsv} />
        </div>,
      );
      cy.get('[data-testid="export-button"]').click();
      cy.get('[data-testid="export-csv-button"]').click();
      cy.get('@csvExport').should('have.been.calledOnce');
    });
  });

  describe('hideZoomReset', () => {
    it('hides zoom reset button when hideZoomReset is true', () => {
      cy.mount(
        <div style={{ position: 'relative', width: 400, height: 200 }}>
          <div id="test-chart">Chart content</div>
          <ChartButtons chartId="test-chart" analyticsPrefix="test" hideZoomReset />
        </div>,
      );
      cy.get('[data-testid="zoom-reset-button"]').should('not.exist');
      cy.get('[data-testid="export-button"]').should('be.visible');
    });
  });
});
