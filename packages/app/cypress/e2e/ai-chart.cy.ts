type FixtureRow = Record<string, any> & { metrics: Record<string, number> };

function fixtureRow(
  rows: FixtureRow[],
  hardware: 'b200' | 'mi355x',
  x: number,
  throughput: number,
  measuredPower?: number,
): FixtureRow {
  const template = rows.find(
    (row) =>
      row.hardware === hardware &&
      row.framework === 'sglang' &&
      row.spec_method === 'mtp' &&
      row.disagg === false &&
      row.isl === 8192 &&
      row.osl === 1024,
  );
  if (!template) throw new Error(`Missing ${hardware} SGLang fixture row`);

  const metrics: Record<string, number> = {
    ...template.metrics,
    median_intvty: x,
    tput_per_gpu: throughput,
    output_tput_per_gpu: throughput / 2,
    input_tput_per_gpu: throughput / 2,
  };
  if (measuredPower === undefined) delete metrics.avg_power_w;
  else metrics.avg_power_w = measuredPower;

  return {
    ...template,
    conc: x,
    metrics,
  };
}

function interceptGeneration(spec: Record<string, unknown>, rows: FixtureRow[]): void {
  cy.intercept('GET', '**/api/v1/benchmarks?*', rows).as('benchmarks');
  cy.intercept('POST', 'https://api.openai.com/v1/chat/completions', (request) => {
    const systemPrompt = request.body.messages?.[0]?.content ?? '';
    const content = systemPrompt.includes('chart generation assistant')
      ? JSON.stringify(spec)
      : 'Deterministic test summary.';
    request.reply({ choices: [{ message: { content } }] });
  }).as('openAi');
}

function generateChart(): void {
  cy.get('input[placeholder="OpenAI API Key"]').type('test-api-key', { log: false });
  cy.get('textarea').type('Generate the requested chart');
  cy.contains('button', 'Generate Chart').click();
  cy.wait('@benchmarks');
}

function benchmarkSpec(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    chartType: 'bar',
    dataSource: 'benchmarks',
    model: 'DeepSeek-R1-0528',
    sequence: '8k/1k',
    hardwareKeys: ['b200', 'mi355x'],
    precisions: [],
    frameworks: ['sglang'],
    disagg: false,
    yAxisMetric: 'y_tpPerGpu',
    yAxisLabel: 'Throughput/Chip',
    targetInteractivity: 40,
    sortOrder: 'desc',
    radarMetrics: null,
    topN: null,
    topNDistinctGpus: true,
    title: 'AI chart regression',
    description: 'Deterministic fixture data.',
    ...overrides,
  };
}

describe('AI chart metric semantics', () => {
  beforeEach(() => {
    cy.visit('/ai-chart');
  });

  it('excludes unavailable zero cost when selecting the top configuration', () => {
    cy.fixture<FixtureRow[]>('api/benchmarks.json').then((fixtureRows) => {
      const rows = [
        fixtureRow(fixtureRows, 'b200', 40, 0),
        fixtureRow(fixtureRows, 'mi355x', 40, 10_000),
      ];
      interceptGeneration(
        benchmarkSpec({
          yAxisMetric: 'y_costh',
          yAxisLabel: 'Cost per Million Total Tokens',
          sortOrder: 'asc',
          topN: 1,
          topNDistinctGpus: false,
        }),
        rows,
      );

      generateChart();

      cy.get('#ai-chart-bar-export')
        .should('contain.text', 'MI355X')
        .and('not.contain.text', 'B200');
      cy.get('#ai-chart-bar-export .bar').should('have.length', 1);
    });
  });

  it('renders lower measured power farther from the radar center', () => {
    cy.fixture<FixtureRow[]>('api/benchmarks.json').then((fixtureRows) => {
      const rows = [
        fixtureRow(fixtureRows, 'b200', 40, 100, 600),
        fixtureRow(fixtureRows, 'mi355x', 40, 100, 300),
      ];
      interceptGeneration(
        benchmarkSpec({
          chartType: 'radar',
          yAxisMetric: 'y_measuredAvgPower',
          yAxisLabel: 'Measured Average Power per Chip',
          radarMetrics: ['y_measuredAvgPower'],
        }),
        rows,
      );

      generateChart();

      cy.get('#ai-chart-radar-export .radar-dot')
        .should('have.length', 2)
        .then(($dots) => {
          const b200Radius = Math.hypot(
            Number($dots.eq(0).attr('cx')),
            Number($dots.eq(0).attr('cy')),
          );
          const mi355xRadius = Math.hypot(
            Number($dots.eq(1).attr('cx')),
            Number($dots.eq(1).attr('cy')),
          );
          expect(mi355xRadius).to.be.greaterThan(b200Radius);
        });
    });
  });

  it('keeps a missing middle metric as a line gap instead of a zero-valued dot', () => {
    cy.fixture<FixtureRow[]>('api/benchmarks.json').then((fixtureRows) => {
      const rows = [
        fixtureRow(fixtureRows, 'b200', 10, 100, 500),
        fixtureRow(fixtureRows, 'b200', 20, 200),
        fixtureRow(fixtureRows, 'b200', 30, 300, 400),
      ];
      interceptGeneration(
        benchmarkSpec({
          chartType: 'line',
          hardwareKeys: ['b200'],
          yAxisMetric: 'y_measuredAvgPower',
          yAxisLabel: 'Measured Average Power per Chip',
        }),
        rows,
      );

      generateChart();

      cy.get('#ai-chart-line-export .dot-group').should('have.length', 2);
      cy.get('#ai-chart-line-export .line-path')
        .invoke('attr', 'd')
        .should((path) => {
          expect(path?.match(/M/gu)).to.have.length(2);
        });
    });
  });
});
