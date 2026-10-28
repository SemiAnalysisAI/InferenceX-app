import { describe, expect, it, vi } from 'vitest';

import {
  assignRunIds,
  committedRun,
  CommittedResultsError,
  fetchResultsSource,
  listResultsCommits,
  RESULTS_DIR,
  resolveResultsCommit,
  validateCommittedResults,
  type ResultsSource,
} from './committed-results';
import { makeRawMatrix, makeRawShard } from './test-fixture';
import { makeSwapDoc, makeSwapRequestedCase, swapCaseId } from './swap-test-fixture';

const SHA = 'c'.repeat(40);
const OTHER_SHA = 'd'.repeat(40);
const COMMITTED_AT = '2026-10-15T18:35:51Z';
const COMMITTED_SECONDS = String(Date.parse(COMMITTED_AT) / 1000);

type Json = Record<string, any>;

function epResult(options: Parameters<typeof makeRawShard>[0] = {}): Json {
  return {
    ...makeRawShard(options),
    provenance: { source_sha: 'e'.repeat(40), source_dirty: false },
  };
}

function requestedOf(shard: Json) {
  return {
    caseId: shard.identity.case_id as string,
    sku: shard.identity.case_factors.sku as string,
    case: shard.identity.case_factors.case as Json,
  };
}

function casesFor(epDocs: Json[], swapSkus: string[] = [], version = 1): Json {
  const matrix = makeRawMatrix(epDocs.map(requestedOf), version);
  matrix.requested_cases = [
    ...(matrix.requested_cases as unknown[]),
    ...swapSkus.map((sku) => makeSwapRequestedCase(sku)),
  ];
  return matrix;
}

function encode(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

function sourceOf(cases: unknown, files: Record<string, unknown>): ResultsSource {
  return {
    sha: SHA,
    committedAt: COMMITTED_AT,
    runId: COMMITTED_SECONDS,
    files: new Map([
      ['cases.json', encode(cases)],
      ...Object.entries(files).map(([path, doc]): [string, Uint8Array] => [path, encode(doc)]),
    ]),
  };
}

function pathOf(doc: Json): string {
  return `${doc.identity.case_factors.sku}/${doc.identity.case_id}.json`;
}

describe('validateCommittedResults', () => {
  it('accepts EP and swap_blocks results that answer runnable cases', () => {
    const ep = epResult();
    const swap = makeSwapDoc('h200-dgxc');
    const results = validateCommittedResults(
      sourceOf(casesFor([ep], ['h200-dgxc']), {
        [pathOf(ep)]: ep,
        [`h200-dgxc/${swapCaseId('h200-dgxc')}.json`]: swap,
      }),
    );
    expect(results.version).toBe(1);
    expect(results.docs).toEqual([ep, swap]);
  });

  it('accepts a commit whose cases.json has no results yet', () => {
    const ep = epResult();
    expect(validateCommittedResults(sourceOf(casesFor([ep]), {})).docs).toEqual([]);
  });

  it('rejects a file whose name does not match its case_id', () => {
    const ep = epResult();
    expect(() =>
      validateCommittedResults(sourceOf(casesFor([ep]), { 'h200-dgxc/renamed.json': ep })),
    ).toThrow(
      `${RESULTS_DIR}/h200-dgxc/renamed.json holds case ${ep.identity.case_id} on h200-dgxc; the file must be h200-dgxc/${ep.identity.case_id}.json`,
    );
  });

  it('rejects a result filed under another SKU folder', () => {
    const ep = epResult();
    expect(() =>
      validateCommittedResults(
        sourceOf(casesFor([ep]), { [`b200-nscale/${ep.identity.case_id}.json`]: ep }),
      ),
    ).toThrow(/the file must be h200-dgxc\//u);
  });

  it('names the file whose version differs from cases.json', () => {
    const ep = { ...epResult(), version: 2 };
    expect(() => validateCommittedResults(sourceOf(casesFor([ep]), { [pathOf(ep)]: ep }))).toThrow(
      `${RESULTS_DIR}/${pathOf(ep)} has version 2, cases.json has 1`,
    );
  });

  it('recognizes swap_blocks documents by schema and checks their case and pool', () => {
    const swap = makeSwapDoc('h200-dgxc');
    expect(() =>
      validateCommittedResults(
        sourceOf(casesFor([], ['h200-dgxc']), {
          [`h200-dgxc/${swapCaseId('h200-dgxc', 'random')}.json`]: swap,
        }),
      ),
    ).toThrow(/the file must be h200-dgxc\/h200-dgxc-swap-blocks-smoke-contiguous\.json/u);
    expect(() =>
      validateCommittedResults(
        sourceOf(casesFor([], ['b200-nscale']), {
          [`h200-dgxc/${swapCaseId('h200-dgxc')}.json`]: swap,
        }),
      ),
    ).toThrow(/is not a runnable case in cases\.json/u);
  });

  it('rejects documents that are not results, unparsable JSON, and stray paths', () => {
    const ep = epResult();
    expect(() =>
      validateCommittedResults(sourceOf(casesFor([ep]), { [pathOf(ep)]: { schema: 'other' } })),
    ).toThrow(/is not a CollectiveX result document/u);
    const broken = sourceOf(casesFor([ep]), {});
    broken.files.set(pathOf(ep), new TextEncoder().encode('{'));
    expect(() => validateCommittedResults(broken)).toThrow(
      `${RESULTS_DIR}/${pathOf(ep)} is not UTF-8 JSON`,
    );
    expect(() =>
      validateCommittedResults(sourceOf(casesFor([ep]), { 'nested/deeper/x.json': ep })),
    ).toThrow(/is not at <sku>\/<case_id>\.json/u);
  });

  it('rejects results measured from uncommitted code', () => {
    const ep = { ...epResult(), provenance: { source_sha: 'e'.repeat(40), source_dirty: true } };
    expect(() => validateCommittedResults(sourceOf(casesFor([ep]), { [pathOf(ep)]: ep }))).toThrow(
      /was not measured from committed collectivex\/ code/u,
    );
    const unknown = { ...epResult(), provenance: { source_sha: 'e'.repeat(40) } };
    expect(() =>
      validateCommittedResults(sourceOf(casesFor([unknown]), { [pathOf(unknown)]: unknown })),
    ).toThrow(/was not measured from committed collectivex\/ code/u);
  });

  it('requires a full 40-hex source_sha on EP and swap_blocks results', () => {
    for (const sourceSha of [undefined, 'abc123', 'E'.repeat(40), 'e'.repeat(41)]) {
      const ep = { ...epResult(), provenance: { source_sha: sourceSha, source_dirty: false } };
      expect(() =>
        validateCommittedResults(sourceOf(casesFor([ep]), { [pathOf(ep)]: ep })),
      ).toThrow(`${RESULTS_DIR}/${pathOf(ep)} has no 40-hex source_sha`);
    }
    const swap = makeSwapDoc('h200-dgxc');
    swap.runtime.source_sha = 'abc123';
    expect(() =>
      validateCommittedResults(
        sourceOf(casesFor([], ['h200-dgxc']), {
          [`h200-dgxc/${swapCaseId('h200-dgxc')}.json`]: swap,
        }),
      ),
    ).toThrow(/has no 40-hex source_sha/u);
  });

  it('requires the exact cases.json version, not a coercible one', () => {
    const ep = { ...epResult(), version: '1' };
    expect(() => validateCommittedResults(sourceOf(casesFor([ep]), { [pathOf(ep)]: ep }))).toThrow(
      /has version 1, cases\.json has 1/u,
    );
  });

  it('rejects results that name machines by IPv4 address or host field', () => {
    const withIp = { ...epResult(), notes: ['rendezvous at 10.0.12.7:29500'] };
    expect(() =>
      validateCommittedResults(sourceOf(casesFor([withIp]), { [pathOf(withIp)]: withIp })),
    ).toThrow(`${RESULTS_DIR}/${pathOf(withIp)} contains an IP address`);
    const withHost = { ...epResult(), launch: { SLURM_NODELIST: 'node[1-2]' } };
    expect(() =>
      validateCommittedResults(sourceOf(casesFor([withHost]), { [pathOf(withHost)]: withHost })),
    ).toThrow(/contains the host-identifying field "SLURM_NODELIST"/u);
    // Dotted versions that are not four octets, and host_* keys, are fine.
    const fine = { ...epResult(), notes: ['vllm 0.25.1', 'v1.2.3.4.5'], host_memory: 'pinned' };
    expect(
      validateCommittedResults(sourceOf(casesFor([fine]), { [pathOf(fine)]: fine })).docs,
    ).toHaveLength(1);
  });

  it('requires cases.json with a version and requested cases', () => {
    expect(() =>
      validateCommittedResults({
        sha: SHA,
        committedAt: COMMITTED_AT,
        runId: COMMITTED_SECONDS,
        files: new Map(),
      }),
    ).toThrow(`${RESULTS_DIR}/cases.json is missing at ${SHA}`);
    expect(() => validateCommittedResults(sourceOf({ requested_cases: [] }, {}))).toThrow(
      /has no version and requested_cases/u,
    );
  });

  it('names the file the shared reader rejects', () => {
    const swap = { ...makeSwapDoc('h200-dgxc'), iterations: 0 };
    const validate = () =>
      validateCommittedResults(
        sourceOf(casesFor([], ['h200-dgxc']), {
          [`h200-dgxc/${swapCaseId('h200-dgxc')}.json`]: swap,
        }),
      );
    expect(validate).toThrow(CommittedResultsError);
    expect(validate).toThrow(
      new RegExp(`^${RESULTS_DIR}/h200-dgxc/${swapCaseId('h200-dgxc')}\\.json: `, 'u'),
    );
    expect(() => validate()).toThrowError(expect.objectContaining({ kind: 'invalid' }));
  });
});

describe('committedRun', () => {
  it('identifies the run by the commit time in epoch seconds, one attempt per commit', () => {
    const ep = epResult();
    const { run, docs } = committedRun(
      validateCommittedResults(sourceOf(casesFor([ep]), { [pathOf(ep)]: ep })),
    );
    expect(run).toMatchObject({
      run_id: COMMITTED_SECONDS,
      run_attempt: 1,
      generated_at: COMMITTED_AT,
      source_sha: SHA,
      source_branch: 'main',
      conclusion: 'success',
      version: 1,
    });
    expect(run.matrix).toEqual(casesFor([ep]));
    expect(run.summary).toMatchObject({
      run_id: COMMITTED_SECONDS,
      measured_cases: 1,
      requested_cases: 1,
    });
    expect(docs).toEqual([ep]);
  });

  it('stores the run under the commit run id and keeps generated_at at the commit time', () => {
    const ep = epResult();
    const bumped = {
      ...sourceOf(casesFor([ep]), {}),
      runId: String(Number(COMMITTED_SECONDS) + 1),
    };
    const { run } = committedRun(validateCommittedResults(bumped));
    expect(run.run_id).toBe(bumped.runId);
    expect(run.generated_at).toBe(COMMITTED_AT);
  });
});

describe('assignRunIds', () => {
  it('is the committer second, bumped past ties and clocks behind history', () => {
    const ids = assignRunIds([
      { sha: 'a'.repeat(40), committedAt: '2026-10-15T00:00:00Z' },
      { sha: 'b'.repeat(40), committedAt: '2026-10-15T00:00:00.900Z' },
      { sha: 'c'.repeat(40), committedAt: '2026-10-14T00:00:00Z' },
      { sha: 'd'.repeat(40), committedAt: '2026-10-16T00:00:00Z' },
    ]).map((commit) => Number(commit.runId));
    const base = Date.parse('2026-10-15T00:00:00Z') / 1000;
    expect(ids).toEqual([base, base + 1, base + 2, Date.parse('2026-10-16T00:00:00Z') / 1000]);
  });

  it('gives a commit the same id whatever ingest computes it', () => {
    const history = [
      { sha: 'a'.repeat(40), committedAt: COMMITTED_AT },
      { sha: 'b'.repeat(40), committedAt: COMMITTED_AT },
    ];
    expect(assignRunIds(history)).toEqual(assignRunIds(history));
  });
});

function jsonResponse(body: unknown): Response {
  return Response.json(body);
}

function commitBody(sha: string, date: string) {
  return { sha, commit: { committer: { date } } };
}

describe('GitHub reads', () => {
  it('resolves a ref to its newest results commit when that commit is on main', async () => {
    const fetch = vi.fn((url: string) => {
      const query = new URL(url).searchParams;
      expect(query.get('path')).toBe(RESULTS_DIR);
      return query.get('sha') === 'main'
        ? jsonResponse([
            commitBody(SHA, COMMITTED_AT),
            commitBody(OTHER_SHA, '2026-10-01T00:00:00Z'),
          ])
        : jsonResponse([commitBody(SHA, COMMITTED_AT)]);
    });
    await expect(
      resolveResultsCommit('feature', { fetch: fetch as unknown as typeof globalThis.fetch }),
    ).resolves.toEqual({ sha: SHA, committedAt: COMMITTED_AT, runId: COMMITTED_SECONDS });
  });

  it('refuses a results commit that never landed on main', async () => {
    const fetch = vi.fn((url: string) =>
      new URL(url).searchParams.get('sha') === 'main'
        ? jsonResponse([commitBody(OTHER_SHA, COMMITTED_AT)])
        : jsonResponse([commitBody(SHA, COMMITTED_AT)]),
    );
    await expect(
      resolveResultsCommit(SHA, { fetch: fetch as unknown as typeof globalThis.fetch }),
    ).rejects.toMatchObject({ kind: 'not-found' });
  });

  it('lists main history oldest first across pages', async () => {
    const page1 = Array.from({ length: 100 }, (_, index) =>
      commitBody(index.toString(16).padStart(40, '0'), '2026-10-15T00:00:00Z'),
    );
    const fetch = vi.fn((url: string) =>
      jsonResponse(
        new URL(url).searchParams.get('page') === '1' ? page1 : [commitBody(SHA, COMMITTED_AT)],
      ),
    );
    const commits = await listResultsCommits('main', {
      fetch: fetch as unknown as typeof globalThis.fetch,
    });
    expect(commits).toHaveLength(101);
    expect(commits[0].sha).toBe(SHA);
    // The 100 same-second commits after SHA get distinct, increasing ids.
    const ids = commits.map((commit) => Number(commit.runId));
    expect(new Set(ids).size).toBe(101);
    expect(ids).toEqual(ids.toSorted((a, b) => a - b));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('reads exactly the results tree at the commit and reuses cached blobs', async () => {
    const urls: string[] = [];
    const fetch = vi.fn((url: string, init?: RequestInit) => {
      urls.push(url);
      if (url.includes('/git/trees/')) {
        return jsonResponse({
          truncated: false,
          tree: [
            { path: 'cases.json', type: 'blob', sha: 'b1', size: 10 },
            { path: 'h200-dgxc', type: 'tree', sha: 't1' },
            { path: 'h200-dgxc/a.json', type: 'blob', sha: 'b2', size: 10 },
          ],
        });
      }
      expect(init?.headers).toEqual({ Authorization: 'Bearer token' });
      return new Response('{}');
    });
    const blobCache = new Map([['b2', new TextEncoder().encode('cached')]]);
    const source = await fetchResultsSource(
      { sha: SHA, committedAt: COMMITTED_AT, runId: COMMITTED_SECONDS },
      { fetch: fetch as unknown as typeof globalThis.fetch, token: 'token', blobCache },
    );
    expect(urls[0]).toContain(`/git/trees/${SHA}:${RESULTS_DIR}?recursive=1`);
    expect(urls.slice(1)).toEqual([
      `https://raw.githubusercontent.com/SemiAnalysisAI/InferenceX/${SHA}/collectivex/results/cases.json`,
    ]);
    expect([...source.files.keys()].toSorted()).toEqual(['cases.json', 'h200-dgxc/a.json']);
    expect(new TextDecoder().decode(source.files.get('h200-dgxc/a.json'))).toBe('cached');
    expect(blobCache.has('b1')).toBe(true);
  });

  it('reports a commit without a results directory as not found and oversize files as invalid', async () => {
    const missing = vi.fn(() => new Response('', { status: 404 }));
    await expect(
      fetchResultsSource(
        { sha: SHA, committedAt: COMMITTED_AT, runId: COMMITTED_SECONDS },
        { fetch: missing as unknown as typeof globalThis.fetch },
      ),
    ).rejects.toThrow(`${RESULTS_DIR} does not exist at ${SHA}`);

    const oversize = vi.fn(() =>
      jsonResponse({
        tree: [{ path: 'a/b.json', type: 'blob', sha: 'x', size: 64 * 1024 * 1024 }],
      }),
    );
    await expect(
      fetchResultsSource(
        { sha: SHA, committedAt: COMMITTED_AT, runId: COMMITTED_SECONDS },
        { fetch: oversize as unknown as typeof globalThis.fetch },
      ),
    ).rejects.toMatchObject({ kind: 'invalid' });
  });
});
