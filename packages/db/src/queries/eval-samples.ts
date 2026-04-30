import type { DbClient } from '../connection.js';

export interface EvalSampleRow {
  doc_id: number;
  prompt: string | null;
  target: string | null;
  /** lm-eval `filtered_resps[0]` — the post-filter answer that was scored. */
  response: string | null;
  /**
   * lm-eval `resps[0][0]` — the full unfiltered model output.
   * Useful for failed samples where the filter strips/empties everything
   * (e.g. model emits "!!!!!!" or enters a repetition loop).
   */
  raw_response: string | null;
  /**
   * lm-eval `arguments` JSONB — the raw prompt payload sent to the model.
   * Shape varies by task: chat-format tasks emit
   *   `{ gen_args_0: { arg_0: ['<stringified [{role,content}, …]>'] } }`
   * while plain-completion tasks emit `[['<full prompt string>']]`.
   * The API route parses this into structured chat messages for the drawer
   * to render few-shot demonstrations; raw shape is kept for forward-compat.
   */
  arguments_data: unknown;
  passed: boolean | null;
  score: number | null;
  metrics: Record<string, number>;
}

export interface EvalSamplesResult {
  samples: EvalSampleRow[];
  total: number;
  passedTotal: number;
  failedTotal: number;
}

/**
 * Fetch a paginated slice of `eval_samples` for one `eval_results` row.
 *
 * Filters:
 * - `'passed'` → `passed = true`
 * - `'failed'` → `passed = false`
 * - `'all'`    → no `passed` filter (includes nulls)
 *
 * Always returns the full passed/failed counts for the result alongside the
 * filtered slice — the drawer needs them for the filter chip badges, and one
 * round-trip is cheaper than a second query.
 */
export async function getEvalSamples(
  sql: DbClient,
  evalResultId: number,
  filter: 'all' | 'passed' | 'failed',
  offset: number,
  limit: number,
): Promise<EvalSamplesResult> {
  const passedFilter =
    filter === 'passed'
      ? sql`and passed is true`
      : filter === 'failed'
        ? sql`and passed is false`
        : sql``;

  const samples = (await sql`
    select doc_id, prompt, target, response,
           data->'resps'->0->>0 as raw_response,
           data->'arguments' as arguments_data,
           passed, score, metrics
    from eval_samples
    where eval_result_id = ${evalResultId}
      ${passedFilter}
    order by doc_id
    limit ${limit} offset ${offset}
  `) as unknown as EvalSampleRow[];

  const [counts] = (await sql`
    select
      count(*)::int                                  as total_all,
      count(*) filter (where passed is true)::int    as passed_total,
      count(*) filter (where passed is false)::int   as failed_total
    from eval_samples
    where eval_result_id = ${evalResultId}
  `) as unknown as { total_all: number; passed_total: number; failed_total: number }[];

  const filteredTotal =
    filter === 'passed'
      ? counts.passed_total
      : filter === 'failed'
        ? counts.failed_total
        : counts.total_all;

  return {
    samples,
    total: filteredTotal,
    passedTotal: counts.passed_total,
    failedTotal: counts.failed_total,
  };
}
