import { describe, expect, it } from 'vitest';

import {
  getRequestedRunUrlParams,
  resolveEffectiveRunDate,
  resolveEffectiveRunId,
} from '@/components/GlobalFilterContext';
import type { RunInfo } from '@/components/inference/types';

function run(runId: string): RunInfo {
  return {
    runId,
    runDate: '2026-08-20',
    runUrl: `https://example.test/${runId}`,
    conclusion: 'success',
  };
}

describe('global filter requested and effective selectors', () => {
  it('keeps an explicit available date', () => {
    expect(
      resolveEffectiveRunDate('2026-08-19', ['2026-08-18', '2026-08-19', '2026-08-20'], true),
    ).toBe('2026-08-19');
  });

  it('uses latest for implicit or stale date intent', () => {
    const dates = ['2026-08-18', '2026-08-20'];
    expect(resolveEffectiveRunDate('', dates, false)).toBe('2026-08-20');
    expect(resolveEffectiveRunDate('2026-08-19', dates, true)).toBe('2026-08-20');
  });

  it('preserves a requested date while availability is unresolved or empty', () => {
    expect(resolveEffectiveRunDate('2026-08-19', [], true)).toBe('2026-08-19');
  });

  it('keeps a valid run ID and otherwise selects the newest available run', () => {
    const runs = { '100': run('100'), '102': run('102'), '101': run('101') };
    expect(resolveEffectiveRunId('101', runs)).toBe('101');
    expect(resolveEffectiveRunId('missing', runs)).toBe('102');
    expect(resolveEffectiveRunId('', runs)).toBe('102');
  });

  it('clears the effective run ID for a settled empty run map', () => {
    expect(resolveEffectiveRunId('101', {})).toBe('');
  });

  it('serializes requested run state instead of availability fallbacks', () => {
    const requestedDate = '2026-08-19';
    const requestedRunId = 'missing';
    const dates = ['2026-08-18', '2026-08-20'];
    const runs = { '100': run('100'), '102': run('102') };

    expect(resolveEffectiveRunDate(requestedDate, dates, true)).toBe('2026-08-20');
    expect(resolveEffectiveRunId(requestedRunId, runs)).toBe('102');
    expect(getRequestedRunUrlParams(requestedDate, requestedRunId)).toEqual({
      g_rundate: requestedDate,
      g_runid: requestedRunId,
    });
  });
});
