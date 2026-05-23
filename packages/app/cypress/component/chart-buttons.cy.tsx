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

  describe('with MP4 export', () => {
    it('shows MP4 option in the export popover and triggers the callback', () => {
      const onExportMp4 = cy.stub().as('mp4Export');
      const onExportCsv = cy.stub().as('csvExport');
      cy.mount(
        <div style={{ position: 'relative', width: 400, height: 200 }}>
          <div id="test-chart">Chart content</div>
          <ChartButtons
            chartId="test-chart"
            analyticsPrefix="test"
            onExportCsv={onExportCsv}
            onExportMp4={onExportMp4}
          />
        </div>,
      );
      cy.get('[data-testid="export-button"]').click();
      cy.get('[data-testid="export-png-button"]').should('be.visible');
      cy.get('[data-testid="export-csv-button"]').should('be.visible');
      cy.get('[data-testid="export-mp4-button"]').should('be.visible').click();
      cy.get('@mp4Export').should('have.been.calledOnce');
      cy.get('@csvExport').should('not.have.been.called');
    });

    it('shows the popover when only MP4 export is provided (no CSV)', () => {
      const onExportMp4 = cy.stub().as('mp4Export');
      cy.mount(
        <div style={{ position: 'relative', width: 400, height: 200 }}>
          <div id="test-chart">Chart content</div>
          <ChartButtons chartId="test-chart" analyticsPrefix="test" onExportMp4={onExportMp4} />
        </div>,
      );
      cy.get('[data-testid="export-button"]').click();
      cy.get('[data-testid="export-csv-button"]').should('not.exist');
      cy.get('[data-testid="export-mp4-button"]').click();
      cy.get('@mp4Export').should('have.been.calledOnce');
    });
  });

  describe('embed scatter link', () => {
    it('shows Copy embed when getEmbedUrl is provided and copies an iframe snippet to clipboard', () => {
      const embedUrl = 'https://example.com/embed/scatter?model=dsr1';
      cy.window().then((win) => {
        cy.stub(win.navigator.clipboard, 'writeText').as('clipboardWrite');
      });
      cy.mount(
        <div style={{ position: 'relative', width: 400, height: 200 }}>
          <div id="test-chart">Chart content</div>
          <ChartButtons
            chartId="test-chart"
            analyticsPrefix="test"
            onExportCsv={cy.stub()}
            getEmbedUrl={() => embedUrl}
          />
        </div>,
      );
      cy.get('[data-testid="export-button"]').click();
      cy.get('[data-testid="export-embed-button"]').should('be.visible').click();
      cy.get('@clipboardWrite').should('have.been.calledOnce');
      cy.get('@clipboardWrite')
        .invoke('getCall', 0)
        .its('args')
        .its(0)
        .should('include', embedUrl)
        .and('include', '<iframe')
        .and('include', 'referrerpolicy="origin"');
      cy.get('[data-testid="export-embed-button"]').should('contain.text', 'Copied!');
    });

    it('shows the popover when only getEmbedUrl is provided', () => {
      cy.window().then((win) => {
        cy.stub(win.navigator.clipboard, 'writeText').as('clipboardWrite');
      });
      cy.mount(
        <div style={{ position: 'relative', width: 400, height: 200 }}>
          <div id="test-chart">Chart content</div>
          <ChartButtons
            chartId="test-chart"
            analyticsPrefix="test"
            getEmbedUrl={() => 'https://example.com/embed/scatter?model=dsr1'}
          />
        </div>,
      );
      cy.get('[data-testid="export-button"]').click();
      cy.get('[data-testid="export-png-button"]').should('be.visible');
      cy.get('[data-testid="export-csv-button"]').should('not.exist');
      cy.get('[data-testid="export-embed-button"]').should('be.visible');
      cy.get('[data-testid="export-embed-button"]').click();
      cy.get('@clipboardWrite').should('have.been.calledOnce');
      cy.get('@clipboardWrite')
        .invoke('getCall', 0)
        .its('args')
        .its(0)
        .should('include', '<iframe')
        .and('include', 'https://example.com/embed/scatter?model=dsr1');
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
