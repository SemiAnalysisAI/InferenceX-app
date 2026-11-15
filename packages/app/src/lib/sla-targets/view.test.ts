import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { SlaLatencyTargets } from '@semianalysisai/inferencex-constants';
import {
  decodeSlaAttempts,
  SLA_ATTEMPTS_VERSION,
} from '@semianalysisai/inferencex-db/etl/sla-attempts';

import type { SlaAttemptsFixture, SlaTargetsFixture } from './dataset.server';
import { evaluateSlaAttemptsBlob, type SlaPointEvaluations } from './evaluation';
import { evaluateSlaTargetsView, slaEvaluationIds, slaWorkloads } from './view';

/**
 * These tests run on the captured fixture: real AgentX results read from
 * GitHub Actions artifacts by `scripts/capture-sla-targets-fixtures.ts`.
 */
const FIXTURES = resolve(import.meta.dirname, '../../../cypress/fixtures/api');
const dataset = JSON.parse(
  readFileSync(resolve(FIXTURES, 'sla-targets.json'), 'utf8'),
) as SlaTargetsFixture;
const attempts = JSON.parse(
  readFileSync(resolve(FIXTURES, 'sla-attempts.json'), 'utf8'),
) as SlaAttemptsFixture;

const MODEL = 'DeepSeek-V4-Pro';
const configs = dataset.models[MODEL];
const RELAXED: SlaLatencyTargets = { maxTtftMs: 10_000, maxTpotMs: 50, maxE2eS: null };
const EXAMPLE: SlaLatencyTargets = { maxTtftMs: 1000, maxTpotMs: 50, maxE2eS: null };

function evaluate(targets: SlaLatencyTargets, ids = slaEvaluationIds(configs)) {
  const evaluations: SlaPointEvaluations = {};
  for (const id of ids) {
    evaluations[id] = evaluateSlaAttemptsBlob(
      decodeSlaAttempts(Buffer.from(attempts[id], 'base64')),
      targets,
    );
  }
  return evaluations;
}

function rowOf(view: ReturnType<typeof evaluateSlaTargetsView>, hardware: string, serving: string) {
  const row = view.rows.find(
    (entry) => entry.config.hardware === hardware && entry.servingLabel === serving,
  );
  if (!row) throw new Error(`no row for ${hardware} ${serving}`);
  return row;
}

describe('captured fixture', () => {
  it('holds attempt data for every point that claims request-level data', () => {
    const all = Object.values(dataset.models).flat();
    const withData = all.flatMap((config) => config.points.filter((point) => point.hasRequestData));
    expect(withData.length).toBeGreaterThan(40);
    for (const point of withData) {
      expect(attempts[point.id], `point ${point.id}`).toBeTypeOf('string');
      expect(point.artifact).toMatch(/^agentic_/u);
    }
    expect(Object.keys(attempts)).toHaveLength(withData.length);
    expect(dataset.attemptsVersion).toBe(SLA_ATTEMPTS_VERSION);
    expect(dataset.runs.map((run) => run.runId).toSorted()).toEqual([
      '34857875250',
      '36463674051',
      '40421997301',
      '43561310271',
      '43587669179',
    ]);
  });

  it('reconciles every point that was read with its harness log', () => {
    for (const config of Object.values(dataset.models).flat()) {
      for (const point of config.points.filter((entry) => entry.hasRequestData)) {
        const blob = decodeSlaAttempts(Buffer.from(attempts[point.id], 'base64'));
        const { accounting } = evaluateSlaAttemptsBlob(blob, EXAMPLE);
        if (blob.source.harnessLog === 'absent') {
          expect(accounting.reason).toBe('dispatch_count_unavailable');
          continue;
        }
        expect(accounting, `point ${point.id}`).toMatchObject({
          completeness: 'complete',
          reason: 'reconciled',
          unknown: 0,
        });
        expect(
          accounting.completed + accounting.failed + accounting.cancelled + accounting.incomplete,
        ).toBe(accounting.dispatched);
        expect(accounting.window).toMatchObject({
          durationS: 3600,
          durationSource: 'configured_window',
        });
      }
    }
  });
});

describe('evaluateSlaTargetsView', () => {
  it('finds no qualifying configuration at the example targets', () => {
    const view = evaluateSlaTargetsView(configs, MODEL, evaluate(EXAMPLE), 0.99, 'hyperscaler');
    expect(view.qualifying).toEqual([]);
    expect(view.rows.map((row) => row.status)).not.toContain('meets');
  });

  it('reports each headline value with the load point that supports it', () => {
    const view = evaluateSlaTargetsView(configs, MODEL, evaluate(RELAXED), 0.99, 'hyperscaler');
    const row = rowOf(view, 'b200', 'Dynamo SGLang · FP4 · MTP · 8P+8D · KV offload');
    expect(row.status).toBe('meets');
    expect(row.selections.highestPassingLoad?.concurrency).toBe(32);
    const observed = row.selections.highestPassingLoad?.result?.observed;
    expect(observed).toMatchObject({ attempted: 4537, passing: 4497, durationS: 3600 });
    expect(observed?.goodputRps).toBeCloseTo(4497 / 3600, 12);
    // 16 GPUs for the whole configured hour, over the attempts that passed.
    const cost = row.selections.lowestCost?.result?.costPer1kCompliantUsd;
    expect(cost).toBeCloseTo(((row.gpuHourUsd * 16) / 4497) * 1000, 9);
    expect(
      row.points.filter((point) => point.result?.qualification.status === 'misses'),
    ).toHaveLength(3);
  });

  it('ranks qualifying configurations by cost and leaves the rest out', () => {
    const view = evaluateSlaTargetsView(configs, MODEL, evaluate(RELAXED), 0.99, 'hyperscaler');
    const costs = view.qualifying.map(
      (row) => row.selections.lowestCost?.result?.costPer1kCompliantUsd ?? Number.NaN,
    );
    expect(costs.length).toBeGreaterThanOrEqual(3);
    expect(costs).toEqual(costs.toSorted((a, b) => a - b));
    expect(view.rows.slice(0, view.qualifying.length)).toEqual(view.qualifying);
    expect(view.qualifying.every((row) => row.status === 'meets' && !row.exploratory)).toBe(true);
  });

  it('never qualifies a configuration whose dispatched attempts are not established', () => {
    // The H200 run was captured the way the database stores historical points: export only.
    for (const targets of [EXAMPLE, RELAXED, { ...RELAXED, maxTtftMs: 3_600_000 }]) {
      const view = evaluateSlaTargetsView(configs, MODEL, evaluate(targets), 0.5, 'hyperscaler');
      const row = view.rows.find((entry) => entry.config.hardware === 'h200')!;
      expect(row).toMatchObject({ status: 'insufficient_data', exploratory: true });
      expect(view.qualifying).not.toContain(row);
      expect(row.bestObserved?.result?.observed?.attainment).toBeGreaterThan(0);
      for (const point of row.points) {
        expect(point.result?.qualification).toMatchObject({
          status: 'insufficient_data',
          reason: 'attempt_population_not_established',
          exploratory: true,
        });
      }
    }
  });

  it('lists a load the harness aborted as a service failure with its recorded reason', () => {
    const view = evaluateSlaTargetsView(configs, MODEL, evaluate(RELAXED), 0.99, 'hyperscaler');
    const row = rowOf(view, 'b200', 'Dynamo SGLang · FP4 · MTP · 16P+8D · KV offload');
    const failed = row.points.find((point) => point.excluded !== null);
    expect(failed).toMatchObject({ concurrency: 256, point: null, evaluation: null });
    expect(failed?.excluded).toMatchObject({
      category: 'service_failure',
      runAttempt: 1,
      observedFailures: { http_503: 139, http_500: 1, InvalidInferenceResultError: 95 },
    });
    expect(failed?.excluded?.reason).toContain('234/2337 profiling requests failed');
    expect(failed?.result?.qualification).toMatchObject({
      status: 'misses',
      reason: 'service_failure',
    });
    // The second attempt of the same run measured the same load.
    expect(row.points.find((point) => point.point !== null)?.concurrency).toBe(256);
  });

  it('flags a lower tested load that missed below the highest passing one', () => {
    const view = evaluateSlaTargetsView(
      configs,
      MODEL,
      evaluate({ ...RELAXED, maxTtftMs: 5000 }),
      0.99,
      'hyperscaler',
    );
    const row = rowOf(view, 'b300', 'SGLang · FP4 · MTP · 4 GPUs');
    expect(row.status).toBe('meets');
    expect(row.selections.highestPassingLoad?.concurrency).toBe(8);
    expect(row.points[0].result?.qualification.status).toBe('misses');
    expect(row.lowerLoadMissed).toBe(true);
  });

  it('holds a configuration as loading until every evaluation has arrived', () => {
    const ids = slaEvaluationIds(configs);
    const partial = evaluate(RELAXED, ids.slice(1));
    const view = evaluateSlaTargetsView(configs, MODEL, partial, 0.99, 'hyperscaler');
    const loading = view.rows.filter((row) => row.status === 'loading');
    expect(loading).toHaveLength(1);
    expect(loading[0].points.every((point) => point.result === null)).toBe(true);
    expect(view.qualifying).not.toContain(loading[0]);
  });

  it('changes cost with the price basis and nothing else', () => {
    const evaluations = evaluate(RELAXED);
    const owned = evaluateSlaTargetsView(configs, MODEL, evaluations, 0.99, 'hyperscaler');
    const rented = evaluateSlaTargetsView(configs, MODEL, evaluations, 0.99, 'rental');
    const key = owned.qualifying[0].config.key;
    const a = owned.rows.find((row) => row.config.key === key)!;
    const b = rented.rows.find((row) => row.config.key === key)!;
    expect(b.gpuHourUsd).not.toBe(a.gpuHourUsd);
    expect(b.selections.highestPassingLoad?.concurrency).toBe(
      a.selections.highestPassingLoad?.concurrency,
    );
    expect(b.selections.highestPassingLoad?.result?.observed).toEqual(
      a.selections.highestPassingLoad?.result?.observed,
    );
  });

  it('labels serving configurations in the requested locale', () => {
    const view = evaluateSlaTargetsView(configs, MODEL, {}, 0.99, 'hyperscaler', 'zh');
    expect(view.rows.some((row) => row.servingLabel.includes('8 张 GPU'))).toBe(true);
  });
});

describe('other models of the fixture', () => {
  it('keeps a point without an export as insufficient data, never as zero', () => {
    const kimi = dataset.models['Kimi-K3.1-Pro'];
    const view = evaluateSlaTargetsView(kimi, 'Kimi-K3.1-Pro', {}, 0.99, 'hyperscaler');
    const row = view.rows.find((entry) =>
      entry.config.points.some((point) => !point.hasRequestData),
    )!;
    expect(row.status).toBe('insufficient_data');
    expect(row.points[0].result).toMatchObject({
      observed: null,
      qualification: { status: 'insufficient_data', reason: 'no_request_level_data' },
    });
  });

  it('lists a failed job whose cause was not recorded as undetermined', () => {
    const kimi = dataset.models['Kimi-K3.1-Pro'];
    const excluded = kimi.flatMap((config) => config.excluded);
    expect(excluded).toEqual([
      expect.objectContaining({
        concurrency: 58,
        category: 'undetermined',
        reason: 'Slurm job 45616 ended with state=FAILED exit_code=1:0',
        runAttempt: 1,
      }),
    ]);
  });

  it('offers AgentX as the workload of every captured model', () => {
    for (const model of Object.keys(dataset.models)) {
      expect(slaWorkloads(dataset.models[model])).toEqual(['agentic-traces']);
    }
  });
});
