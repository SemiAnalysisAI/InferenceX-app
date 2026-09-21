import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';

import { chartDefinitions } from '@/components/inference/metric-registry';
import InferenceTable from '@/components/inference/ui/InferenceTable';
import { expandPowerCompareSeries } from '@/components/inference/utils/power-compare';

import { createMockInferenceData } from '../support/mock-data';
import { mountWithProviders } from '../support/test-utils';

const metric = (y: number) => ({ y, roof: false });
const points = expandPowerCompareSeries(
  [
    [708.1, 760.442, 690.652],
    [281.614, 250.622, 291.945],
  ].map(([all, prefill, decode], index) =>
    createMockInferenceData({
      hwKey: 'gb300_dynamo-trt',
      conc: (index + 1) * 64,
      y: all,
      measuredAvgPower: metric(all),
      measuredPrefillAvgPower: metric(prefill),
      measuredDecodeAvgPower: metric(decode),
    }),
  ),
  'y_measuredAvgPower',
  'roles',
);

describe('Power comparison table values', () => {
  for (const width of [1280, 390]) {
    it(`keeps role values, sorting and search consistent at ${width}px`, () => {
      cy.viewport(width, 720);
      mountWithProviders(
        <PathnameContext.Provider value="/inference">
          <InferenceTable
            data={points}
            chartDefinition={chartDefinitions[0]}
            selectedYAxisMetric="y_measuredAvgPower"
          />
        </PathnameContext.Provider>,
      );
      const table = '[data-testid="inference-results-table"]';
      const assertRows = (expected: [string, string][]) => {
        cy.get<HTMLTableRowElement>(`${table} tbody tr`).should(($rows) => {
          expect(
            [...$rows].map((row) => [row.cells[2].textContent, row.cells[3].textContent]),
          ).to.deep.equal(expected);
        });
      };
      const ascending: [string, string][] = [
        ['Prefill GPUs', '251'],
        ['All GPUs', '282'],
        ['Decode GPUs', '292'],
        ['Decode GPUs', '691'],
        ['All GPUs', '708'],
        ['Prefill GPUs', '760'],
      ];
      assertRows(ascending);
      cy.get(`${table} thead th`).eq(3).scrollIntoView().click();
      assertRows(ascending.toReversed());
      cy.get(`${table} thead th`).eq(3).click();
      assertRows(ascending);
      cy.get(table).screenshot(`power-role-table-${width}`);
      cy.get(`${table} input`).type('760');
      assertRows([['Prefill GPUs', '760']]);
    });
  }
});
