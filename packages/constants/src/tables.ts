/** Database table names. */
export const TABLE_NAMES = {
  configs: 'configs',
  workflowRuns: 'workflow_runs',
  benchmarkResults: 'benchmark_results',
  serverLogs: 'server_logs',
  runStats: 'run_stats',
  evalResults: 'eval_results',
  changelogEntries: 'changelog_entries',
  availability: 'availability',
  schemaMigrations: 'schema_migrations',
} as const;

/**
 * Data tables in FK-safe insertion order.
 * Parents before children — safe for dump, load, and (reversed) reset.
 */
export const TABLE_INSERT_ORDER = [
  TABLE_NAMES.configs,
  TABLE_NAMES.serverLogs,
  TABLE_NAMES.workflowRuns,
  TABLE_NAMES.benchmarkResults,
  TABLE_NAMES.evalResults,
  TABLE_NAMES.runStats,
  TABLE_NAMES.changelogEntries,
  TABLE_NAMES.availability,
] as const;
