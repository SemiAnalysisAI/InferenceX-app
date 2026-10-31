import { modelSelectionBenchmarks } from './model-selection-fixtures';

const qwenAgenticRows = modelSelectionBenchmarks
  .filter((row) => row.model === 'dsv4')
  .map((row) => ({ ...row, model: 'qwen3.5', precision: 'fp8' }));
qwenAgenticRows.push(
  ...qwenAgenticRows
    .filter((row) => row.hardware === 'gb300' && row.framework === 'dynamo-sglang')
    .map((row) => ({
      ...row,
      id: row.id + 5000,
      precision: 'fp4',
      framework: 'dynamo-trt',
      metrics: {
        ...row.metrics,
        tput_per_gpu: row.metrics.tput_per_gpu * 10,
        output_tput_per_gpu: row.metrics.output_tput_per_gpu * 10,
        input_tput_per_gpu: row.metrics.input_tput_per_gpu * 10,
        total_tput_tps: row.metrics.total_tput_tps * 10,
      },
    })),
);

export function assertTpuGb300Selected() {
  cy.get('[data-testid="chart-legend"] #checkbox-gb300_dynamo-sglang').should('be.checked');
  cy.get('.dot-group[data-hw-key="gb300_dynamo-sglang"]').should('have.css', 'opacity', '1');
  cy.get('[data-testid="scatter-quick-filters"]').click();
  cy.get('[data-testid="quick-filter-best-per-sku"]').should('have.attr', 'data-state', 'checked');
  cy.get('body').type('{esc}');
}

export function interceptTpuLaunchData(
  model: 'Qwen-3.5-397B-A17B' | 'Kimi-K3' = 'Qwen-3.5-397B-A17B',
) {
  const rows =
    model === 'Kimi-K3'
      ? qwenAgenticRows.map((row) => ({ ...row, model: 'kimik3' }))
      : qwenAgenticRows;
  cy.intercept('GET', '/api/v1/availability*', (request) => {
    request.on('response', (response) => {
      response.body = [...response.body, ...rows.map(({ metrics: _metrics, ...row }) => row)];
    });
  });
  cy.intercept('GET', '/api/v1/benchmarks*', (request) => {
    if (request.query.model === model) {
      request.reply({ body: rows });
    }
  });
}
