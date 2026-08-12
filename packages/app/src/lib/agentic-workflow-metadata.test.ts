import { describe, expect, it } from 'vitest';

import { agenticWorkflowMetadataOnly } from './agentic-workflow-metadata';

describe('agenticWorkflowMetadataOnly', () => {
  it('preserves workflow metadata for agentic rows', () => {
    const [row] = agenticWorkflowMetadataOnly([
      {
        benchmark_type: 'agentic_traces',
        workflow_run_id: 42,
        run_started_at: '2026-08-12T10:00:00Z',
      },
    ]);
    expect(row.workflow_run_id).toBe(42);
    expect(row.run_started_at).toBe('2026-08-12T10:00:00Z');
  });

  it('preserves the prior fixed-sequence response shape', () => {
    const [row] = agenticWorkflowMetadataOnly([
      {
        benchmark_type: 'single_turn',
        workflow_run_id: 42,
        run_started_at: '2026-08-12T10:00:00Z',
      },
    ]);
    expect(row).toEqual({ benchmark_type: 'single_turn' });
    expect('workflow_run_id' in row).toBe(false);
    expect('run_started_at' in row).toBe(false);
  });
});
