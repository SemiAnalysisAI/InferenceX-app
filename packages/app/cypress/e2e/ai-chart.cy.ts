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

describe('AI chart Chinese workflow', () => {
  it('requests Chinese presentation copy and renders the returned chart and summary', () => {
    cy.viewport(1440, 900);
    cy.fixture<FixtureRow[]>('api/benchmarks.json').then((fixtureRows) => {
      const rows = [
        fixtureRow(fixtureRows, 'b200', 40, 12_000),
        fixtureRow(fixtureRows, 'mi355x', 40, 10_000),
      ];
      const spec = benchmarkSpec({
        title: '每芯片吞吐量对比',
        description: '在目标交互性下对比两种芯片。',
        yAxisLabel: '每芯片吞吐量',
      });

      cy.intercept('GET', '**/api/v1/benchmarks?*', rows).as('zhBenchmarks');
      cy.intercept('POST', 'https://api.openai.com/v1/chat/completions', (request) => {
        const systemPrompt = request.body.messages?.[0]?.content ?? '';
        if (systemPrompt.includes('chart generation assistant')) {
          expect(systemPrompt).to.contain('natural Simplified Chinese');
          request.reply({ choices: [{ message: { content: JSON.stringify(spec) } }] });
          return;
        }

        expect(systemPrompt).to.contain('用自然、准确的简体中文回答');
        request.reply({ choices: [{ message: { content: 'B200 在该配置下吞吐量更高。' } }] });
      }).as('zhOpenAi');

      cy.visit('/zh/ai-chart');
      cy.get('input[placeholder="OpenAI API Key"]').type('test-api-key', { log: false });
      cy.get('textarea[placeholder="描述想查看的图表……"]').type(
        '对比 B200 和 MI355X 的每芯片吞吐量',
      );
      cy.contains('button', '生成图表').click();

      cy.wait('@zhBenchmarks');
      cy.get('#ai-chart-bar-export')
        .should('contain.text', '每芯片吞吐量对比')
        .and('contain.text', '在目标交互性下对比两种芯片。')
        .and('contain.text', '每芯片吞吐量');
      cy.get('[role="img"][aria-label="AI 生成的条形图"]').should('be.visible');
      cy.contains('[data-slot="card-title"]', 'AI 总结').should('be.visible');
      cy.contains('B200 在该配置下吞吐量更高。').should('be.visible');
    });
  });

  it('keeps interactive scatter and line charts exposed as accessible groups', () => {
    cy.fixture<FixtureRow[]>('api/benchmarks.json').then((fixtureRows) => {
      const rows = [
        fixtureRow(fixtureRows, 'b200', 20, 8_000),
        fixtureRow(fixtureRows, 'b200', 40, 12_000),
        fixtureRow(fixtureRows, 'mi355x', 20, 7_000),
        fixtureRow(fixtureRows, 'mi355x', 40, 10_000),
      ];
      const specs = [
        benchmarkSpec({ chartType: 'scatter', title: '交互式散点图' }),
        benchmarkSpec({ chartType: 'line', title: '交互式折线图' }),
      ];

      cy.intercept('GET', '**/api/v1/benchmarks?*', rows).as('interactiveBenchmarks');
      cy.intercept('POST', 'https://api.openai.com/v1/chat/completions', (request) => {
        const systemPrompt = request.body.messages?.[0]?.content ?? '';
        request.reply({
          choices: [
            {
              message: {
                content: systemPrompt.includes('chart generation assistant')
                  ? JSON.stringify(specs)
                  : '已生成两张交互式图表。',
              },
            },
          ],
        });
      });

      cy.visit('/zh/ai-chart');
      cy.get('input[placeholder="OpenAI API Key"]').type('test-api-key', { log: false });
      cy.get('textarea[placeholder="描述想查看的图表……"]').type('生成散点图和折线图');
      cy.contains('button', '生成图表').click();
      cy.wait('@interactiveBenchmarks');

      cy.get('[role="group"][aria-label="AI 生成的散点图"]').should('be.visible');
      cy.get('[role="group"][aria-label="AI 生成的折线图"]').should('be.visible');
      cy.get('[role="img"][aria-label="AI 生成的散点图"]').should('not.exist');
      cy.get('[role="img"][aria-label="AI 生成的折线图"]').should('not.exist');
    });
  });

  it('shows a localized empty state for one unmatched chart in a multi-chart result', () => {
    cy.fixture<FixtureRow[]>('api/benchmarks.json').then((fixtureRows) => {
      const rows = [fixtureRow(fixtureRows, 'b200', 40, 12_000)];
      const specs = [
        benchmarkSpec({
          title: 'B200 吞吐量',
          description: '实测配置。',
          hardwareKeys: ['b200'],
          yAxisLabel: '每芯片吞吐量',
        }),
        benchmarkSpec({
          title: 'H100 吞吐量',
          description: '当前数据集中没有匹配项。',
          hardwareKeys: ['h100'],
          yAxisLabel: '每芯片吞吐量',
        }),
      ];

      cy.intercept('GET', '**/api/v1/benchmarks?*', rows).as('multiChartBenchmarks');
      cy.intercept('POST', 'https://api.openai.com/v1/chat/completions', (request) => {
        const systemPrompt = request.body.messages?.[0]?.content ?? '';
        request.reply({
          choices: [
            {
              message: {
                content: systemPrompt.includes('chart generation assistant')
                  ? JSON.stringify(specs)
                  : '已对比可用数据。',
              },
            },
          ],
        });
      });

      cy.visit('/zh/ai-chart');
      cy.get('input[placeholder="OpenAI API Key"]').type('test-api-key', { log: false });
      cy.get('textarea').type('生成两张吞吐量图表');
      cy.contains('button', '生成图表').click();

      cy.wait('@multiChartBenchmarks');
      cy.contains('H100 吞吐量')
        .closest('[data-slot="card"]')
        .should('contain.text', '当前图表配置没有匹配的数据。');
    });
  });

  it('does not expose a provider error body or API key on the Chinese route', () => {
    cy.intercept('POST', 'https://api.openai.com/v1/chat/completions', {
      statusCode: 401,
      body: { error: { message: 'provider-internal-error sk-sensitive-example-key' } },
    }).as('failedProvider');
    cy.visit('/zh/ai-chart');
    cy.get('input[placeholder="OpenAI API Key"]').type('sk-sensitive-example-key', { log: false });
    cy.get('textarea').type('对比吞吐量');
    cy.contains('button', '生成图表').click();
    cy.wait('@failedProvider');

    cy.contains('图表请求失败。请检查 API 密钥和服务商设置后重试。').should('be.visible');
    cy.contains('provider-internal-error').should('not.exist');
    cy.get('[data-testid="ai-chart-error"]').should('not.contain.text', 'sk-sensitive-example-key');
    cy.contains('button', '返回修改').click();
    cy.get('[data-testid="ai-chart-error"]').should('not.exist');
    cy.get('input[placeholder="OpenAI API Key"]').should('have.value', 'sk-sensitive-example-key');
    cy.get('textarea').should('have.value', '对比吞吐量');
  });

  it('keeps Chinese provider controls and examples within 375px', () => {
    cy.viewport(375, 844);
    cy.visit('/zh/ai-chart');
    cy.get('input[placeholder="OpenAI API Key"]').should('be.visible');
    cy.get('textarea[placeholder="描述想查看的图表……"]').should('be.visible');
    cy.contains('提示词示例').should('be.visible');
    cy.contains(`${Cypress.platform === 'darwin' ? '⌘' : 'Ctrl'}+Enter 生成图表`).should(
      'be.visible',
    );
    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.lte(doc.documentElement.clientWidth);
    });
  });
});
