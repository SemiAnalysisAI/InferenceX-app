interface WorkflowMetadataRow {
  benchmark_type: string;
  workflow_run_id?: number;
  run_started_at?: string | null;
}

/** Keep workflow identity internal to agentic rows; fixed API rows retain their prior shape. */
export function agenticWorkflowMetadataOnly<T extends WorkflowMetadataRow>(rows: T[]): T[] {
  return rows.map((row) => {
    if (row.benchmark_type === 'agentic_traces') return row;
    const { workflow_run_id: _workflowRunId, run_started_at: _runStartedAt, ...fixedRow } = row;
    return fixedRow as T;
  });
}
