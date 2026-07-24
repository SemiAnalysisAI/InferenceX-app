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
