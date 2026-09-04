import { parseArgs } from 'node:util';

import {
  BENCHMARK_POINT_BACKFILLS,
  CHANGELOG_BACKFILLS,
  CONCLUSION_OVERRIDES,
  PURGED_BENCHMARK_POINTS,
  PURGED_RUN_ATTEMPTS,
  PURGED_RUNS,
} from '../etl/run-overrides.js';

export function selectRunOverrides(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      'run-id': { type: 'string' },
      'allow-unregistered-run': { type: 'boolean' },
      yes: { type: 'boolean', short: 'y' },
      'no-ssl': { type: 'boolean' },
    },
  });
  const value = values['run-id'];
  if (values['allow-unregistered-run'] && value === undefined) {
    throw new Error('--allow-unregistered-run requires --run-id');
  }
  if (value !== undefined && (!/^[1-9]\d*$/u.test(value) || !Number.isSafeInteger(Number(value)))) {
    throw new Error('--run-id must be a positive integer GitHub run ID');
  }
  const runId = value === undefined ? undefined : Number(value);
  const matches = (id: number) => runId === undefined || id === runId;
  const selection = {
    runId,
    conclusions: new Map([...CONCLUSION_OVERRIDES].filter(([id]) => matches(id))),
    changelogs: CHANGELOG_BACKFILLS.filter((entry) => matches(entry.githubRunId)),
    benchmarks: BENCHMARK_POINT_BACKFILLS.filter((entry) => matches(entry.githubRunId)),
    purgedRuns: new Set([...PURGED_RUNS].filter(matches)),
    purgedAttempts: new Map([...PURGED_RUN_ATTEMPTS].filter(([id]) => matches(id))),
    purgedPoints: PURGED_BENCHMARK_POINTS.filter((entry) => matches(entry.githubRunId)),
  };
  if (
    runId !== undefined &&
    !values['allow-unregistered-run'] &&
    selection.conclusions.size +
      selection.changelogs.length +
      selection.benchmarks.length +
      selection.purgedRuns.size +
      selection.purgedAttempts.size +
      selection.purgedPoints.length ===
      0
  ) {
    throw new Error(`No registered overrides for run ${runId}`);
  }
  return selection;
}
