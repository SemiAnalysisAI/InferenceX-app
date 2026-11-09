import { ChartPointDetails } from '@/components/ui/chart-point-details';

const expectChromeInView = () =>
  cy.get('[data-testid="point-details-panel"]').should(($panel) => {
    const panel = $panel[0].getBoundingClientRect();
    for (const selector of [
      '[data-testid="point-details-close"]',
      'p.text-destructive',
      '[data-action="run"]',
      '[data-action="view-logs"]',
    ]) {
      const box = $panel[0].querySelector(selector)!.getBoundingClientRect();
      expect(box.top, `${selector} top`).to.be.at.least(panel.top);
      expect(box.bottom, `${selector} bottom`).to.be.at.most(panel.bottom);
    }
    expect(panel.height, 'panel fits its frame').to.be.at.most(320);
  });

describe('ChartPointDetails', () => {
  it('keeps the header and action buttons visible while the details scroll', () => {
    cy.viewport(1280, 720);
    const rows = Array.from({ length: 30 }, (_, index) => ({
      label: `Detail row ${index + 1}`,
      value: `Value ${index + 1} with enough text`,
      wide: true,
    }));
    cy.mount(
      <div style={{ display: 'flex', flexDirection: 'column', width: 288, height: 320 }}>
        <ChartPointDetails
          title="GB300 NVL72"
          subtitle="Dynamo vLLM · FP4"
          warning="Unofficial run"
          metrics={[{ value: '47.47M', label: 'Total Tokens per $1 TCO' }]}
          rows={rows}
          links={[
            { action: 'run', label: 'GitHub Actions run', href: 'https://example.com' },
            { action: 'view-charts', label: 'View charts', href: '/charts' },
            { action: 'view-logs', label: 'View logs', href: '/logs' },
          ]}
          onClose={() => {}}
        />
      </div>,
    );

    cy.get('[data-slot="point-details-body"]').should(($body) => {
      expect($body[0].scrollHeight).to.be.greaterThan($body[0].clientHeight);
    });
    expectChromeInView();
    cy.get('[data-slot="point-details-body"]').scrollTo('bottom');
    expectChromeInView();
  });
});
