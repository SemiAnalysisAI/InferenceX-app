import { DISPLAY_MODEL_TO_DB } from '@semianalysisai/inferencex-constants';

import { compactTrendHistory } from '@/components/inference/hooks/trend-history-rows';
import type { AvailabilityRow, BenchmarkRow } from '@/lib/api/api';

import previewSnapshotRows from '../fixtures/preview-snapshots.json';
import { availabilityBody } from './e2e';

/** The official preview snapshots (Jalapeño, July Vera Rubin, TPU7x) as the DB serves them. */
export const previewRows = previewSnapshotRows as unknown as BenchmarkRow[];

export const previewAvailability: AvailabilityRow[] = previewRows.map(
  ({
    model,
    isl,
    osl,
    precision,
    hardware,
    framework,
    spec_method,
    disagg,
    benchmark_type,
    date,
  }) => ({
    model,
    isl,
    osl,
    precision,
    hardware,
    framework,
    spec_method,
    disagg,
    benchmark_type,
    date,
  }),
);

function rowsForModel(displayModel: unknown): BenchmarkRow[] {
  const keys = DISPLAY_MODEL_TO_DB[String(displayModel)] ?? [];
  return previewRows.filter((row) => keys.includes(row.model));
}

function latestPerCurve(rows: BenchmarkRow[]): BenchmarkRow[] {
  const latest = new Map<string, string>();
  for (const row of rows) {
    const key = `${row.hardware}|${row.framework}`;
    if ((latest.get(key) ?? '') < row.date) latest.set(key, row.date);
  }
  return rows.filter((row) => latest.get(`${row.hardware}|${row.framework}`) === row.date);
}

function register(
  availability: AvailabilityRow[],
  benchmarks: BenchmarkRow[],
  history: BenchmarkRow[],
): void {
  cy.intercept('GET', '**/api/v1/availability/compact', {
    body: availabilityBody([...availability, ...previewAvailability]),
  });
  cy.intercept('GET', '**/api/v1/benchmarks?*', (request) => {
    request.reply({
      body: [...benchmarks, ...latestPerCurve(rowsForModel(request.query.model))],
    });
  });
  cy.intercept('GET', '**/api/v1/benchmarks/history?*', (request) => {
    request.reply({ body: [...history, ...rowsForModel(request.query.model)] });
  });
  cy.intercept('GET', '**/api/v1/benchmarks/history/trends?*', (request) => {
    request.reply({
      body: compactTrendHistory([...history, ...rowsForModel(request.query.model)]),
    });
  });
}

/** Serves the preview snapshots as the whole database, or on top of the API fixtures. */
export function interceptPreviewSnapshots({ overFixtures = false } = {}): void {
  if (!overFixtures) {
    register([], [], []);
    return;
  }
  cy.fixture<AvailabilityRow[]>('api/availability.json').then((availability) => {
    cy.fixture<BenchmarkRow[]>('api/benchmarks.json').then((benchmarks) => {
      cy.fixture<BenchmarkRow[]>('api/benchmarks-history.json').then((history) => {
        register(availability, benchmarks, history);
      });
    });
  });
}
