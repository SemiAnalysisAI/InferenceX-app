import { describe, expect, it } from 'vitest';

import { getAdjacentRunId, getLatestRunId, workflowRunCountLabel } from './WorkflowInfoDisplay';

describe('workflow run count label', () => {
  it('preserves the English label and uses natural Chinese counting syntax', () => {
    expect(workflowRunCountLabel(2, 5, 'en')).toBe('Run 2/5');
    expect(workflowRunCountLabel(2, 5, 'zh')).toBe('第 2 次运行（共 5 次）');
  });
});

describe('run navigation helpers', () => {
  const runIds = ['100', '200', '300'];

  it('steps to the adjacent run in each direction', () => {
    expect(getAdjacentRunId(runIds, '200', 'previous')).toBe('100');
    expect(getAdjacentRunId(runIds, '200', 'next')).toBe('300');
  });

  it('returns undefined at the ends of the run list', () => {
    expect(getAdjacentRunId(runIds, '100', 'previous')).toBeUndefined();
    expect(getAdjacentRunId(runIds, '300', 'next')).toBeUndefined();
  });

  it('returns undefined when the selected run is unknown or the list is empty', () => {
    expect(getAdjacentRunId(runIds, '999', 'next')).toBeUndefined();
    expect(getAdjacentRunId([], '100', 'previous')).toBeUndefined();
  });

  it('treats the last run id as the latest run', () => {
    expect(getLatestRunId(runIds)).toBe('300');
    expect(getLatestRunId([])).toBeUndefined();
  });
});
