import type { AvailabilityRow } from '@/lib/api/api';

import { availabilityBody } from './e2e';
import { modelSelectionBenchmarks } from './model-selection-fixtures';
import { expectHwKeyOpacity } from './scatter-points';

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
  expectHwKeyOpacity('gb300_dynamo-sglang', 1);
  cy.get('[data-testid="scatter-quick-filters"]').click();
  cy.get('[data-testid="quick-filter-best-per-sku"]').should('have.attr', 'data-state', 'checked');
  cy.get('body').type('{esc}');
}

type TpuLaunchModel = 'Qwen-3.5-397B-A17B' | 'Kimi-K3' | 'GLM-5.2';

export function tpuLaunchRows(model: TpuLaunchModel = 'Qwen-3.5-397B-A17B') {
  if (model === 'GLM-5.2') {
    return qwenAgenticRows.map((row) => ({ ...row, model: 'glm5.3' }));
  }
  return model === 'Kimi-K3'
    ? qwenAgenticRows.map((row) => ({ ...row, model: 'kimik3' }))
    : qwenAgenticRows;
}

export function interceptTpuLaunchData(model: TpuLaunchModel = 'Qwen-3.5-397B-A17B') {
  const rows = tpuLaunchRows(model);
  cy.fixture<AvailabilityRow[]>('api/availability.json').then((availability) => {
    cy.intercept('GET', '/api/v1/availability/compact', {
      body: availabilityBody([
        ...availability,
        ...rows.map(({ metrics: _metrics, ...row }) => row),
      ]),
    });
  });
  cy.intercept('GET', '/api/v1/benchmarks*', (request) => {
    if (request.query.model === model) {
      request.reply({ body: rows });
    }
  });
}
