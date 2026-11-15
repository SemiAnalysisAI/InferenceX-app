import {
  DISPLAY_MODEL_TO_DB,
  SLA_ACCOUNTING_POLICY,
  SLA_EVALUATOR_VERSION,
  slaAccountingPolicyKey,
  type SlaLatencyTargets,
} from '@semianalysisai/inferencex-constants';
import { FIXTURES_MODE } from '@semianalysisai/inferencex-db/connection';
import {
  SLA_ATTEMPTS_VERSION,
  decodeSlaAttempts,
} from '@semianalysisai/inferencex-db/etl/sla-attempts';
import {
  getPayloadDb,
  readEachDb,
  readRecordFromPayloadDbs,
} from '@semianalysisai/inferencex-db/lib/payload-db';
import {
  getSlaAttempts,
  getSlaAttemptsSources,
  getSlaRunProvenance,
  type SlaAttemptsSource,
} from '@semianalysisai/inferencex-db/queries/sla-targets';

import { IdBitset } from '@/lib/benchmarks/benchmark-presence';
import { getCachedBenchmarkPresence } from '@/lib/benchmarks/benchmark-presence.server';
import { getCachedBenchmarks } from '@/lib/benchmarks/benchmark-query-cache.server';
import { runIdFromRunUrl } from '@/lib/benchmarks/known-issues';
import { cachedQuery } from '@/lib/cache/api-cache';
import { MODEL_OPTIONS } from '@/lib/catalog/data-mappings';
import { loadFixture } from '@/lib/testing/test-fixtures';

import {
  buildSlaConfigs,
  type SlaCapturedRun,
  type SlaRunProvenance,
  type SlaTargetsConfig,
  type SlaTargetsDataset,
} from './dataset';
import {
  evaluateSlaAttemptsBlob,
  type SlaPointEvaluationResult,
  type SlaPointEvaluations,
} from './evaluation';

/** Captured benchmark results served when the app runs without a database. */
export interface SlaTargetsFixture {
  capturedAt: string;
  source: string;
  attemptsVersion: number;
  runs: SlaCapturedRun[];
  models: Record<string, SlaTargetsConfig[]>;
}

/** Captured attempt data by snapshot-local point id: base64 of the encoded blob. */
export type SlaAttemptsFixture = Record<number, string>;

export const SLA_TARGETS_FIXTURE = 'sla-targets';
export const SLA_ATTEMPTS_FIXTURE = 'sla-attempts';

/** Points evaluated per request to the evaluations route. */
export const SLA_EVALUATION_MAX_IDS = 64;
const EVALUATION_CONCURRENCY = 4;

const NO_DATA: SlaPointEvaluationResult = { unavailable: 'no_request_level_data' };

function fixtureDataset(requestedModel: string | null): SlaTargetsDataset {
  const fixture = loadFixture<SlaTargetsFixture>(SLA_TARGETS_FIXTURE);
  const models = Object.keys(fixture.models);
  const model =
    requestedModel !== null && models.includes(requestedModel) ? requestedModel : models[0];
  const configs = fixture.models[model] ?? [];
  const runIds = new Set(configs.map((config) => config.runId));
  return {
    model,
    models,
    snapshot: {
      kind: 'captured',
      capturedAt: fixture.capturedAt,
      source: fixture.source,
      attemptsVersion: fixture.attemptsVersion,
      runs: fixture.runs.filter((run) => runIds.has(run.runId)),
    },
    configs,
  };
}

async function loadRunProvenance(runIds: string[]): Promise<Record<string, SlaRunProvenance>> {
  const provenance: Record<string, SlaRunProvenance> = {};
  for (const rows of await readEachDb((sql) => getSlaRunProvenance(sql, runIds))) {
    for (const row of rows) {
      provenance[row.github_run_id] ??= {
        benchmarkCommit: row.head_sha,
        datasetSlug: row.dataset_slug,
      };
    }
  }
  return provenance;
}

const getCachedLiveConfigs = cachedQuery(async (model: string): Promise<SlaTargetsConfig[]> => {
  const rows = await getCachedBenchmarks(DISPLAY_MODEL_TO_DB[model] ?? []);
  const runIds = [...new Set(rows.flatMap((row) => runIdFromRunUrl(row.run_url) ?? []))].toSorted();
  const [presence, provenance] = await Promise.all([
    getCachedBenchmarkPresence(),
    loadRunProvenance(runIds),
  ]);
  const traces = new IdBitset(presence.trace);
  return buildSlaConfigs(
    rows,
    (id) => traces.has(id),
    (runId) => (runId === null ? undefined : provenance[runId]),
  );
}, 'sla-targets-configs-v2');

/**
 * Serving configurations of one model with their tested load points. An
 * unknown or missing model resolves to the first one the dataset offers.
 *
 * The database keeps no record of load points that failed, so live
 * configurations list none; a captured snapshot lists the ones its runs record.
 */
export async function getSlaTargetsDataset(
  requestedModel: string | null,
): Promise<SlaTargetsDataset> {
  if (FIXTURES_MODE) return fixtureDataset(requestedModel);
  const models: string[] = MODEL_OPTIONS.filter((model) => DISPLAY_MODEL_TO_DB[model]);
  const model =
    requestedModel !== null && models.includes(requestedModel) ? requestedModel : models[0];
  return {
    model,
    models,
    snapshot: { kind: 'live' },
    configs: await getCachedLiveConfigs(model),
  };
}

/**
 * One point evaluated against one set of latency targets. Every argument is
 * part of the cache key: the point, the content identity of its attempt data,
 * the evaluator and extraction versions, the accounting policy, and the three
 * target values as entered.
 */
const getCachedPointEvaluation = cachedQuery(
  async (
    id: number,
    kind: SlaAttemptsSource['kind'],
    _identity: string,
    _evaluatorVersion: number,
    _attemptsVersion: number,
    _policyKey: string,
    maxTtftMs: number,
    maxTpotMs: number,
    maxE2eS: number | null,
  ): Promise<SlaPointEvaluationResult> => {
    const blob = await getSlaAttempts(await getPayloadDb(id), id, kind);
    return blob ? evaluateSlaAttemptsBlob(blob, { maxTtftMs, maxTpotMs, maxE2eS }) : NO_DATA;
  },
  'sla-point-evaluation-v1',
);

/**
 * Evaluate benchmark points against latency targets, exactly, on the server.
 * Returns counts and accounting per point, never attempt records. A point
 * without request-level data maps to `{ unavailable }`, never to zeros.
 *
 * A point whose attempt data has not been built from its original export yet
 * is evaluated from the derived request timeline. That data has no explicit
 * outcomes and no issued-request count, so its accounting says so and the
 * point can only be shown as exploratory.
 */
export async function getSlaPointEvaluations(
  ids: readonly number[],
  targets: SlaLatencyTargets,
): Promise<SlaPointEvaluations> {
  if (FIXTURES_MODE) {
    const fixture = loadFixture<SlaAttemptsFixture>(SLA_ATTEMPTS_FIXTURE);
    return Object.fromEntries(
      ids.map((id) => {
        const encoded = fixture[id];
        return [
          id,
          encoded
            ? evaluateSlaAttemptsBlob(decodeSlaAttempts(Buffer.from(encoded, 'base64')), targets)
            : NO_DATA,
        ];
      }),
    );
  }

  const sources = await readRecordFromPayloadDbs(ids, getSlaAttemptsSources);
  const policyKey = slaAccountingPolicyKey(SLA_ACCOUNTING_POLICY);
  const evaluations: SlaPointEvaluations = {};
  const queue = [...ids];
  await Promise.all(
    Array.from({ length: Math.min(EVALUATION_CONCURRENCY, queue.length) }, async () => {
      for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
        const source = sources[id];
        evaluations[id] =
          source === undefined || source.kind === 'none'
            ? NO_DATA
            : await getCachedPointEvaluation(
                id,
                source.kind,
                source.identity,
                SLA_EVALUATOR_VERSION,
                SLA_ATTEMPTS_VERSION,
                policyKey,
                targets.maxTtftMs,
                targets.maxTpotMs,
                targets.maxE2eS,
              );
      }
    }),
  );
  return evaluations;
}
