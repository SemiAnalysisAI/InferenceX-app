/**
 * Backfill dataset summary stats and subagent-only ISL/OSL distributions from
 * the compact structures already stored in `dataset_conversations`.
 *
 * Usage:
 *   pnpm --filter @semianalysisai/inferencex-db db:backfill-dataset-stats --yes
 */

import { confirm, hasNoSslFlag, hasYesFlag } from './cli-utils';
import { createAdminSql } from './etl/db-utils';
import { logHistogram, summarizeValues } from './etl/weka-structure';
import { jsonbParam, runBackfillMain } from './lib/backfill-runner';

interface DatasetRow {
  id: string;
  slug: string;
  summary: Record<string, unknown>;
  chart_data: Record<string, unknown>;
}

interface ConversationRow {
  num_subagent_groups: number | string;
  request_count: number | string;
}

interface SubagentRequestRow {
  input_tokens: number | string;
  output_tokens: number | string;
}

const sql = createAdminSql({ noSsl: hasNoSslFlag(), max: 1, onnotice: () => {} });

async function main(): Promise<void> {
  const datasets = await sql<DatasetRow[]>`
    select id, slug, summary, chart_data
    from datasets
    order by slug
  `;
  if (datasets.length === 0) {
    console.log('No datasets found.');
    return;
  }

  console.log(`Backfill subagent dataset stats for ${datasets.length} dataset(s).`);
  if (!hasYesFlag() && !(await confirm('Continue? (y/N) '))) return;

  for (const dataset of datasets) {
    const conversations = await sql<ConversationRow[]>`
      select
        num_subagent_groups,
        (
          num_turns + coalesce((
            select sum(jsonb_array_length(node.value->'children'))
            from jsonb_array_elements(coalesce(dc.structure->'nodes', '[]'::jsonb)) node(value)
            where node.value->>'kind' = 'subagent'
          ), 0)
        ) as request_count
      from dataset_conversations dc
      where dataset_id = ${dataset.id}
    `;
    const requests = await sql<SubagentRequestRow[]>`
      select
        (child.value->>'in')::double precision as input_tokens,
        (child.value->>'out')::double precision as output_tokens
      from dataset_conversations dc
      cross join lateral jsonb_array_elements(coalesce(dc.structure->'nodes', '[]'::jsonb)) node(value)
      cross join lateral jsonb_array_elements(coalesce(node.value->'children', '[]'::jsonb)) child(value)
      where dc.dataset_id = ${dataset.id}
        and node.value->>'kind' = 'subagent'
    `;

    const subagentsPerTrace = conversations.map((row) => Number(row.num_subagent_groups));
    const requestsPerConversation = conversations.map((row) => Number(row.request_count));
    const inputTokens = requests.map((row) => Number(row.input_tokens));
    const outputTokens = requests.map((row) => Number(row.output_tokens));
    const subagentStats = summarizeValues(subagentsPerTrace);
    const requestStats = summarizeValues(requestsPerConversation);
    const summary = {
      ...dataset.summary,
      version: 3,
      meanSubagentsPerTrace: subagentStats.mean,
      medianSubagentsPerTrace: subagentStats.median,
      meanRequestsPerConversation: requestStats.mean,
      medianRequestsPerConversation: requestStats.median,
    };
    const chartData = {
      ...dataset.chart_data,
      version: 3,
      subagentInputTokensPerRequest: {
        bins: logHistogram(inputTokens),
        stats: summarizeValues(inputTokens),
      },
      subagentOutputTokensPerRequest: {
        bins: logHistogram(outputTokens),
        stats: summarizeValues(outputTokens),
      },
    };

    await sql`
      update datasets
      set summary = ${sql.json(summary)},
          chart_data = ${jsonbParam(sql, chartData)}
      where id = ${dataset.id}
    `;
    console.log(
      `  ${dataset.slug}: ${requests.length.toLocaleString()} inner requests, median ${subagentStats.median}, mean ${subagentStats.mean.toFixed(1)} subagents/trace`,
    );
  }
}

runBackfillMain('backfill-dataset-stats', sql, main);
