export const DOWNSTREAM_ID_START = 1_000_000_000_000;

export const RESERVED_ID_TABLES = ['workflow_runs', 'benchmark_results', 'eval_results'] as const;

export function isPublicRowId(id: number): boolean {
  return id < DOWNSTREAM_ID_START;
}
