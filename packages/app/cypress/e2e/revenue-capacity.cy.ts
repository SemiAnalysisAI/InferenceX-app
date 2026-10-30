function response(target: number, period: string) {
  const hours = period === 'year' ? 8760 : period === 'quarter' ? 2190 : 730;
  return {
    apiVersion: 'v1',
    view: 'revenue-capacity',
    params: {
      model: 'Kimi-K3',
      revenueTarget: target,
      period,
      hours,
      target: 60,
      utilization: 50,
      cacheHitMode: 'actual',
      precisions: ['fp8'],
    },
    pricing: { inputPerMillion: 1, cachedInputPerMillion: 0.1, outputPerMillion: 1 },
    data: {
      rows: [
        {
          hwKey: 'b200',
          resultKey: 'b200',
          precision: 'fp8',
          sourceUrls: [],
          sourceDates: ['2026-10-29'],
          requiredGpus: 8,
          gpuEquivalents: 7.61,
          deploymentGpus: 8,
          deployments: 1,
          revenuePerGpuHour: 3.6,
          realizedRevenuePerGpuHour: 1.8,
          projectedRevenue: 10512,
        },
      ],
      skipped: [{ hwKey: 'h100', resultKey: 'h100', reason: 'outside-measured-range' }],
    },
    overlays: { rows: [], skipped: [] },
  };
}

describe('Revenue capacity', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/views/revenue-capacity*', (request) => {
      const params = new URL(request.url).searchParams;
      if (params.get('period') === 'quarter') request.alias = 'quarterCapacity';
      request.reply(response(Number(params.get('revenueTarget')), params.get('period')!));
    }).as('capacity');
  });

  it('applies period, revenue and pricing controls, preserves URLs and resets', () => {
    cy.visit('/revenue-capacity');
    cy.wait('@capacity');
    cy.get('[data-testid="capacity-count"]').should('contain.text', '8');
    cy.get('input[name="revenueTarget"]').clear().type('30000');
    cy.get('select[name="period"]').select('quarter');
    cy.get('select[name="priceSource"]').select('custom');
    cy.get('input[name="inputPrice"]').clear().type('1');
    cy.get('input[name="cachedInputPrice"]').clear().type('0.1');
    cy.get('input[name="outputPrice"]').clear().type('1');
    cy.contains('Settings changed').should('be.visible');
    cy.contains('button', 'Calculate capacity').click();
    cy.wait('@quarterCapacity').then(({ request }) => {
      const params = new URL(request.url).searchParams;
      expect(params.get('period')).to.eq('quarter');
      expect(params.get('revenueTarget')).to.eq('30000');
      expect(params.get('priceSource')).to.eq('custom');
    });
    cy.location('search').should('include', 'period=quarter');
    cy.reload();
    cy.get('input[name="revenueTarget"]').should('have.value', '30000');
    cy.get('select[name="period"]').should('have.value', 'quarter');
    cy.contains('summary', 'Unavailable configurations').click();
    cy.contains('Outside measured interactivity range').should('be.visible');
    cy.contains('button', 'Reset').click();
    cy.get('input[name="revenueTarget"]').should('have.value', '1000000');
    cy.get('select[name="period"]').should('have.value', 'month');
  });

  it('renders Chinese on mobile and recovers from an API failure', () => {
    cy.viewport(375, 812);
    cy.visit('/zh/revenue-capacity');
    cy.wait('@capacity');
    cy.contains('h1', '收入目标 → GPU 需求').should('be.visible');
    cy.get('[data-testid="capacity-count"]').should('contain.text', '8');
    cy.document().then((document) => {
      expect(document.documentElement.scrollWidth).to.be.at.most(375);
    });
    cy.intercept('GET', '/api/v1/views/revenue-capacity*', { statusCode: 503, body: {} }).as(
      'failed',
    );
    cy.get('input[name="revenueTarget"]').clear().type('20000');
    cy.contains('button', '计算芯片需求').click();
    cy.wait('@failed');
    cy.contains('无法计算芯片需求').should('be.visible');
    cy.intercept('GET', '/api/v1/views/revenue-capacity*', response(20000, 'month')).as('retried');
    cy.contains('button', '重试').click();
    cy.wait('@retried');
    cy.get('[data-testid="capacity-count"]').should('contain.text', '8');
  });
});
