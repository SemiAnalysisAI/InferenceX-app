/** Database table names. */
export const TABLE_NAMES = {
  configs: 'configs',
  workflowRuns: 'workflow_runs',
  agenticTraceReplay: 'agentic_trace_replay',
  benchmarkResults: 'benchmark_results',
  serverLogs: 'server_logs',
  runStats: 'run_stats',
  evalResults: 'eval_results',
  evalSamples: 'eval_samples',
  changelogEntries: 'changelog_entries',
  availability: 'availability',
  datasets: 'datasets',
  datasetConversations: 'dataset_conversations',
  runDatasets: 'run_datasets',
  schemaMigrations: 'schema_migrations',
} as const;

/**
 * Data tables in FK-safe insertion order.
 * Parents before children — safe for dump, load, and (reversed) reset.
 *
 * FK edges enforced by this ordering (verified against migration 008_agentic.sql
 * and the live schema's pg_constraint):
 *   - benchmark_results.trace_replay_id → agentic_trace_replay(id)
 *       ⇒ agentic_trace_replay before benchmark_results
 *   - dataset_conversations.dataset_id → datasets(id)
 *       ⇒ datasets before dataset_conversations
 *   - run_datasets.workflow_run_id → workflow_runs(id)
 *       ⇒ workflow_runs before run_datasets (run_datasets.dataset_slug is a
 *         plain slug, NOT an FK to datasets, so it needs no ordering vs datasets)
 */
export const TABLE_INSERT_ORDER = [
  TABLE_NAMES.configs,
  TABLE_NAMES.serverLogs,
  TABLE_NAMES.workflowRuns,
  TABLE_NAMES.agenticTraceReplay,
  TABLE_NAMES.benchmarkResults,
  TABLE_NAMES.evalResults,
  TABLE_NAMES.evalSamples,
  TABLE_NAMES.runStats,
  TABLE_NAMES.changelogEntries,
  TABLE_NAMES.availability,
  TABLE_NAMES.datasets,
  TABLE_NAMES.datasetConversations,
  TABLE_NAMES.runDatasets,
] as const;
