import { describe, expect, it } from 'vitest';

import {
  BENCHMARK_POINT_BACKFILLS,
  CHANGELOG_BACKFILLS,
  CONCLUSION_OVERRIDES,
  PURGED_BENCHMARK_POINTS,
  PURGED_RUN_ATTEMPTS,
  PURGED_RUNS,
} from '../etl/run-overrides';
import { selectRunOverrides } from './run-override-selection';

describe('run override selection', () => {
  it('makes an unregistered ingest a no-op without touching historical rows', () => {
    expect(
      selectRunOverrides(['--run-id', '33721476500', '--allow-unregistered-run', '--yes']),
    ).toEqual({
      runId: 33721476500,
      conclusions: new Map(),
      changelogs: [],
      benchmarks: [],
      purgedRuns: new Set(),
      purgedAttempts: new Map(),
      purgedPoints: [],
    });
  });

  it('still selects registered corrections when allowing an unregistered run', () => {
    expect(selectRunOverrides(['--run-id', '33219708211', '--allow-unregistered-run'])).toEqual(
      selectRunOverrides(['--run-id', '33219708211']),
    );
    expect(() => selectRunOverrides(['--allow-unregistered-run'])).toThrow('requires --run-id');
  });

  it('keeps all registered operations when no run is selected', () => {
    expect(selectRunOverrides(['--yes'])).toEqual({
      runId: undefined,
      conclusions: CONCLUSION_OVERRIDES,
      changelogs: CHANGELOG_BACKFILLS,
      benchmarks: BENCHMARK_POINT_BACKFILLS,
      purgedRuns: PURGED_RUNS,
      purgedAttempts: PURGED_RUN_ATTEMPTS,
      purgedPoints: PURGED_BENCHMARK_POINTS,
    });
  });

  it('isolates the six Qwen refresh patches from unrelated backfills and purges', () => {
    const selected = selectRunOverrides(['--run-id', '33219708211', '-y', '--no-ssl']);
    expect(selected.runId).toBe(33219708211);
    expect(selected.benchmarks.map((entry) => entry.conc).toSorted((a, b) => a - b)).toEqual([
      7, 44, 52, 96, 565, 704,
    ]);
    expect(selected.benchmarks.every((entry) => entry.githubRunId === 33219708211)).toBe(true);
    expect(selected.conclusions.size).toBe(0);
    expect(selected.changelogs).toEqual([]);
    expect(selected.purgedRuns.size).toBe(0);
    expect(selected.purgedAttempts.size).toBe(0);
    expect(selected.purgedPoints).toEqual([]);
  });

  it('scopes every operation type to its selected run', () => {
    const ids = new Set([
      ...CONCLUSION_OVERRIDES.keys(),
      ...CHANGELOG_BACKFILLS.map((entry) => entry.githubRunId),
      ...BENCHMARK_POINT_BACKFILLS.map((entry) => entry.githubRunId),
      ...PURGED_RUNS,
      ...PURGED_RUN_ATTEMPTS.keys(),
      ...PURGED_BENCHMARK_POINTS.map((entry) => entry.githubRunId),
    ]);
    for (const id of ids) {
      const selected = selectRunOverrides([`--run-id=${id}`]);
      expect([...selected.conclusions]).toEqual(
        [...CONCLUSION_OVERRIDES].filter(([run]) => run === id),
      );
      expect(selected.changelogs).toEqual(
        CHANGELOG_BACKFILLS.filter((entry) => entry.githubRunId === id),
      );
      expect(selected.benchmarks).toEqual(
        BENCHMARK_POINT_BACKFILLS.filter((entry) => entry.githubRunId === id),
      );
      expect([...selected.purgedRuns]).toEqual([...PURGED_RUNS].filter((run) => run === id));
      expect([...selected.purgedAttempts]).toEqual(
        [...PURGED_RUN_ATTEMPTS].filter(([run]) => run === id),
      );
      expect(selected.purgedPoints).toEqual(
        PURGED_BENCHMARK_POINTS.filter((entry) => entry.githubRunId === id),
      );
    }
  });

  it.each(['', '0', '-1', '1.2', '1e3', '123abc', ' 123 ', '9007199254740992'])(
    'rejects invalid run ID %j before any database access',
    (value) => {
      expect(() => selectRunOverrides([`--run-id=${value}`])).toThrow('positive integer');
    },
  );

  it('rejects a missing value, unknown flags, and unregistered runs', () => {
    expect(() => selectRunOverrides(['--run-id'])).toThrow();
    expect(() => selectRunOverrides(['--runid', '33219708211'])).toThrow();
    expect(() => selectRunOverrides(['--run-id', '1'])).toThrow('No registered overrides');
  });
});
