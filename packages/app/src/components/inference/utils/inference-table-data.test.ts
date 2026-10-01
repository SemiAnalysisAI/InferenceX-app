import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { InferenceData } from '@/components/inference/types';
import { chartDefinitions } from '@/components/inference/metric-registry';
import InferenceTable from '@/components/inference/ui/InferenceTable';
import { sortRowsByYMetric } from '@/components/inference/ui/inference-table-sort';
import { inferenceChartToCsv } from '@/lib/csv-export-helpers';
import {
  allInMeasuredTableData,
  allInMeasuredUnavailableReason,
  inferenceTableYValue,
} from './inference-table-data';

const point = (overrides: Partial<InferenceData> = {}): InferenceData =>
  ({
    id: 1,
    x: 20,
    y: 999,
    date: '2026-09-01',
    tp: 4,
    conc: 8,
    hwKey: 'gb200_trt',
    hw: 'gb200',
    precision: 'fp4',
    measuredAvgPower: { y: 450, roof: false },
    modeledSystemPower: { status: 'unsupported', reason: 'cpu-telemetry', modelRevision: 'test' },
    ...overrides,
  }) as InferenceData;

describe('All in Measured table values', () => {
  it('retains only positive GPU measurements and never substitutes throughput for a missing estimate', () => {
    const rows = allInMeasuredTableData(
      [
        point(),
        point({ measuredAvgPower: undefined }),
        point({ measuredAvgPower: { y: 0, roof: false } }),
      ],
      'utilityModeledWatts',
      'median_intvty',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].y).toBeNaN();
    expect(inferenceTableYValue(rows[0], 'utilityModeledWatts.y')).toBeNull();
    expect(allInMeasuredUnavailableReason(rows[0], 'utilityModeledWatts')).toBe('cpu-telemetry');
    expect(
      allInMeasuredUnavailableReason(
        { ...rows[0], y: 1400, powerVariant: { kind: 'basis', id: 'gpu-provisioned' } },
        'utilityModeledWatts',
      ),
    ).toBe('cpu-telemetry');
  });

  it('sorts unavailable estimates last and renders their measured watts and reason', () => {
    const rows = allInMeasuredTableData(
      [point(), point({ id: 2, utilityModeledWatts: { y: 700, roof: false } })],
      'utilityModeledWatts',
      'median_intvty',
    );
    expect(
      sortRowsByYMetric(rows, chartDefinitions[0], 'y_utilityModeledWatts').map((row) => row.id),
    ).toEqual([2, 1]);
    const html = renderToStaticMarkup(
      createElement(InferenceTable, {
        data: rows,
        chartDefinition: chartDefinitions[0],
        selectedYAxisMetric: 'y_utilityModeledWatts',
      }),
    );
    expect(html).toContain('Grace or module telemetry missing or invalid');
    expect(html).toContain('450');
    expect(html).toContain('—');
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('999');
  });

  it('exports unavailable estimates as blanks alongside GPU watts and reason', () => {
    const rows = allInMeasuredTableData(
      [point({ x: NaN })],
      'utilityModeledWatts',
      'median_intvty',
    );
    const csv = inferenceChartToCsv(rows, 'Kimi-K3', 'agentic-traces', [], {
      yHeader: 'All in Measured',
      yPath: 'utilityModeledWatts.y',
      xHeader: 'Interactivity',
    });
    expect(csv.rows[0][csv.headers.indexOf('All in Measured')]).toBe('');
    expect(csv.rows[0][csv.headers.indexOf('Measured GPU Power (W/chip)')]).toBe(450);
    expect(csv.rows[0][csv.headers.indexOf('All-in Estimate Status')]).toBe(
      'Grace or module telemetry missing or invalid',
    );
    expect(csv.rows[0][csv.headers.indexOf('Interactivity')]).toBe('');
    const cloneCsv = inferenceChartToCsv(
      [{ ...rows[0], powerVariant: { kind: 'basis', id: 'utility-modeled' } }],
      'Kimi-K3',
      'agentic-traces',
      [],
      {
        yHeader: 'All in Measured',
        yPath: 'utilityModeledWatts.y',
        xHeader: 'Interactivity',
      },
    );
    expect(cloneCsv.rows[0][cloneCsv.headers.indexOf('All in Measured')]).toBe('');
  });
});
