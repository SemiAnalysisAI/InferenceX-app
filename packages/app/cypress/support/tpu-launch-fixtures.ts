import { modelSelectionBenchmarks } from './model-selection-fixtures';

// Synthetic navigation data: the captured Qwen fixtures only contain single-turn runs.
const qwenAgenticRows = modelSelectionBenchmarks
  .filter((row) => row.model === 'dsv4')
  .map((row) => ({ ...row, model: 'qwen3.5', precision: 'fp8' }));

export function interceptTpuLaunchData() {
  // Preserve other models and any test-specific availability overrides.
  cy.intercept('GET', '/api/v1/availability*', (request) => {
    request.on('response', (response) => {
      response.body = [
        ...response.body,
        ...qwenAgenticRows.map(({ metrics: _metrics, ...row }) => row),
      ];
    });
  });
  cy.intercept('GET', '/api/v1/benchmarks*', (request) => {
    if (request.query.model === 'Qwen-3.5-397B-A17B') {
      request.reply({ body: qwenAgenticRows });
    }
  });
}
