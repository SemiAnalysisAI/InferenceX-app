import { describe, expect, it } from 'vitest';

import { DISPLAY_MODEL_TO_DB } from '@semianalysisai/inferencex-constants/models';

import type { EvalRow } from '@/lib/api/api';

import evaluationsFixture from '../../../cypress/fixtures/api/evaluations.json';
import { buildEvaluationChartRows } from './chart-data';
import { compactEvalRows, expandEvalRows } from './compact-rows';

// Ids are bigint columns, so the fixture (like the API) holds them as strings.
const rawRows = evaluationsFixture as unknown as EvalRow[];

// The route sends `compactEvalRows` through `cachedJson`; the client parses it with `res.json()`.
async function overWire(rows: readonly EvalRow[]): Promise<EvalRow[]> {
  return expandEvalRows(await Response.json(compactEvalRows(rows)).json());
}

const base: EvalRow = rawRows[0]!;

describe('compactEvalRows', () => {
  it('restores every column, keeping only the metrics the dashboard reads', async () => {
    const rows: EvalRow[] = [
      {
        ...base,
        id: 1,
        metrics: { n_eff: 10, em_strict: 0.5, em_strict_se: 0.1, em_flexible: 0.6, dp: 2 },
        timestamp: '2026-01-01T00:00:00Z',
        run_url: 'https://example.test/runs/1',
      },
      {
        ...base,
        id: 2,
        conc: null,
        metrics: { score: 0.7, score_se: 0.2 },
        timestamp: '2026-01-01T00:00:00Z',
        run_url: 'https://example.test/runs/2',
      },
      { ...base, id: 3, metrics: {}, timestamp: '2026-01-01T00:00:00Z', run_url: null },
      {
        ...base,
        id: 4,
        config_id: base.config_id + 1,
        hardware: 'b200',
        framework: 'trt',
        metrics: { em_strict: 0.9 },
      },
    ];
    expect(await overWire(rows)).toEqual([
      { ...rows[0], metrics: { em_strict: 0.5, em_strict_se: 0.1, dp: 2 } },
      rows[1],
      rows[2],
      rows[3],
    ]);
  });

  it('renders the same chart rows as the raw rows', async () => {
    const expanded = await overWire(rawRows);
    let compared = 0;
    for (const [model, dbKeys] of Object.entries(DISPLAY_MODEL_TO_DB)) {
      const modelRows = rawRows.filter((row) => dbKeys.includes(row.model));
      const precisions = [...new Set(modelRows.map((row) => row.precision))];
      const dates = [undefined, ...new Set(modelRows.map((row) => row.date))];
      for (const task of new Set(modelRows.map((row) => row.task))) {
        for (const date of dates) {
          const raw = buildEvaluationChartRows(rawRows, task, model, precisions, date);
          expect(buildEvaluationChartRows(expanded, task, model, precisions, date)).toEqual(raw);
          compared += raw.length;
        }
      }
    }
    expect(compared).toBeGreaterThan(0);
  });
});
