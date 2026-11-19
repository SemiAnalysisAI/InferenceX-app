import type { BenchmarkRow } from '@/lib/api/api';

export interface BenchmarkSeed {
  /** Server rows to use as the latest-benchmarks query data, when they cover the selection. */
  rows?: BenchmarkRow[];
  /** Query-key scope for the latest-benchmarks query. */
  scope?: string;
}

/**
 * Decide whether server-embedded rows can stand in for the latest benchmarks
 * query. Seeds cover one model and, optionally, one sequence. They live under
 * their own key so a partial seed never answers a query for data it lacks;
 * outside that coverage the chart reads the shared full-model key.
 */
export function resolveBenchmarkSeed({
  scope,
  seedRows,
  seedModel,
  seedSequence,
  selectedModel,
  selectedSequence,
}: {
  scope?: string;
  seedRows?: BenchmarkRow[];
  seedModel?: string;
  seedSequence?: string;
  selectedModel: string;
  selectedSequence: string;
}): BenchmarkSeed {
  if (!seedRows) return { scope };
  const covers =
    selectedModel === seedModel && (!seedSequence || selectedSequence === seedSequence);
  if (!covers) return {};
  return { rows: seedRows, scope: seedSequence ? `${scope}:${seedSequence}` : scope };
}
