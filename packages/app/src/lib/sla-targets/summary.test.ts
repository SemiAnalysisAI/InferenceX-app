import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { SlaLatencyTargets } from '@semianalysisai/inferencex-constants';
import { decodeSlaAttempts } from '@semianalysisai/inferencex-db/etl/sla-attempts';

import type { SlaAttemptsFixture, SlaTargetsFixture } from './dataset.server';
import { evaluateSlaAttemptsBlob, type SlaPointEvaluations } from './evaluation';
import { slaPageSummary, slaRowAnswer } from './summary';
import { evaluateSlaTargetsView, slaEvaluationIds } from './view';

/** The captured fixture: real AgentX results, the same data the page previews. */
const FIXTURES = resolve(import.meta.dirname, '../../../cypress/fixtures/api');
const dataset = JSON.parse(
  readFileSync(resolve(FIXTURES, 'sla-targets.json'), 'utf8'),
) as SlaTargetsFixture;
const attempts = JSON.parse(
  readFileSync(resolve(FIXTURES, 'sla-attempts.json'), 'utf8'),
) as SlaAttemptsFixture;

const MODEL = 'DeepSeek-V4-Pro';
const configs = dataset.models[MODEL];
const EXAMPLE: SlaLatencyTargets = { maxTtftMs: 1000, maxTpotMs: 50, maxE2eS: null };
const RELAXED: SlaLatencyTargets = { maxTtftMs: 10_000, maxTpotMs: 50, maxE2eS: null };

function view(targets: SlaLatencyTargets, required = 0.99, skip = 0) {
  const evaluations: SlaPointEvaluations = {};
  for (const id of slaEvaluationIds(configs).slice(skip)) {
    evaluations[id] = evaluateSlaAttemptsBlob(
      decodeSlaAttempts(Buffer.from(attempts[id], 'base64')),
      targets,
    );
  }
  return evaluateSlaTargetsView(configs, MODEL, evaluations, required, 'hyperscaler');
}

function answerOf(rows: ReturnType<typeof view>['rows'], serving: string) {
  const row = rows.find((entry) => entry.servingLabel === serving);
  if (!row) throw new Error(`no row ${serving}`);
  return { row, answer: slaRowAnswer(row) };
}

describe('slaRowAnswer', () => {
  it('gives a setup that meets the target its highest passing load, its share there and its cost', () => {
    const { row, answer } = answerOf(
      view(RELAXED).rows,
      'Dynamo SGLang · FP4 · MTP · 8P+8D · KV offload',
    );
    expect(answer.status).toBe('meets');
    expect(answer.maxLoad?.concurrency).toBe(32);
    // 4,497 of 4,537 attempts at 32 users.
    expect(answer.share?.fraction).toBeCloseTo(4497 / 4537, 12);
    expect(answer.share?.point).toBe(answer.maxLoad);
    expect(answer.costUsd).toBe(row.selections.lowestCost?.result?.costPer1kCompliantUsd);
    // The cost comes from the same load, so it is not named a second time.
    expect(answer.costAt).toBeNull();
    expect(answer.reason).toBeNull();
  });

  it('names the load behind the cost when it is not the highest passing load', () => {
    // At 90% with a 30 s first-token limit, 512 users still passes on B300 with KV offload,
    // while 384 users has more passing requests per second and so the lower cost.
    const { answer } = answerOf(
      view({ ...RELAXED, maxTtftMs: 30_000 }, 0.9).rows,
      'SGLang · FP4 · MTP · 8 GPUs · KV offload',
    );
    expect(answer.maxLoad?.concurrency).toBe(512);
    expect(answer.costAt?.concurrency).toBe(384);
    expect(answer.share?.point.concurrency).toBe(512);
  });

  it('gives a setup that misses its best measured share and no load or cost', () => {
    const { row, answer } = answerOf(
      view(EXAMPLE).rows,
      'Dynamo SGLang · FP4 · MTP · 8P+8D · KV offload',
    );
    expect(answer).toMatchObject({ status: 'misses', maxLoad: null, costUsd: null, costAt: null });
    expect(answer.share?.point).toBe(row.bestObserved);
    expect(answer.share?.fraction).toBeLessThan(0.99);
  });

  it('gives a setup without a verdict its reason and never a share, however good it looks', () => {
    // Every H200 attempt passes at these targets, but the run never recorded how many it sent.
    const { row, answer } = answerOf(
      view({ maxTtftMs: 3_600_000, maxTpotMs: 3_600_000, maxE2eS: null }, 0.5).rows,
      'Dynamo SGLang · FP8 · Draft model · 8 GPUs · KV offload',
    );
    expect(row.bestObserved?.result?.observed?.attainment).toBeGreaterThan(0.5);
    expect(answer).toEqual({
      status: 'insufficient_data',
      maxLoad: null,
      costUsd: null,
      costAt: null,
      share: null,
      reason: 'attempt_population_not_established',
    });
  });
});

describe('slaPageSummary', () => {
  it('counts the setups that meet the target and names the cheapest', () => {
    const evaluated = view(RELAXED);
    const summary = slaPageSummary(evaluated);
    expect(summary).toMatchObject({ kind: 'meets', total: 6, meeting: 3 });
    if (summary.kind !== 'meets') throw new Error('expected a meeting summary');
    expect(summary.cheapest?.row).toBe(evaluated.rows[0]);
    const costs = evaluated.qualifying.map(
      (row) => row.selections.lowestCost?.result?.costPer1kCompliantUsd ?? Number.NaN,
    );
    expect(summary.cheapest?.costUsd).toBe(Math.min(...costs));
  });

  it('names the closest setup when none meets the target, and never one without a verdict', () => {
    const evaluated = view(EXAMPLE);
    const summary = slaPageSummary(evaluated);
    expect(summary).toMatchObject({ kind: 'none', total: 6 });
    if (summary.kind !== 'none') throw new Error('expected no setup to meet');
    const misses = evaluated.rows.filter((row) => row.status === 'misses');
    const best = Math.max(
      ...misses.map((row) => row.bestObserved?.result?.observed?.attainment ?? -1),
    );
    expect(summary.closest?.share.fraction).toBe(best);
    expect(summary.closest?.row.status).toBe('misses');
  });

  it('says it is still evaluating until every setup has a verdict', () => {
    expect(slaPageSummary(view(RELAXED, 0.99, 1))).toEqual({ kind: 'loading', total: 6 });
  });
});
