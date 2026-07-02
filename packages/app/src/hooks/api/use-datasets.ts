import { useQuery, keepPreviousData } from '@tanstack/react-query';

import type {
  ConversationStructure,
  StructureNode,
} from '@semianalysisai/inferencex-db/etl/weka-structure';

export type { ConversationStructure, StructureNode };

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

export interface HistogramBin {
  x0: number;
  x1: number;
  count: number;
}

export interface DistributionStats {
  count: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  /** Added in chart_data v2. */
  p75?: number;
  p90: number;
  /** Added in chart_data v2. */
  p95?: number;
}

export interface Distribution {
  bins: HistogramBin[];
  stats: DistributionStats;
}

export interface DatasetChartData {
  version?: number;
  inputTokensPerTurn?: Distribution;
  uncachedInputTokensPerTurn?: Distribution;
  outputTokensPerTurn?: Distribution;
  subagentInputTokensPerRequest?: Distribution;
  subagentOutputTokensPerRequest?: Distribution;
  turnsPerConversation?: Distribution;
  subagentGroupsPerConversation?: Distribution;
  cachedFractionPerTurn?: Distribution;
  [k: string]: unknown;
}

export interface DatasetDetail extends DatasetRecord {
  chart_data: DatasetChartData;
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

export type ConversationSort = 'tokens' | 'turns' | 'subagents' | 'id';

// Dataset contents only change on (rare) re-ingest, so cache aggressively.
const DAY = 24 * 60 * 60 * 1000;

/** Shared fetch for the per-dataset endpoints: 404 → null, other errors throw. */
async function fetchJsonOr404<T>(
  url: string,
  label: string,
  signal: AbortSignal,
): Promise<T | null> {
  const res = await fetch(url, { signal });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${label} ${res.status}`);
  return (await res.json()) as T;
}

/** All ingested datasets (registry cards). */
export function useDatasets() {
  return useQuery({
    queryKey: ['datasets'] as const,
    queryFn: async ({ signal }) => {
      const res = await fetch('/api/v1/datasets', { signal });
      if (!res.ok) throw new Error(`datasets ${res.status}`);
      return (await res.json()) as DatasetRecord[];
    },
    staleTime: DAY,
  });
}

/** One dataset incl. chart_data. */
export function useDataset(slug: string | null) {
  return useQuery({
    queryKey: ['dataset', slug] as const,
    queryFn: ({ signal }) =>
      fetchJsonOr404<DatasetDetail>(`/api/v1/datasets/${slug}`, 'dataset', signal),
    enabled: Boolean(slug),
    staleTime: DAY,
  });
}

export interface UseConversationsArgs {
  slug: string | null;
  search?: string;
  limit?: number;
  offset?: number;
  sort?: ConversationSort;
}

/** Paginated conversation list for a dataset (counts only). */
export function useDatasetConversations({
  slug,
  search = '',
  limit = 50,
  offset = 0,
  sort = 'tokens',
}: UseConversationsArgs) {
  return useQuery({
    queryKey: ['dataset-conversations', slug, search, limit, offset, sort] as const,
    queryFn: ({ signal }) => {
      const qs = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
        sort,
      });
      if (search) qs.set('search', search);
      return fetchJsonOr404<ConversationList>(
        `/api/v1/datasets/${slug}/conversations?${qs.toString()}`,
        'dataset-conversations',
        signal,
      );
    },
    enabled: Boolean(slug),
    placeholderData: keepPreviousData,
    staleTime: DAY,
  });
}

/** One conversation's flamegraph structure. */
export function useDatasetConversation(slug: string | null, convId: string | null) {
  return useQuery({
    queryKey: ['dataset-conversation', slug, convId] as const,
    queryFn: ({ signal }) =>
      fetchJsonOr404<ConversationDetail>(
        `/api/v1/datasets/${slug}/conversations/${encodeURIComponent(convId ?? '')}`,
        'dataset-conversation',
        signal,
      ),
    enabled: Boolean(slug) && Boolean(convId),
    staleTime: DAY,
  });
}
