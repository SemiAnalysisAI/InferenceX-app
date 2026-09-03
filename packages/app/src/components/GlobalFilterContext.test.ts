import { describe, expect, it } from 'vitest';

import {
  buildRunInfo,
  getRequestedRunUrlParams,
  latestRunId,
  resolveEffectiveRunDate,
  resolveEffectiveRunId,
} from '@/components/GlobalFilterContext';
import workflowFixture from '../../cypress/fixtures/api/workflow-info.json';
import type { WorkflowInfoResponse } from '@/lib/api';
import type { RunInfo } from '@/components/inference/types';

function run(runId: string, runDate = '2026-08-20T00:00:00Z'): RunInfo {
  return {
    runId,
    runDate,
    runUrl: `https://example.test/${runId}`,
    conclusion: 'success',
  };
}

describe('buildRunInfo', () => {
  it('matches the workflow fixture while preserving run and changelog order', () => {
    const fixture = workflowFixture as unknown as WorkflowInfoResponse;
    const result = buildRunInfo(fixture);

    expect(Object.keys(result)).toEqual(
      fixture.runs.map((fixtureRun) => String(fixtureRun.github_run_id)),
    );
    for (const fixtureRun of fixture.runs) {
      const runId = String(fixtureRun.github_run_id);
      const fixtureChangelogs = fixture.changelogs.filter(
        (changelog) => String(changelog.workflow_run_id) === runId,
      );
      expect(result[runId]).toEqual({
        runId,
        runDate: fixtureRun.created_at,
        runUrl: fixtureRun.html_url
          ? `${fixtureRun.html_url}/attempts/${fixtureRun.run_attempt}`
          : '',
        conclusion: fixtureRun.conclusion,
        changelog: {
          entries: fixtureChangelogs.map((changelog) => ({
            config_keys: changelog.config_keys,
            description: changelog.description,
            pr_link: changelog.pr_link,
            head_ref: changelog.head_ref,
            append_only: changelog.append_only,
          })),
        },
      });
    }
  });

  it('keeps changelog order and the empty-URL/no-changelog fallbacks', () => {
    const data = {
      runs: [
        {
          github_run_id: 7,
          name: 'run seven',
          conclusion: null,
          run_attempt: 2,
          html_url: null,
          created_at: '2026-08-20T00:00:00Z',
          date: '2026-08-20',
        },
        {
          github_run_id: 8,
          name: 'run eight',
          conclusion: 'success',
          run_attempt: 1,
          html_url: null,
          created_at: '2026-08-20T01:00:00Z',
          date: '2026-08-20',
        },
      ],
      changelogs: [
        {
          workflow_run_id: 7,
          date: '2026-08-20',
          base_ref: 'base',
          head_ref: 'first',
          config_keys: ['first-config'],
          description: 'first',
          pr_link: null,
        },
        {
          workflow_run_id: 7,
          date: '2026-08-20',
          base_ref: 'first',
          head_ref: 'second',
          config_keys: ['second-config'],
          description: 'second',
          pr_link: 'https://example.test/pull/2',
          append_only: true,
        },
      ],
      configs: [],
      runConfigs: [],
    } satisfies WorkflowInfoResponse;

    const result = buildRunInfo(data);
    expect(result['7']).toMatchObject({
      runUrl: '',
      changelog: {
        entries: [
          { description: 'first', head_ref: 'first' },
          { description: 'second', head_ref: 'second', append_only: true },
        ],
      },
    });
    expect(result['8']).toEqual({
      runId: '8',
      runDate: '2026-08-20T01:00:00Z',
      runUrl: '',
      conclusion: 'success',
    });
  });
});

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
    const runs = {
      '100': run('100', '2026-08-20T01:00:00Z'),
      '102': run('102', '2026-08-20T03:00:00Z'),
      '101': run('101', '2026-08-20T02:00:00Z'),
    };
    expect(resolveEffectiveRunId('101', runs)).toBe('101');
    expect(resolveEffectiveRunId('missing', runs)).toBe('102');
    expect(resolveEffectiveRunId('', runs)).toBe('102');
  });

  it('picks the newest run by start time, not by the greatest GitHub run id', () => {
    // Production 2026-09-01 DSV4: the largest id (…526958) was created at 17:10Z
    // while a smaller id (…433573) is the day's last sweep at 21:35Z. The old
    // max-id rule opened a fresh page on the older run ("Run 2/3").
    const runs = {
      '33145139961': run('33145139961', '2026-09-01T17:04:07Z'),
      '33447526958': run('33447526958', '2026-09-01T17:10:19Z'),
      '33418433573': run('33418433573', '2026-09-01T21:35:56Z'),
    };
    expect(latestRunId(runs)).toBe('33418433573');
    expect(resolveEffectiveRunId('', runs)).toBe('33418433573');
    expect(resolveEffectiveRunId('33447526958', runs)).toBe('33447526958');
  });

  it('falls back to API order (created_at ASC) when start times tie or are missing', () => {
    const tied = {
      '33447526958': run('33447526958', '2026-09-01T17:10:19Z'),
      '33418433573': run('33418433573', '2026-09-01T17:10:19Z'),
    };
    expect(latestRunId(tied)).toBe('33418433573');
    const missing = {
      '33447526958': run('33447526958', ''),
      '33418433573': run('33418433573', ''),
    };
    expect(latestRunId(missing)).toBe('33418433573');
    expect(latestRunId({})).toBe('');
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
