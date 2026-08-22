import { describe, expect, it } from 'vitest';

import { workflowInfoQueryOptions } from '@/hooks/api/use-workflow-info';

describe('workflowInfoQueryOptions', () => {
  it('shares the canonical single-date key', () => {
    expect(workflowInfoQueryOptions('2026-08-20').queryKey).toEqual([
      'workflow-info',
      '2026-08-20',
    ]);
  });

  it('adds benchmark type only when the endpoint request is scoped by it', () => {
    expect(workflowInfoQueryOptions('2026-08-20', 'agentic_traces').queryKey).toEqual([
      'workflow-info',
      '2026-08-20',
      'agentic_traces',
    ]);
  });

  it('does not enable an empty date or override an explicit disabled query', () => {
    expect(workflowInfoQueryOptions('').enabled).toBe(false);
    expect(workflowInfoQueryOptions('2026-08-20', undefined, false).enabled).toBe(false);
  });
});
