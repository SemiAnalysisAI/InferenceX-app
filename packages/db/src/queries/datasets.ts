/**
 * Read queries for the agentic-benchmark source datasets (the HF cc-traces-weka
 * corpora ingested by ingest-weka-dataset.ts). Back the /datasets area:
 *   - listDatasets      → registry cards (no per-conversation rows)
 *   - getDataset        → one dataset incl. precomputed chart_data
 *   - listConversations → paginated conversation list (counts only, no structure)
 *   - getConversation   → one conversation's flamegraph structure
 */

import type { DbClient } from '../connection.js';
import type { ConversationStructure } from '../etl/weka-structure.js';

export interface DatasetSummary {
  blockSize?: number;
  hashIdScope?: string | null;
  totalIn?: number;
  totalOut?: number;
  totalCached?: number;
  cachedPct?: number;
  mainTurns?: number;
  subagentGroups?: number;
  subagentTurns?: number;
  meanRequestsPerConversation?: number;
  medianRequestsPerConversation?: number;
  meanSubagentsPerTrace?: number;
  medianSubagentsPerTrace?: number;
  modelMix?: Record<string, number>;
  [k: string]: unknown;
}

export interface DatasetRecord {
  id: string;
  slug: string;
  label: string;
  variant: string;
  description: string | null;
  hf_url: string | null;
  license: string | null;
  conversation_count: number;
  summary: DatasetSummary;
  ingested_at: string;
}

export interface DatasetDetail extends DatasetRecord {
  /** Precomputed distribution bins + stats keyed by metric (see ingest buildChartData). */
  chart_data: Record<string, unknown>;
}

export interface ConversationListItem {
  conv_id: string;
  models: string[];
  num_turns: number;
  num_subagent_groups: number;
  total_in: number;
  total_out: number;
  total_cached: number;
}

export interface ConversationList {
  total: number;
  items: ConversationListItem[];
}

export interface ConversationDetail {
  conv_id: string;
  models: string[];
  num_turns: number;
  num_subagent_groups: number;
  total_in: number;
  total_out: number;
  total_cached: number;
  structure: ConversationStructure;
}

/** All ingested datasets, newest first. Excludes the (large) chart_data blob. */
export async function listDatasets(sql: DbClient): Promise<DatasetRecord[]> {
  const rows = (await sql`
    select id, slug, label, variant, description, hf_url, license,
           conversation_count, summary, ingested_at::text
    from datasets
    order by ingested_at desc, slug asc
  `) as unknown as DatasetRecord[];
  return rows.map((r) => ({ ...r, conversation_count: Number(r.conversation_count) }));
}

/** One dataset by slug, including chart_data. Null if not found. */
export async function getDataset(sql: DbClient, slug: string): Promise<DatasetDetail | null> {
  const rows = (await sql`
    select id, slug, label, variant, description, hf_url, license,
           conversation_count, summary, chart_data, ingested_at::text
    from datasets
    where slug = ${slug}
  `) as unknown as DatasetDetail[];
  const row = rows[0];
  if (!row) return null;
  return { ...row, conversation_count: Number(row.conversation_count) };
}

export interface ListConversationsOpts {
  search?: string;
  limit?: number;
  offset?: number;
  /** 'tokens' (total_in desc), 'turns' (num_turns desc), or 'id' (conv_id asc). */
  sort?: 'tokens' | 'turns' | 'subagents' | 'id';
}

const MAX_LIMIT = 200;

/**
 * Escape Postgres LIKE metacharacters in a user-supplied search string so that
 * the pattern performs a literal substring match, not a wildcard match.
 *
 * Postgres LIKE special characters are: % (any sequence), _ (any single char),
 * and \ (the default escape character). We escape \ first so our own escape
 * sequences are not double-escaped, then % and _.
 *
 * postgres.js parameterization already prevents SQL injection; this escaping
 * fixes wildcard-semantics only (e.g. searching for literal '%' must not match
 * every row).
 *
 * @example escapeLikePattern('50%_off') === '50\\%\\_off'
 */
export function escapeLikePattern(raw: string): string {
  return raw
    .replaceAll('\\', String.raw`\\`)
    .replaceAll('%', String.raw`\%`)
    .replaceAll('_', String.raw`\_`);
}

/**
 * Paginated conversation list for a dataset (by slug). Returns counts only —
 * the per-conversation `structure` blob is fetched separately by
 * getConversation so the list stays light.
 */
export async function listConversations(
  sql: DbClient,
  slug: string,
  opts: ListConversationsOpts = {},
): Promise<ConversationList | null> {
  const ds = (await sql`select id from datasets where slug = ${slug}`) as unknown as {
    id: string;
  }[];
  const datasetId = ds[0]?.id;
  if (!datasetId) return null;

  const limit = Math.min(MAX_LIMIT, Math.max(1, opts.limit ?? 50));
  const offset = Math.max(0, opts.offset ?? 0);
  const search = opts.search?.trim();
  // Escape LIKE metacharacters so user input is treated as a literal substring.
  // Backslash is escaped first to prevent double-escaping our own escape sequences.
  const like = search ? `%${escapeLikePattern(search)}%` : null;

  const totalRows = (await sql`
    select count(*)::int as n
    from dataset_conversations
    where dataset_id = ${datasetId}
      and (${like}::text is null or conv_id ilike ${like})
  `) as unknown as { n: number }[];
  const total = totalRows[0]?.n ?? 0;

  // Separate queries per sort (literal ORDER BY) — the neon HTTP driver doesn't
  // compose nested sql fragments the way postgres.js does, so we can't splice an
  // order-by fragment. The sort key is an enum, never raw user input.
  const sort = opts.sort ?? 'tokens';
  let items: ConversationListItem[];
  if (sort === 'turns') {
    items = (await sql`
      select conv_id, models, num_turns, num_subagent_groups, total_in, total_out, total_cached
      from dataset_conversations
      where dataset_id = ${datasetId} and (${like}::text is null or conv_id ilike ${like})
      order by num_turns desc, conv_id asc
      limit ${limit} offset ${offset}
    `) as unknown as ConversationListItem[];
  } else if (sort === 'subagents') {
    items = (await sql`
      select conv_id, models, num_turns, num_subagent_groups, total_in, total_out, total_cached
      from dataset_conversations
      where dataset_id = ${datasetId} and (${like}::text is null or conv_id ilike ${like})
      order by num_subagent_groups desc, conv_id asc
      limit ${limit} offset ${offset}
    `) as unknown as ConversationListItem[];
  } else if (sort === 'id') {
    items = (await sql`
      select conv_id, models, num_turns, num_subagent_groups, total_in, total_out, total_cached
      from dataset_conversations
      where dataset_id = ${datasetId} and (${like}::text is null or conv_id ilike ${like})
      order by conv_id asc
      limit ${limit} offset ${offset}
    `) as unknown as ConversationListItem[];
  } else {
    items = (await sql`
      select conv_id, models, num_turns, num_subagent_groups, total_in, total_out, total_cached
      from dataset_conversations
      where dataset_id = ${datasetId} and (${like}::text is null or conv_id ilike ${like})
      order by total_in desc, conv_id asc
      limit ${limit} offset ${offset}
    `) as unknown as ConversationListItem[];
  }

  return {
    total,
    items: items.map((r) => ({
      ...r,
      num_turns: Number(r.num_turns),
      num_subagent_groups: Number(r.num_subagent_groups),
      total_in: Number(r.total_in),
      total_out: Number(r.total_out),
      total_cached: Number(r.total_cached),
    })),
  };
}

/** One conversation's full flamegraph structure. Null if dataset/conv missing. */
export async function getConversation(
  sql: DbClient,
  slug: string,
  convId: string,
): Promise<ConversationDetail | null> {
  const rows = (await sql`
    select dc.conv_id, dc.models, dc.num_turns, dc.num_subagent_groups,
           dc.total_in, dc.total_out, dc.total_cached, dc.structure
    from dataset_conversations dc
    join datasets d on d.id = dc.dataset_id
    where d.slug = ${slug} and dc.conv_id = ${convId}
  `) as unknown as ConversationDetail[];
  const row = rows[0];
  if (!row) return null;
  return {
    ...row,
    num_turns: Number(row.num_turns),
    num_subagent_groups: Number(row.num_subagent_groups),
    total_in: Number(row.total_in),
    total_out: Number(row.total_out),
    total_cached: Number(row.total_cached),
  };
}
