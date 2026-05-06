/**
 * Bulk DB insert for `eval_samples`.
 * Idempotent on (eval_result_id, doc_id) — re-running the same artifact is a no-op.
 */

import type postgres from 'postgres';
import type { EvalSampleParams } from './eval-samples-mapper';

type Sql = ReturnType<typeof postgres>;

/** Conservative chunk size — each row carries ~5 jsonb/text params, well under PG's 65k param ceiling. */
const CHUNK_SIZE = 500;

/**
 * Bulk-insert sample rows for a single eval_results row.
 *
 * Uses `unnest` over parallel arrays (same pattern as `bulkIngestBenchmarkRows`)
 * with `ON CONFLICT (eval_result_id, doc_id) DO NOTHING` so that re-runs are
 * cheap and metric/text drift doesn't silently overwrite the originally
 * ingested sample (we don't have a "winner" rule for duplicates).
 *
 * @returns Number of rows actually inserted (excludes conflicts).
 */
export async function bulkIngestEvalSamples(
  sql: Sql,
  evalResultId: number,
  samples: EvalSampleParams[],
): Promise<{ newCount: number }> {
  if (samples.length === 0) return { newCount: 0 };

  // Dedupe within the batch on doc_id to avoid ON CONFLICT collisions in one statement.
  const seen = new Map<number, EvalSampleParams>();
  for (const s of samples) seen.set(s.docId, s);
  const deduped = [...seen.values()];

  let newCount = 0;
  for (let i = 0; i < deduped.length; i += CHUNK_SIZE) {
    const chunk = deduped.slice(i, i + CHUNK_SIZE);

    const docIds = chunk.map((s) => s.docId);
    const prompts = chunk.map((s) => s.prompt);
    const targets = chunk.map((s) => s.target);
    const responses = chunk.map((s) => s.response);
    const passes = chunk.map((s) => s.passed);
    const scores = chunk.map((s) => s.score);
    const metricsJsons = chunk.map((s) => JSON.stringify(s.metrics));
    const dataJsons = chunk.map((s) => JSON.stringify(s.data));

    const result = await sql<{ inserted: boolean }[]>`
      insert into eval_samples (
        eval_result_id, doc_id, prompt, target, response, passed, score, metrics, data
      )
      select
        ${evalResultId},
        unnest(${sql.array(docIds)}::int[]),
        unnest(${sql.array(prompts)}::text[]),
        unnest(${sql.array(targets)}::text[]),
        unnest(${sql.array(responses)}::text[]),
        unnest(${sql.array(passes)}::bool[]),
        unnest(${sql.array(scores)}::numeric[]),
        unnest(${sql.array(metricsJsons)}::jsonb[]),
        unnest(${sql.array(dataJsons)}::jsonb[])
      on conflict (eval_result_id, doc_id) do nothing
      returning (xmax = 0) as inserted
    `;
    newCount += result.filter((r) => r.inserted).length;
  }

  return { newCount };
}
