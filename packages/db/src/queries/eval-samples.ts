import type { DbClient } from '../connection.js';

export interface EvalSampleRow {
  doc_id: number;
  prompt: string | null;
  target: string | null;
  response: string | null;
  raw_response: string | null;
  /**
   * lm-eval's serialized chat prompt (`arguments.gen_args_0.arg_0`, or its
   * first element when it is an array), when it is a string.
   */
  fewshot_source: string | null;
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

type EvalSamplesPageRow = {
  total_all: number;
  passed_total: number;
  failed_total: number;
} & (EvalSampleRow | { doc_id: null });

export async function getEvalSamples(
  sql: DbClient,
  evalResultId: number,
  filter: 'all' | 'passed' | 'failed',
  offset: number,
  limit: number,
): Promise<EvalSamplesResult> {
  const passedFilter =
    filter === 'passed'
      ? sql`and es.passed is true`
      : filter === 'failed'
        ? sql`and es.passed is false`
        : sql``;

  // One statement returns the page and the filter-chip counts. The counts row
  // is left-joined to the page so an empty page still carries them.
  // `jsonb_to_record` detoasts `data` once per row; separate `data->...`
  // expressions would each decompress the whole value.
  const rows = (await sql`
    with counts as (
      select
        count(*)::int                                  as total_all,
        count(*) filter (where passed is true)::int    as passed_total,
        count(*) filter (where passed is false)::int   as failed_total
      from eval_samples
      where eval_result_id = ${evalResultId}
    )
    select counts.total_all, counts.passed_total, counts.failed_total, page.*
    from counts
    left join lateral (
      select es.doc_id, es.prompt, es.target, es.response,
             d.resps->0->>0 as raw_response,
             case jsonb_typeof(d.arguments->'gen_args_0'->'arg_0')
               when 'string' then d.arguments->'gen_args_0'->>'arg_0'
               when 'array' then case
                 when jsonb_typeof(d.arguments->'gen_args_0'->'arg_0'->0) = 'string'
                   then d.arguments->'gen_args_0'->'arg_0'->>0
               end
             end as fewshot_source,
             es.passed, es.score, es.metrics
      from eval_samples es
      left join lateral jsonb_to_record(es.data) as d(resps jsonb, arguments jsonb) on true
      where es.eval_result_id = ${evalResultId}
        ${passedFilter}
      order by es.doc_id
      limit ${limit} offset ${offset}
    ) page on true
    order by page.doc_id
  `) as unknown as EvalSamplesPageRow[];

  const counts = rows[0]!;
  const samples: EvalSampleRow[] = [];
  for (const row of rows) {
    if (row.doc_id !== null) samples.push(row);
  }

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

export async function getEvalSampleOffset(
  sql: DbClient,
  evalResultId: number,
  docId: number,
): Promise<number | null> {
  const [row] = (await sql`
    select
      count(*) filter (where doc_id < ${docId})::int as offset,
      count(*) filter (where doc_id = ${docId})::int as matches
    from eval_samples
    where eval_result_id = ${evalResultId}
  `) as unknown as { offset: number; matches: number }[];

  return row?.matches === 1 ? row.offset : null;
}
