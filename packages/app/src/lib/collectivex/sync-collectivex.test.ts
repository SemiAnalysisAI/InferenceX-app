import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  makeSwapDoc,
  makeSwapRequestedCase,
  swapCaseId,
} from '@semianalysisai/inferencex-db/collectivex/swap-test-fixture';
import {
  makeRawMatrix,
  makeRawShard,
} from '@semianalysisai/inferencex-db/collectivex/test-fixture';

import {
  assembleSnapshot,
  fetchResults,
  readCheckoutResults,
  readTar,
  syncCollectiveX,
  type ResultsSource,
} from '../../../scripts/sync-collectivex';

const SHA = 'a'.repeat(40);
const EP_CASE = 'h200-dgxc-deepep-v2-deepseek-v3-normal-decode-ep8-uniform-bf16';
const encoder = new TextEncoder();

type Json = Record<string, unknown>;

function epResult(generatedAt = '2026-10-14T15:03:12.654321+08:00'): Json {
  return {
    ...makeRawShard(),
    generated_at: generatedAt,
    provenance: { image: null, source_sha: SHA, source_dirty: false },
  };
}

function casesJson(...swapSkus: string[]): Json {
  const shard = makeRawShard();
  const identity = shard.identity as { case_factors: { case: Json } };
  const matrix = makeRawMatrix([
    { caseId: EP_CASE, sku: 'h200-dgxc', case: identity.case_factors.case },
  ]);
  return {
    ...matrix,
    requested_cases: [
      ...(matrix.requested_cases as Json[]),
      ...swapSkus.map((sku) => makeSwapRequestedCase(sku)),
    ],
  };
}

function source(files: Record<string, unknown>, committedAt = '2026-10-13T08:00:00Z') {
  return {
    sha: SHA,
    committedAt,
    files: new Map(
      Object.entries(files).map(([path, value]) => [
        path,
        encoder.encode(typeof value === 'string' ? value : JSON.stringify(value)),
      ]),
    ),
  } satisfies ResultsSource;
}

function epochSeconds(iso: string): number {
  return Math.floor(Date.parse(iso) / 1000);
}

describe('assembleSnapshot', () => {
  it('derives one synthetic run from the newest result time and the results commit', () => {
    const snapshot = assembleSnapshot(
      source({
        'cases.json': casesJson('h200-dgxc'),
        [`h200-dgxc/${EP_CASE}.json`]: epResult(),
        [`h200-dgxc/${swapCaseId('h200-dgxc')}.json`]: makeSwapDoc(),
        'README.md': 'not a result',
      }),
    );

    const seconds = epochSeconds('2026-10-14T07:03:12Z');
    expect(snapshot.dataset.run).toMatchObject({
      run_id: String(seconds),
      run_attempt: 1,
      generated_at: '2026-10-14T07:03:12Z',
      conclusion: 'success',
      source_sha: SHA,
    });
    expect(snapshot.summary).toMatchObject({
      run_id: String(seconds),
      measured_cases: 2,
      requested_cases: 2,
      swap_cases: { requested: 1, measured: 1 },
    });
    expect(snapshot.dataset.series.map((series) => series.series_id)).toEqual([EP_CASE]);
    expect(snapshot.dataset.swap_blocks?.map((result) => result.sku)).toEqual(['h200-dgxc']);
  });

  it('builds a valid empty snapshot from cases.json alone at the commit time', () => {
    const snapshot = assembleSnapshot(
      source({ 'cases.json': casesJson('h200-dgxc', 'mi300x') }, '2026-10-13T08:00:00+08:00'),
    );

    expect(snapshot.dataset.run).toMatchObject({
      run_id: String(epochSeconds('2026-10-13T00:00:00Z')),
      generated_at: '2026-10-13T00:00:00Z',
    });
    expect(snapshot.dataset.series).toEqual([]);
    expect(snapshot.dataset.coverage.map((row) => row.outcome)).toEqual(['pending']);
    expect(snapshot.summary).toMatchObject({
      requested_cases: 3,
      measured_cases: 0,
      covered_skus: ['h200-dgxc', 'mi300x'],
      swap_cases: { requested: 2, measured: 0 },
    });
  });

  it('serves swap results on any GPU pool that cases.json requests them for', () => {
    const snapshot = assembleSnapshot(
      source({
        'cases.json': casesJson('mi300x'),
        [`mi300x/${swapCaseId('mi300x')}.json`]: makeSwapDoc('mi300x'),
      }),
    );
    expect(snapshot.dataset.swap_blocks?.map((result) => result.sku)).toEqual(['mi300x']);
    expect(snapshot.dataset.run.generated_at).toBe('2026-09-16T11:58:41Z');
  });

  it.each([
    [`h200-dgxc/renamed.json`, /h200-dgxc\/renamed\.json holds case h200-dgxc-deepep/],
    [`mi355x/${EP_CASE}.json`, /the file must be h200-dgxc\//],
  ])('rejects a result filed as %s', (file, message) => {
    expect(() =>
      assembleSnapshot(source({ 'cases.json': casesJson(), [file]: epResult() })),
    ).toThrow(message);
  });

  it('rejects a swap result whose folder is not its GPU pool', () => {
    expect(() =>
      assembleSnapshot(
        source({
          'cases.json': casesJson('h200-dgxc', 'mi300x'),
          [`mi300x/${swapCaseId('h200-dgxc')}.json`]: makeSwapDoc(),
        }),
      ),
    ).toThrow(/the file must be h200-dgxc\/h200-dgxc-swap-blocks-smoke-contiguous\.json/);
  });

  it('names the file whose version differs from cases.json', () => {
    const stale = { ...epResult(), version: 2 };
    expect(() =>
      assembleSnapshot(source({ 'cases.json': casesJson(), [`h200-dgxc/${EP_CASE}.json`]: stale })),
    ).toThrow(
      `collectivex/results/h200-dgxc/${EP_CASE}.json: CollectiveX version mismatch: ${EP_CASE} has version 2, cases.json has 1`,
    );
  });

  it('names the file the reader rejects', () => {
    const doc = makeSwapDoc();
    doc.cases[0].correctness_passed = false;
    expect(() =>
      assembleSnapshot(
        source({
          'cases.json': casesJson('h200-dgxc'),
          [`h200-dgxc/${swapCaseId('h200-dgxc')}.json`]: doc,
        }),
      ),
    ).toThrow(
      'collectivex/results/h200-dgxc/h200-dgxc-swap-blocks-smoke-contiguous.json: invalid or duplicate swap_blocks measurement',
    );
  });

  it.each([
    ['a missing cases.json', {}, /cases\.json is missing/],
    [
      'a nested result path',
      { 'cases.json': casesJson(), 'h200-dgxc/extra/result.json': epResult() },
      /is not at <sku>\/<case_id>\.json/,
    ],
    [
      'an unknown document',
      { 'cases.json': casesJson(), 'h200-dgxc/notes.json': { notes: true } },
      /is not a CollectiveX result document/,
    ],
    [
      'a case cases.json does not request',
      { 'cases.json': casesJson(), [`mi300x/${swapCaseId('mi300x')}.json`]: makeSwapDoc('mi300x') },
      /is not a runnable case in cases\.json/,
    ],
    [
      'a result measured from uncommitted code',
      {
        'cases.json': casesJson(),
        [`h200-dgxc/${EP_CASE}.json`]: {
          ...epResult(),
          provenance: { source_sha: SHA, source_dirty: true },
        },
      },
      /was not measured from committed collectivex\/ code/,
    ],
    [
      'a result without generated_at',
      {
        'cases.json': casesJson(),
        [`h200-dgxc/${EP_CASE}.json`]: { ...epResult(), generated_at: 'yesterday' },
      },
      /has no valid generated_at/,
    ],
    ['invalid JSON', { 'cases.json': '{' }, /cases\.json is not UTF-8 JSON/],
  ])('fails the sync on %s', (_name, files, message) => {
    expect(() => assembleSnapshot(source(files))).toThrow(message);
  });
});

function tarHeader(path: string, size: number, type: string, mtime = 0): Uint8Array {
  const header = new Uint8Array(512);
  const field = (offset: number, length: number, value: string) => {
    header.set(encoder.encode(value).subarray(0, length), offset);
  };
  field(0, 100, path.slice(0, 99));
  field(100, 8, '0000644\0');
  field(108, 8, '0000000\0');
  field(116, 8, '0000000\0');
  field(124, 12, `${size.toString(8).padStart(11, '0')}\0`);
  field(136, 12, `${mtime.toString(8).padStart(11, '0')}\0`);
  field(148, 8, '        ');
  field(156, 1, type);
  field(257, 6, 'ustar\0');
  field(263, 2, '00');
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  field(148, 8, `${checksum.toString(8).padStart(6, '0')}\0 `);
  return header;
}

function paxRecord(key: string, value: string): string {
  const body = ` ${key}=${value}\n`;
  let length = body.length + 1;
  while (`${length}${body}`.length !== length) length += 1;
  return `${length}${body}`;
}

function tarArchive(commit: string | null, files: Record<string, string>, mtime: number) {
  const blocks: Uint8Array[] = [];
  const push = (header: Uint8Array, data: Uint8Array) => {
    blocks.push(header, data, new Uint8Array((512 - (data.length % 512)) % 512));
  };
  if (commit) {
    const data = encoder.encode(paxRecord('comment', commit));
    push(tarHeader('pax_global_header', data.length, 'g'), data);
  }
  for (const [path, text] of Object.entries(files)) {
    const data = encoder.encode(text);
    if (path.length > 99) {
      const pax = encoder.encode(paxRecord('path', path));
      push(tarHeader('PaxHeader', pax.length, 'x'), pax);
    }
    push(tarHeader(path, data.length, '0', mtime), data);
  }
  blocks.push(new Uint8Array(1024));
  return Uint8Array.from(blocks.flatMap((block) => [...block]));
}

const LONG_CASE = 'b200-nscale-deepep-v2-deepseek-v4-pro-low-latency-decode-ep16-uniform-fp8';
const ARCHIVE_FILES = {
  'InferenceX-main/README.md': '# InferenceX',
  'InferenceX-main/collectivex/results/cases.json': '{"version":1,"requested_cases":[]}',
  [`InferenceX-main/collectivex/results/b200-nscale/${LONG_CASE}.json`]: '{}',
  'InferenceX-main/collectivex/bench/run_ep.py': 'print()',
};
const COMMIT_TIME = epochSeconds('2026-10-14T01:02:03Z');

describe('readTar', () => {
  it('reads the archive commit, pax long paths, and regular files', () => {
    const { commit, entries } = readTar(tarArchive(SHA, ARCHIVE_FILES, COMMIT_TIME));
    expect(commit).toBe(SHA);
    expect(entries.map((entry) => entry.path)).toEqual(Object.keys(ARCHIVE_FILES));
    expect(entries[0].mtime).toBe(COMMIT_TIME);
  });

  it('rejects corrupt and truncated archives', () => {
    const archive = tarArchive(SHA, ARCHIVE_FILES, COMMIT_TIME);
    const corrupt = new Uint8Array(archive);
    corrupt[0] ^= 1;
    expect(() => readTar(corrupt)).toThrow('corrupt tar header');
    // Inside the README's data, then between entries before the end-of-archive blocks.
    expect(() => readTar(archive.subarray(0, 1540))).toThrow('truncated');
    expect(() => readTar(archive.subarray(0, 2048))).toThrow('truncated');
  });
});

describe('fetchResults', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads the commit id from the archive when there is no token', async () => {
    fetchMock.mockResolvedValue(
      new Response(gzipSync(tarArchive(SHA, ARCHIVE_FILES, COMMIT_TIME))),
    );

    const results = await fetchResults('main');

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://codeload.github.com/SemiAnalysisAI/InferenceX/tar.gz/main',
    );
    expect(results.sha).toBe(SHA);
    expect(results.committedAt).toBe('2026-10-14T01:02:03.000Z');
    expect([...results.files.keys()]).toEqual(['cases.json', `b200-nscale/${LONG_CASE}.json`]);
  });

  it('pins the ref through the commits API with a token, then downloads that commit', async () => {
    fetchMock
      .mockResolvedValueOnce(
        Response.json({ sha: SHA, commit: { committer: { date: '2026-10-14T01:02:03Z' } } }),
      )
      .mockResolvedValueOnce(new Response(gzipSync(tarArchive(SHA, ARCHIVE_FILES, COMMIT_TIME))));

    const results = await fetchResults('feature/cx', 'token-value');

    const [lookupUrl, lookupInit] = fetchMock.mock.calls[0];
    expect(lookupUrl).toBe(
      'https://api.github.com/repos/SemiAnalysisAI/InferenceX/commits/feature/cx',
    );
    const headers = lookupInit?.headers as Record<string, string> | undefined;
    expect(headers?.Authorization).toBe('Bearer token-value');
    expect(fetchMock.mock.calls[1][0]).toBe(
      `https://codeload.github.com/SemiAnalysisAI/InferenceX/tar.gz/${SHA}`,
    );
    expect(results).toMatchObject({ sha: SHA, committedAt: '2026-10-14T01:02:03Z' });
  });

  it('rejects an archive of a different commit', async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json({ sha: SHA }))
      .mockResolvedValueOnce(
        new Response(gzipSync(tarArchive('b'.repeat(40), ARCHIVE_FILES, COMMIT_TIME))),
      );
    await expect(fetchResults('main', 'token-value')).rejects.toThrow(
      `does not identify commit ${SHA}`,
    );
  });

  it('fails without retrying a missing ref', async () => {
    fetchMock.mockResolvedValue(new Response('Not Found', { status: 404 }));
    await expect(fetchResults('no-such-branch')).rejects.toThrow(
      'Downloading https://codeload.github.com/SemiAnalysisAI/InferenceX/tar.gz/no-such-branch failed',
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe('local checkouts and the sync command', () => {
  let root: string;

  function git(...args: string[]): string {
    return execFileSync(
      'git',
      [
        '-C',
        join(root, 'InferenceX'),
        '-c',
        'user.name=CI',
        '-c',
        'user.email=ci@example.com',
        '-c',
        'commit.gpgsign=false',
        ...args,
      ],
      { encoding: 'utf8' },
    ).trim();
  }

  function commitResults(files: Record<string, unknown>) {
    for (const [path, value] of Object.entries(files)) {
      const absolute = join(root, 'InferenceX', 'collectivex', 'results', path);
      mkdirSync(join(absolute, '..'), { recursive: true });
      writeFileSync(absolute, JSON.stringify(value));
    }
    git('add', '.');
    git('commit', '-q', '-m', 'results');
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'cx-sync-'));
    mkdirSync(join(root, 'InferenceX'));
    git('init', '-q');
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('reads committed objects, not the working tree', () => {
    commitResults({ 'cases.json': casesJson(), [`h200-dgxc/${EP_CASE}.json`]: epResult() });
    writeFileSync(join(root, 'InferenceX', 'collectivex', 'results', 'cases.json'), '{');

    const results = readCheckoutResults(join(root, 'InferenceX'), 'HEAD');

    expect(results.sha).toBe(git('rev-parse', 'HEAD'));
    expect(Number.isFinite(Date.parse(results.committedAt ?? ''))).toBe(true);
    expect([...results.files.keys()]).toEqual(['cases.json', `h200-dgxc/${EP_CASE}.json`]);
    expect(() => assembleSnapshot(results)).not.toThrow();
  });

  it('reports a ref without collectivex/results', () => {
    writeFileSync(join(root, 'InferenceX', 'README.md'), '# InferenceX');
    git('add', '.');
    git('commit', '-q', '-m', 'init');
    expect(() => readCheckoutResults(join(root, 'InferenceX'), 'HEAD')).toThrow(
      'collectivex/results does not exist at HEAD',
    );
  });

  it('writes the snapshot, keeps it with --if-missing, and skips fixture builds', async () => {
    commitResults({ 'cases.json': casesJson(), [`h200-dgxc/${EP_CASE}.json`]: epResult() });
    const output = join(root, 'app', '.collectivex', 'snapshot.json');
    const from = join(root, 'InferenceX');

    expect(await syncCollectiveX({ output, from, env: { E2E_FIXTURES: '1' } })).toBeNull();
    expect(existsSync(output)).toBe(false);

    const written = await syncCollectiveX({ output, from, env: {} });
    expect(JSON.parse(readFileSync(output, 'utf8'))).toEqual(written);
    expect(written?.dataset.run.source_sha).toBe(git('rev-parse', 'HEAD'));

    writeFileSync(output, '{"kept":true}');
    expect(await syncCollectiveX({ output, from, ifMissing: true, env: {} })).toBeNull();
    expect(readFileSync(output, 'utf8')).toBe('{"kept":true}');
  });

  it('reads COLLECTIVEX_RESULTS_REF when no --ref is given, and --ref wins over it', async () => {
    commitResults({ 'cases.json': casesJson() });
    git('tag', 'results-branch');
    commitResults({ [`h200-dgxc/${EP_CASE}.json`]: epResult() });
    const output = join(root, 'app', '.collectivex', 'snapshot.json');
    const from = join(root, 'InferenceX');
    const env = { COLLECTIVEX_RESULTS_REF: 'results-branch' };

    const branch = await syncCollectiveX({ output, from, env });
    expect(branch?.dataset.run.source_sha).toBe(git('rev-parse', 'results-branch^{commit}'));
    expect(branch?.summary.measured_cases).toBe(0);

    const head = await syncCollectiveX({ output, from, ref: 'HEAD', env });
    expect(head?.dataset.run.source_sha).toBe(git('rev-parse', 'HEAD'));
    expect(head?.summary.measured_cases).toBe(1);
  });
});
