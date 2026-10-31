import { ChartButtons } from '@/components/ui/chart-buttons';
import { Card } from '@/components/ui/card';
import { SegmentedToggle } from '@/components/ui/segmented-toggle';
import { ShareButton } from '@/components/ui/share-button';
import { registerAnalyticsClient } from '@/lib/analytics/analytics';
import { GlobalFilterSelectionContext } from '@/providers/GlobalFilterContext';
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';

describe('ChartButtons', () => {
  it('offers PNG sizing only inside the download menu, including PNG-only charts', () => {
    cy.mount(
      <div>
        <div id="png-only-chart" style={{ width: 300, height: 200 }}>
          Chart content
        </div>
        <ChartButtons chartId="png-only-chart" analyticsPrefix="test" />
      </div>,
    );
    cy.get('[data-testid="png-aspect-ratio"]').should('not.exist');
    cy.get('[data-testid="export-button"]').click();
    cy.get('[data-testid="png-aspect-ratio"]').should('have.value', 'auto');
    for (const ratio of ['16:9', '1:1']) {
      cy.get('[data-testid="png-aspect-ratio"]').select(ratio).should('have.value', ratio);
      cy.get('#png-only-chart').should(($chart) => {
        const bounds = $chart[0].getBoundingClientRect();
        expect(bounds.width).to.eq(300);
        expect(bounds.height).to.eq(200);
      });
    }
    cy.get('[data-testid="export-button"]').click().click();
    cy.get('[data-testid="png-aspect-ratio"]').should('have.value', '1:1');
    cy.get('[data-testid="export-png-button"]').should('be.visible');
    cy.get('[data-testid="export-csv-button"]').should('not.exist');
  });

  it('does not offer PNG sizing when image export is unavailable', () => {
    cy.mount(
      <ChartButtons
        chartId="table-chart"
        analyticsPrefix="test"
        hideImageExport
        onExportCsv={cy.stub()}
      />,
    );
    cy.get('[data-testid="export-button"]').click();
    cy.get('[data-testid="png-aspect-ratio"]').should('not.exist');
    cy.get('[data-testid="export-png-button"]').should('have.attr', 'aria-disabled', 'true');
    cy.get('[data-testid="export-csv-button"]').should('be.visible');
  });

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

  describe('analytics', () => {
    it('sends the chart id and dashboard context with export and zoom-reset events', () => {
      registerAnalyticsClient({ capture: cy.stub().as('capture') });
      cy.mount(
        <div style={{ position: 'relative', width: 400, height: 200 }}>
          <div id="test-chart">Chart content</div>
          <ChartButtons
            chartId="test-chart"
            analyticsPrefix="test"
            analyticsContext={{
              model: 'DeepSeek-R1-0528',
              sequence: '8k/1k',
              precision: 'fp4,fp8',
              gpu_count: 3,
            }}
            onExportCsv={cy.stub()}
          />
        </div>,
      );
      const properties = {
        chart: 'test-chart',
        model: 'DeepSeek-R1-0528',
        sequence: '8k/1k',
        precision: 'fp4,fp8',
        gpu_count: 3,
      };
      cy.get('[data-testid="zoom-reset-button"]').click();
      cy.get('@capture').should('have.been.calledWith', 'test_zoom_reset_button', properties);
      cy.get('[data-testid="export-button"]').click();
      cy.get('@capture').should('have.been.calledWith', 'test_export_menu_opened', properties);
      cy.get('[data-testid="export-csv-button"]').click();
      cy.get('@capture').should('have.been.calledWith', 'test_csv_exported', properties);
    });

    it('sends the shared view, route and selected model with share events', () => {
      registerAnalyticsClient({ capture: cy.stub().as('capture') });
      cy.mount(
        <GlobalFilterSelectionContext.Provider
          value={
            { selectedModel: 'DeepSeek-R1-0528' } as React.ContextType<
              typeof GlobalFilterSelectionContext
            >
          }
        >
          <ShareButton />
        </GlobalFilterSelectionContext.Provider>,
      );
      const shareProperties = Cypress.sinon.match({
        model: 'DeepSeek-R1-0528',
        route_template: Cypress.sinon.match.string,
      });
      cy.get('[data-testid="share-button"]').click();
      cy.get('@capture').should('have.been.calledWith', 'share_popover_opened', shareProperties);
      cy.window().then((win) => cy.stub(win, 'open'));
      cy.get('[data-testid="share-twitter"]').click();
      cy.get('@capture').should(
        'have.been.calledWith',
        'social_share_twitter',
        Cypress.sinon.match({ model: 'DeepSeek-R1-0528', placement: 'share_popover' }),
      );
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

  it('renders localized accessible actions on mobile by default', () => {
    cy.viewport(375, 700);
    cy.mount(
      <PathnameContext.Provider value="/zh/inference">
        <div style={{ position: 'relative', width: 360, height: 200 }}>
          <div id="test-chart">Chart content</div>
          <ChartButtons chartId="test-chart" analyticsPrefix="test" onExportCsv={cy.stub()} />
        </div>
      </PathnameContext.Provider>,
    );
    cy.get('[data-testid="export-button"]')
      .should('be.visible')
      .and('have.attr', 'aria-label', '下载图表')
      .click();
    cy.get('[data-testid="export-png-button"]').should('contain.text', '下载 PNG');
    cy.get('[data-testid="png-aspect-ratio"]')
      .should('be.visible')
      .and('have.attr', 'aria-label', 'PNG 宽高比')
      .select('16:9');
    cy.get('[data-testid="export-csv-button"]').should('contain.text', '下载 CSV');
    cy.get('[data-testid="zoom-reset-button"]').should('have.attr', 'aria-label', '重置缩放');
  });

  for (const width of [320, 768, 1280]) {
    it(`keeps wrapping actions above long captions at ${width}px without losing actions`, () => {
      cy.viewport(width, 800);
      const onModeChange = cy.stub().as('modeChange');
      const onExportCsv = cy.stub().as('responsiveCsv');
      cy.mount(
        <figure style={{ maxWidth: 700, padding: 16 }}>
          <ChartButtons
            chartId="responsive-chart"
            analyticsPrefix="test"
            onExportCsv={onExportCsv}
            leadingControls={
              <>
                <SegmentedToggle
                  value="weekly"
                  options={[
                    { value: 'weekly', label: 'Weekly' },
                    { value: 'cumulative', label: 'Cumulative' },
                  ]}
                  onValueChange={onModeChange}
                  ariaLabel="Submission activity"
                />
                <ShareButton />
              </>
            }
          />
          <Card id="responsive-chart">
            <h2 data-testid="long-caption">
              Total Tokens per $1 TCO (Owning at Large Hyperscaler Volume) over time at 100
              tok/s/user
            </h2>
            <p>Full benchmark configuration and source details remain below the actions.</p>
          </Card>
        </figure>,
      );

      cy.get('[data-slot="chart-actions"]').should(($toolbar) => {
        const toolbar = $toolbar[0].getBoundingClientRect();
        const caption = $toolbar[0]
          .parentElement!.querySelector('[data-testid="long-caption"]')!
          .getBoundingClientRect();
        expect(toolbar.bottom, 'toolbar does not cover the title').to.be.at.most(caption.top);
        for (const button of $toolbar[0].querySelectorAll('button')) {
          const bounds = button.getBoundingClientRect();
          expect(bounds.left, 'button remains inside the row').to.be.at.least(toolbar.left);
          expect(bounds.right, 'button remains inside the row').to.be.at.most(toolbar.right + 1);
        }
      });
      cy.get(
        '[data-testid="export-button"], [data-testid="zoom-reset-button"], [data-testid="share-button"]',
      )
        .should('have.length', 3)
        .each(($button) => {
          expect($button[0].getBoundingClientRect().height).to.equal(width < 768 ? 44 : 32);
        });
      cy.get('[role="tablist"]').should(($toggle) => {
        expect(
          $toggle[0].getBoundingClientRect().height,
          'segmented control retains 44px phone segments inside its restored border',
        ).to.equal(width < 768 ? 46 : 32);
      });
      cy.contains('[role="tab"]', 'Cumulative').click();
      cy.get('@modeChange').should('have.been.calledOnceWith', 'cumulative');
      cy.get('[data-testid="export-button"]').click();
      cy.get('[data-testid="export-csv-button"]').click();
      cy.get('@responsiveCsv').should('have.been.calledOnce');
      cy.window().then((win) => {
        win.addEventListener('test_zoom_reset_responsive-chart', cy.stub().as('responsiveReset'));
      });
      cy.get('[data-testid="zoom-reset-button"]').click();
      cy.get('@responsiveReset').should('have.been.calledOnce');
    });
  }
});
