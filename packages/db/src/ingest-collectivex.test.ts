import { afterEach, describe, expect, it, vi } from 'vitest';

import type * as CommittedResults from './collectivex/committed-results';

const mocks = vi.hoisted(() => ({
  loadCommittedRun: vi.fn(),
  upsert: vi.fn(),
}));
vi.mock('./collectivex/committed-results', async (importOriginal) => ({
  ...(await importOriginal<typeof CommittedResults>()),
  loadCommittedRun: mocks.loadCommittedRun,
}));
vi.mock('./queries/collectivex', () => ({ upsertCollectiveXRun: mocks.upsert }));

import { ingestCommits, parseIngestArgs } from './ingest-collectivex';
import type { DbClient } from './connection.js';

const sql = (() => Promise.resolve([])) as unknown as DbClient;

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('parseIngestArgs', () => {
  it('defaults to main', () => {
    expect(parseIngestArgs([])).toEqual({ ref: 'main', backfill: false });
  });

  it('takes one commit from --sha or --ref', () => {
    expect(parseIngestArgs(['--sha', 'a'.repeat(40)])).toEqual({
      ref: 'a'.repeat(40),
      backfill: false,
    });
    expect(parseIngestArgs(['--ref', 'v1.2', '--yes'])).toEqual({ ref: 'v1.2', backfill: false });
  });

  it('walks main for --backfill', () => {
    expect(parseIngestArgs(['--backfill', '-y', '--no-ssl'])).toEqual({
      ref: 'main',
      backfill: true,
    });
  });

  it('rejects conflicting, malformed, and unknown arguments', () => {
    expect(() => parseIngestArgs(['--sha', 'a'.repeat(40), '--ref', 'main'])).toThrow(
      /mutually exclusive/u,
    );
    expect(() => parseIngestArgs(['--backfill', '--ref', 'main'])).toThrow(/--backfill/u);
    expect(() => parseIngestArgs(['--sha', 'not-a-sha'])).toThrow(/Invalid commit sha/u);
    expect(() => parseIngestArgs(['12345'])).toThrow();
  });
});

function runFor(sha: string) {
  return {
    run: { run_id: sha.slice(0, 3), summary: { measured_cases: 1, requested_cases: 2 } },
    docs: [{}],
  };
}

describe('ingestCommits', () => {
  const commits = [
    { sha: 'a'.repeat(40), committedAt: '2026-10-15T00:00:00Z' },
    { sha: 'b'.repeat(40), committedAt: '2026-10-16T00:00:00Z' },
  ];

  it('stores commits in order and shares one blob cache across them', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    mocks.loadCommittedRun.mockImplementation((commit: { sha: string }) =>
      Promise.resolve(runFor(commit.sha)),
    );
    mocks.upsert.mockResolvedValueOnce('inserted').mockResolvedValueOnce('replaced');

    await ingestCommits(sql, commits, 'token');

    expect(mocks.loadCommittedRun.mock.calls.map(([commit]) => commit.sha)).toEqual(
      commits.map((commit) => commit.sha),
    );
    const [first, second] = mocks.loadCommittedRun.mock.calls.map(([, options]) => options);
    expect(first.token).toBe('token');
    expect(first.blobCache).toBe(second.blobCache);
    expect(mocks.upsert).toHaveBeenCalledTimes(2);
  });

  it('stops at a run id held by a different commit', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    mocks.loadCommittedRun.mockImplementation((commit: { sha: string }) =>
      Promise.resolve(runFor(commit.sha)),
    );
    mocks.upsert.mockResolvedValue('conflict');

    await expect(ingestCommits(sql, commits, undefined)).rejects.toThrow(
      /already holds a different commit/u,
    );
    expect(mocks.loadCommittedRun).toHaveBeenCalledTimes(1);
  });
});
