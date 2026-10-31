import { afterEach, describe, expect, it, vi } from 'vitest';

import type * as Queries from './queries/collectivex';
import type * as ResultsUpload from './collectivex/results-upload';

const reads: string[] = [];
vi.mock('./queries/collectivex', async (importOriginal) => ({
  ...(await importOriginal<typeof Queries>()),
  getMaxCollectiveXRunId: vi.fn(() => {
    reads.push('max');
    return Promise.resolve('200');
  }),
  getLatestCollectiveXRun: vi.fn(() => {
    reads.push('latest');
    return Promise.resolve(null);
  }),
}));
vi.mock('./collectivex/results-upload', async (importOriginal) => ({
  ...(await importOriginal<typeof ResultsUpload>()),
  readResultsDir: vi.fn(() => ({ files: new Map() })),
  validateResults: vi.fn(() => ({ version: 1 })),
  buildUploadedRun: vi.fn(() => ({ run: {}, docs: [], plan: {} })),
}));

import {
  describeUpload,
  invalidateCollectiveXCache,
  parseIngestArgs,
  planUpload,
} from './ingest-collectivex';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseIngestArgs', () => {
  it('uploads a results directory naming the PRs it publishes', () => {
    expect(parseIngestArgs(['--dir', '/tmp/results', '--pr', '4692', '--yes', '--no-ssl'])).toEqual(
      {
        mode: 'upload',
        dir: '/tmp/results',
        prs: [4692],
      },
    );
    expect(parseIngestArgs(['--dir=results', '--pr=1', '--pr', '2', '--pr', '1', '-y'])).toEqual({
      mode: 'upload',
      dir: 'results',
      prs: [1, 2],
    });
  });

  it('links changelog entries to a stored run', () => {
    expect(parseIngestArgs(['--link-run', '1793344844', '--pr', '4674'])).toEqual({
      mode: 'link',
      runId: '1793344844',
      prs: [4674],
    });
  });

  it('deletes one named run', () => {
    expect(parseIngestArgs(['--delete-run', '1792039236'])).toEqual({
      mode: 'delete',
      runId: '1792039236',
    });
    expect(() => parseIngestArgs(['--delete-run', '5', '--pr', '1'])).toThrow(/takes no --pr/u);
  });

  it('needs exactly one mode, and a PR for uploads and links', () => {
    expect(() => parseIngestArgs([])).toThrow(/exactly one of --dir, --link-run or --delete-run/u);
    expect(() => parseIngestArgs(['--dir', 'r', '--delete-run', '5'])).toThrow(
      /exactly one of --dir, --link-run or --delete-run/u,
    );
    expect(() => parseIngestArgs(['--dir', '', '--pr', '1'])).toThrow(/--dir needs a path/u);
    expect(() => parseIngestArgs(['--dir', 'r'])).toThrow(/--pr <n>/u);
    expect(() => parseIngestArgs(['--link-run', '5'])).toThrow(/--pr <n>/u);
    expect(() => parseIngestArgs(['--dir', 'r', '--pr', 'x'])).toThrow(/Invalid PR number/u);
  });

  it('rejects malformed run ids', () => {
    expect(() => parseIngestArgs(['--delete-run', '37459990486'])).toThrow(/Invalid run id/u);
    expect(() => parseIngestArgs(['--delete-run', '0'])).toThrow(/Invalid run id/u);
    expect(() => parseIngestArgs(['--delete-run', '12a'])).toThrow(/Invalid run id/u);
  });

  it('rejects the removed GitHub-source flags and positionals', () => {
    for (const argv of [
      ['--sha', 'a'.repeat(40)],
      ['--ref', 'main'],
      ['--backfill'],
      ['--backfill', '--prune'],
      ['--prune'],
      ['--dir', 'r', '--backfill'],
      ['results'],
    ]) {
      expect(() => parseIngestArgs(argv)).toThrow();
    }
  });
});

describe('describeUpload', () => {
  it('states the run, the source, and each dropped case', () => {
    const text = describeUpload({
      run: {
        run_id: '1800000000',
        run_attempt: 1,
        version: 1,
        generated_at: '2027-01-15T08:00:00Z',
        source_sha: 'e'.repeat(40),
        source_branch: null,
        conclusion: 'success',
        matrix: {},
        summary: { measured_cases: 3, requested_cases: 4 } as never,
      },
      docs: [{}, {}, {}],
      plan: {
        baseRunId: '1799999999',
        uploaded: 2,
        replaced: 1,
        kept: 1,
        dropped: [{ sku: 'mi300x', caseId: 'old-case', reason: 'not runnable' }],
      },
    });
    expect(text).toContain(
      `run 1800000000 (version 1, source ${'e'.repeat(40)}) over latest run 1799999999`,
    );
    expect(text).toContain('2 uploaded (1 replacing a stored case), 1 kept, 1 dropped');
    expect(text).toContain('3/4 cases measured, 3 docs');
    expect(text).toContain('drop mi300x/old-case: not runnable');
  });
});

describe('invalidateCollectiveXCache', () => {
  it('purges the collectivex scope with bearer auth and the protection bypass', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const fetch = vi.fn(() => Promise.resolve(new Response('{}')));
    await expect(
      invalidateCollectiveXCache({
        env: {
          APP_URL: 'https://app.example/',
          VERCEL_INVALIDATE_SECRET: 'secret',
          VERCEL_PROTECTION_BYPASS_SECRET: 'bypass',
        },
        fetchImpl: fetch as unknown as typeof globalThis.fetch,
      }),
    ).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      'https://app.example/api/v1/invalidate?scope=collectivex',
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer secret', 'x-vercel-protection-bypass': 'bypass' },
      }),
    );
  });

  it('drops the cached responses outright when asked, as a deletion does', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const fetch = vi.fn(() => Promise.resolve(new Response('{}')));
    await expect(
      invalidateCollectiveXCache({
        immediate: true,
        env: { APP_URL: 'https://app.example', VERCEL_INVALIDATE_SECRET: 'secret' },
        fetchImpl: fetch as unknown as typeof globalThis.fetch,
      }),
    ).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      'https://app.example/api/v1/invalidate?scope=collectivex&immediate=true',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('skips without APP_URL or the secret, and fails on an HTTP error', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const fetch = vi.fn(() => Promise.resolve(new Response('', { status: 401 })));
    await expect(
      invalidateCollectiveXCache({
        env: { APP_URL: 'https://app.example' },
        fetchImpl: fetch as never,
      }),
    ).resolves.toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(log.mock.calls.flat().join('\n')).toMatch(/cache expires/u);
    await expect(
      invalidateCollectiveXCache({
        env: { APP_URL: 'https://app.example', VERCEL_INVALIDATE_SECRET: 'secret' },
        fetchImpl: fetch as never,
      }),
    ).rejects.toThrow(/HTTP 401/u);
  });
});

describe('planUpload', () => {
  it('reads the highest run_id before the merge base, so a run landing between them is caught', async () => {
    reads.length = 0;
    const plan = await planUpload({} as never, '/unused');
    expect(reads).toEqual(['max', 'latest']);
    expect(plan.maxStoredRunId).toBe('200');
  });
});
