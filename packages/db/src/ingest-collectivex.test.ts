import { afterEach, describe, expect, it, vi } from 'vitest';

import type * as CommittedResults from './collectivex/committed-results';
import { CommittedResultsError } from './collectivex/committed-results';

const mocks = vi.hoisted(() => ({
  loadCommittedRun: vi.fn(),
  upsert: vi.fn(),
}));
vi.mock('./collectivex/committed-results', async (importOriginal) => ({
  ...(await importOriginal<typeof CommittedResults>()),
  loadCommittedRun: mocks.loadCommittedRun,
}));
vi.mock('./queries/collectivex', () => ({
  upsertCollectiveXRun: mocks.upsert,
  pruneCollectiveXRuns: vi.fn(),
  deleteCollectiveXRun: vi.fn(),
}));

import { ingestCommits, parseIngestArgs } from './ingest-collectivex';
import type { Sql } from './etl/db-utils';

const sql = (() => Promise.resolve([])) as unknown as Sql;

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('parseIngestArgs', () => {
  it('defaults to main', () => {
    expect(parseIngestArgs([])).toEqual({ mode: 'commit', ref: 'main' });
  });

  it('takes one commit from --sha or --ref', () => {
    expect(parseIngestArgs(['--sha', 'a'.repeat(40)])).toEqual({
      mode: 'commit',
      ref: 'a'.repeat(40),
    });
    expect(parseIngestArgs(['--ref', 'v1.2', '--yes'])).toEqual({ mode: 'commit', ref: 'v1.2' });
  });

  it('walks main for --backfill, optionally pruning', () => {
    expect(parseIngestArgs(['--backfill', '-y', '--no-ssl'])).toEqual({
      mode: 'backfill',
      prune: false,
    });
    expect(parseIngestArgs(['--backfill', '--prune'])).toEqual({ mode: 'backfill', prune: true });
  });

  it('deletes one named run', () => {
    expect(parseIngestArgs(['--delete-run', '1792039236'])).toEqual({
      mode: 'delete',
      runId: '1792039236',
    });
  });

  it('rejects conflicting, malformed, and unknown arguments', () => {
    expect(() => parseIngestArgs(['--sha', 'a'.repeat(40), '--ref', 'main'])).toThrow(
      /mutually exclusive/u,
    );
    expect(() => parseIngestArgs(['--backfill', '--ref', 'main'])).toThrow(/--backfill/u);
    expect(() => parseIngestArgs(['--prune'])).toThrow(/--prune needs --backfill/u);
    expect(() => parseIngestArgs(['--delete-run', '5', '--backfill'])).toThrow(/--delete-run/u);
    expect(() => parseIngestArgs(['--delete-run', '37459990486'])).toThrow(/Invalid run id/u);
    expect(() => parseIngestArgs(['--delete-run', '0'])).toThrow(/Invalid run id/u);
    expect(() => parseIngestArgs(['--sha', 'not-a-sha'])).toThrow(/Invalid commit sha/u);
    expect(() => parseIngestArgs(['12345'])).toThrow();
  });
});

function runFor(sha: string, measured = 1) {
  return {
    run: { run_id: sha.slice(0, 3), summary: { measured_cases: measured, requested_cases: 2 } },
    docs: measured > 0 ? [{}] : [],
  };
}

describe('ingestCommits', () => {
  const commits = [
    { sha: 'a'.repeat(40), committedAt: '2026-10-15T00:00:00Z', runId: '1760486400' },
    { sha: 'b'.repeat(40), committedAt: '2026-10-16T00:00:00Z', runId: '1760572800' },
    { sha: 'c'.repeat(40), committedAt: '2026-10-17T00:00:00Z', runId: '1760659200' },
  ];

  it('stores commits in order and shares one blob cache across them', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    mocks.loadCommittedRun.mockImplementation((commit: { sha: string }) =>
      Promise.resolve(runFor(commit.sha)),
    );
    mocks.upsert.mockResolvedValue('inserted');

    const outcome = await ingestCommits(sql, commits, 'token');

    expect(mocks.loadCommittedRun.mock.calls.map(([commit]) => commit.sha)).toEqual(
      commits.map((commit) => commit.sha),
    );
    const [first, second] = mocks.loadCommittedRun.mock.calls.map(([, options]) => options);
    expect(first.token).toBe('token');
    expect(first.blobCache).toBe(second.blobCache);
    expect(mocks.upsert).toHaveBeenCalledTimes(3);
    expect(outcome).toEqual({ stored: commits, skipped: [] });
  });

  it('skips a commit with nothing measured instead of storing an empty run', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    mocks.loadCommittedRun.mockImplementation((commit: { sha: string }) =>
      Promise.resolve(runFor(commit.sha, commit.sha === commits[1].sha ? 0 : 1)),
    );
    mocks.upsert.mockResolvedValue('inserted');

    const outcome = await ingestCommits(sql, commits, undefined);

    expect(mocks.upsert).toHaveBeenCalledTimes(2);
    expect(outcome.skipped).toEqual([commits[1]]);
    expect(outcome.stored).toEqual([commits[0], commits[2]]);
  });

  it('skips commits GitHub answers 404 for only when asked to', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    mocks.loadCommittedRun.mockImplementation((commit: { sha: string }) =>
      commit.sha === commits[0].sha
        ? Promise.reject(new CommittedResultsError('not-found', 'gone'))
        : Promise.resolve(runFor(commit.sha)),
    );
    mocks.upsert.mockResolvedValue('inserted');

    await expect(ingestCommits(sql, commits, undefined)).rejects.toThrow('gone');
    const outcome = await ingestCommits(sql, commits, undefined, { skipMissing: true });
    expect(outcome.skipped).toEqual([commits[0]]);
    expect(outcome.stored).toEqual(commits.slice(1));
  });

  it('stops at invalid results and at a run id held by a different commit', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    mocks.loadCommittedRun.mockRejectedValueOnce(new CommittedResultsError('invalid', 'bad'));
    await expect(ingestCommits(sql, commits, undefined, { skipMissing: true })).rejects.toThrow(
      'bad',
    );

    mocks.loadCommittedRun.mockImplementation((commit: { sha: string }) =>
      Promise.resolve(runFor(commit.sha)),
    );
    mocks.upsert.mockResolvedValue('conflict');
    await expect(ingestCommits(sql, commits, undefined)).rejects.toThrow(
      /already holds a different commit/u,
    );
    expect(mocks.loadCommittedRun).toHaveBeenCalledTimes(2);
  });
});
