import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { CollectiveXRunRow } from '../queries/collectivex';
import {
  buildUploadedRun,
  MAX_FILE_BYTES,
  readResultsDir,
  ResultsError,
  RUN_ID_LIMIT,
  uploadSourceSha,
  validateResults,
} from './results-upload';
import { makeRawMatrix, makeRawShard } from './test-fixture';
import { makeSwapDoc, makeSwapRequestedCase, swapCaseId } from './swap-test-fixture';

const SHA = 'e'.repeat(40);
const OTHER_SHA = 'd'.repeat(40);
const NOW = new Date('2026-10-28T12:34:56.789Z');
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000);

type Json = Record<string, any>;

function epResult(options: Parameters<typeof makeRawShard>[0] = {}, sourceSha = SHA): Json {
  return {
    ...makeRawShard(options),
    provenance: { source_sha: sourceSha, source_dirty: false },
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

function filesOf(cases: unknown, files: Record<string, unknown>) {
  return {
    files: new Map([
      ['cases.json', encode(cases)],
      ...Object.entries(files).map(([file, doc]): [string, Uint8Array] => [file, encode(doc)]),
    ]),
  };
}

function pathOf(doc: Json): string {
  return `${doc.identity.case_factors.sku}/${doc.identity.case_id}.json`;
}

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cx-results-'));
  tempDirs.push(dir);
  return dir;
}

function writeResults(dir: string, cases: unknown, docs: Record<string, unknown>): void {
  fs.writeFileSync(path.join(dir, 'cases.json'), JSON.stringify(cases));
  for (const [file, doc] of Object.entries(docs)) {
    fs.mkdirSync(path.join(dir, path.dirname(file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), JSON.stringify(doc));
  }
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('readResultsDir', () => {
  it('reads cases.json and one level of <sku>/*.json, ignoring everything else', () => {
    const dir = tempDir();
    const ep = epResult();
    writeResults(dir, casesFor([ep]), { [pathOf(ep)]: ep });
    fs.writeFileSync(path.join(dir, 'README.md'), 'notes');
    fs.writeFileSync(path.join(dir, 'h200-dgxc', 'run.log'), 'log');
    fs.mkdirSync(path.join(dir, 'h200-dgxc', 'nested'));
    fs.writeFileSync(path.join(dir, 'h200-dgxc', 'nested', 'deep.json'), '{}');
    fs.mkdirSync(path.join(dir, '.shards'));
    fs.writeFileSync(path.join(dir, '.shards', 'partial.json'), '{}');

    const { dir: root, files } = readResultsDir(dir);
    expect(root).toBe(path.resolve(dir));
    expect([...files.keys()]).toEqual(['cases.json', pathOf(ep)]);
    expect(validateResults({ files }).results.map((entry) => entry.doc)).toEqual([ep]);
  });

  it('rejects a symlinked file, sku folder, or root', () => {
    const outside = tempDir();
    fs.writeFileSync(path.join(outside, 'x.json'), '{}');

    const linkedFile = tempDir();
    writeResults(linkedFile, casesFor([]), {});
    fs.mkdirSync(path.join(linkedFile, 'mi300x'));
    fs.symlinkSync(path.join(outside, 'x.json'), path.join(linkedFile, 'mi300x', 'x.json'));
    expect(() => readResultsDir(linkedFile)).toThrow('mi300x/x.json is a symlink');

    const linkedFolder = tempDir();
    writeResults(linkedFolder, casesFor([]), {});
    fs.symlinkSync(outside, path.join(linkedFolder, 'mi300x'));
    expect(() => readResultsDir(linkedFolder)).toThrow('mi300x is a symlink');

    const linkedCases = tempDir();
    fs.symlinkSync(path.join(outside, 'x.json'), path.join(linkedCases, 'cases.json'));
    expect(() => readResultsDir(linkedCases)).toThrow('cases.json is a symlink');

    const parent = tempDir();
    fs.symlinkSync(linkedFolder, path.join(parent, 'results'));
    expect(() => readResultsDir(path.join(parent, 'results'))).toThrow(/is a symlink/u);
  });

  it('rejects a missing directory and a file above the per-file cap', () => {
    expect(() => readResultsDir(path.join(tempDir(), 'absent'))).toThrow(/does not exist/u);
    const dir = tempDir();
    writeResults(dir, casesFor([]), {});
    fs.mkdirSync(path.join(dir, 'mi300x'));
    fs.writeFileSync(path.join(dir, 'mi300x', 'big.json'), Buffer.alloc(MAX_FILE_BYTES + 1, 32));
    expect(() => readResultsDir(dir)).toThrow(`mi300x/big.json exceeds ${MAX_FILE_BYTES} bytes`);
  });

  it('rejects a directory whose results exceed the total cap', () => {
    const dir = tempDir();
    writeResults(dir, casesFor([]), {});
    // 65 sparse files just under the per-file cap total more than 256 MiB without writing it.
    for (let index = 0; index < 65; index++) {
      const sku = path.join(dir, `pool-${Math.floor(index / 10)}`);
      fs.mkdirSync(sku, { recursive: true });
      const handle = fs.openSync(path.join(sku, `${index}.json`), 'w');
      fs.ftruncateSync(handle, MAX_FILE_BYTES);
      fs.closeSync(handle);
    }
    expect(() => readResultsDir(dir)).toThrow(/holds more than 268435456 bytes/u);
  });
});

describe('validateResults', () => {
  it('accepts EP and swap_blocks results that answer runnable cases', () => {
    const ep = epResult();
    const swap = makeSwapDoc('h200-dgxc');
    const upload = validateResults(
      filesOf(casesFor([ep], ['h200-dgxc']), {
        [pathOf(ep)]: ep,
        [`h200-dgxc/${swapCaseId('h200-dgxc')}.json`]: swap,
      }),
    );
    expect(upload.version).toBe(1);
    expect(upload.results.map((entry) => entry.doc)).toEqual([ep, swap]);
  });

  it('accepts a cases.json with no results yet', () => {
    expect(validateResults(filesOf(casesFor([epResult()]), {})).results).toEqual([]);
  });

  it('rejects a file whose name does not match its case_id', () => {
    const ep = epResult();
    expect(() =>
      validateResults(filesOf(casesFor([ep]), { 'h200-dgxc/renamed.json': ep })),
    ).toThrow(
      `h200-dgxc/renamed.json holds case ${ep.identity.case_id} on h200-dgxc; the file must be h200-dgxc/${ep.identity.case_id}.json`,
    );
  });

  it('rejects a result filed under another SKU folder', () => {
    const ep = epResult();
    expect(() =>
      validateResults(filesOf(casesFor([ep]), { [`b200-nscale/${ep.identity.case_id}.json`]: ep })),
    ).toThrow(/the file must be h200-dgxc\//u);
  });

  it('names the file whose version differs from cases.json', () => {
    const ep = { ...epResult(), version: 2 };
    expect(() => validateResults(filesOf(casesFor([ep]), { [pathOf(ep)]: ep }))).toThrow(
      `${pathOf(ep)} has version 2, cases.json has 1`,
    );
  });

  it('recognizes swap_blocks documents by schema and checks their case and pool', () => {
    const swap = makeSwapDoc('h200-dgxc');
    expect(() =>
      validateResults(
        filesOf(casesFor([], ['h200-dgxc']), {
          [`h200-dgxc/${swapCaseId('h200-dgxc', 'random')}.json`]: swap,
        }),
      ),
    ).toThrow(/the file must be h200-dgxc\/h200-dgxc-swap-blocks-smoke-contiguous\.json/u);
    expect(() =>
      validateResults(
        filesOf(casesFor([], ['b200-nscale']), {
          [`h200-dgxc/${swapCaseId('h200-dgxc')}.json`]: swap,
        }),
      ),
    ).toThrow(/is not a runnable case in cases\.json/u);
  });

  it('rejects documents that are not results, unparsable JSON, and stray paths', () => {
    const ep = epResult();
    expect(() =>
      validateResults(filesOf(casesFor([ep]), { [pathOf(ep)]: { schema: 'other' } })),
    ).toThrow(/is not a CollectiveX result document/u);
    const broken = filesOf(casesFor([ep]), {});
    broken.files.set(pathOf(ep), new TextEncoder().encode('{'));
    expect(() => validateResults(broken)).toThrow(`${pathOf(ep)} is not UTF-8 JSON`);
    expect(() => validateResults(filesOf(casesFor([ep]), { 'nested/deeper/x.json': ep }))).toThrow(
      /is not at <sku>\/<case_id>\.json/u,
    );
  });

  it('rejects results measured from uncommitted code', () => {
    const ep = { ...epResult(), provenance: { source_sha: SHA, source_dirty: true } };
    expect(() => validateResults(filesOf(casesFor([ep]), { [pathOf(ep)]: ep }))).toThrow(
      /was not measured from committed collectivex\/ code/u,
    );
    const unknown = { ...epResult(), provenance: { source_sha: SHA } };
    expect(() =>
      validateResults(filesOf(casesFor([unknown]), { [pathOf(unknown)]: unknown })),
    ).toThrow(/was not measured from committed collectivex\/ code/u);
  });

  it('requires a full 40-hex source_sha on EP and swap_blocks results', () => {
    for (const sourceSha of [undefined, 'abc123', 'E'.repeat(40), 'e'.repeat(41)]) {
      const ep = { ...epResult(), provenance: { source_sha: sourceSha, source_dirty: false } };
      expect(() => validateResults(filesOf(casesFor([ep]), { [pathOf(ep)]: ep }))).toThrow(
        `${pathOf(ep)} has no 40-hex source_sha`,
      );
    }
    const swap = makeSwapDoc('h200-dgxc');
    swap.runtime.source_sha = 'abc123';
    expect(() =>
      validateResults(
        filesOf(casesFor([], ['h200-dgxc']), {
          [`h200-dgxc/${swapCaseId('h200-dgxc')}.json`]: swap,
        }),
      ),
    ).toThrow(/has no 40-hex source_sha/u);
  });

  it('requires the exact cases.json version, not a coercible one', () => {
    const ep = { ...epResult(), version: '1' };
    expect(() => validateResults(filesOf(casesFor([ep]), { [pathOf(ep)]: ep }))).toThrow(
      /has version 1, cases\.json has 1/u,
    );
  });

  it('rejects results that name machines by IPv4 address or host field', () => {
    const withIp = { ...epResult(), notes: ['rendezvous at 10.0.12.7:29500'] };
    expect(() =>
      validateResults(filesOf(casesFor([withIp]), { [pathOf(withIp)]: withIp })),
    ).toThrow(`${pathOf(withIp)} contains an IP address`);
    const withHost = { ...epResult(), launch: { SLURM_NODELIST: 'node[1-2]' } };
    expect(() =>
      validateResults(filesOf(casesFor([withHost]), { [pathOf(withHost)]: withHost })),
    ).toThrow(/contains the host-identifying field "SLURM_NODELIST"/u);
    // Dotted versions that are not four octets, and host_* keys, are fine.
    const fine = { ...epResult(), notes: ['vllm 0.25.1', 'v1.2.3.4.5'], host_memory: 'pinned' };
    expect(
      validateResults(filesOf(casesFor([fine]), { [pathOf(fine)]: fine })).results,
    ).toHaveLength(1);
  });

  it('requires cases.json with a version and requested cases', () => {
    expect(() => validateResults({ files: new Map() })).toThrow('cases.json is missing');
    expect(() => validateResults(filesOf({ requested_cases: [] }, {}))).toThrow(
      /has no version and requested_cases/u,
    );
  });

  it('names the file the shared reader rejects', () => {
    const swap = { ...makeSwapDoc('h200-dgxc'), iterations: 0 };
    const validate = () =>
      validateResults(
        filesOf(casesFor([], ['h200-dgxc']), {
          [`h200-dgxc/${swapCaseId('h200-dgxc')}.json`]: swap,
        }),
      );
    expect(validate).toThrow(ResultsError);
    expect(validate).toThrow(new RegExp(`^h200-dgxc/${swapCaseId('h200-dgxc')}\\.json: `, 'u'));
  });
});

describe('uploadSourceSha', () => {
  it('is the one source_sha of every uploaded EP and swap_blocks result', () => {
    const ep = epResult({ sku: 'h200-dgxc' }, 'f'.repeat(40));
    const swap = makeSwapDoc('h200-dgxc');
    const upload = validateResults(
      filesOf(casesFor([ep], ['h200-dgxc']), {
        [pathOf(ep)]: ep,
        [`h200-dgxc/${swapCaseId('h200-dgxc')}.json`]: swap,
      }),
    );
    expect(uploadSourceSha(upload)).toBe('f'.repeat(40));
  });

  it('names the files of each sha when uploaded results differ, and refuses an empty upload', () => {
    const a = epResult({ sku: 'mi300x', vendor: 'amd' }, SHA);
    const b = epResult({ sku: 'mi325x', vendor: 'amd' }, OTHER_SHA);
    const upload = validateResults(filesOf(casesFor([a, b]), { [pathOf(a)]: a, [pathOf(b)]: b }));
    expect(() => uploadSourceSha(upload)).toThrow(
      `uploaded results do not share one source_sha (${SHA}: ${pathOf(a)}; ${OTHER_SHA}: ${pathOf(b)})`,
    );
    expect(() => uploadSourceSha(validateResults(filesOf(casesFor([a]), {})))).toThrow(
      'the upload holds no result files',
    );
  });
});

function storedRow(runId: string, cases: Json, docs: Json[]): CollectiveXRunRow {
  return {
    run_id: runId,
    run_attempt: 1,
    version: cases.version,
    generated_at: '2026-10-01T00:00:00Z',
    source_sha: OTHER_SHA,
    source_branch: null,
    source_repository: null,
    conclusion: 'success',
    matrix: cases,
    docs,
  };
}

describe('buildUploadedRun', () => {
  const mi300x = epResult({ sku: 'mi300x', vendor: 'amd' }, OTHER_SHA);
  const mi325x = epResult({ sku: 'mi325x', vendor: 'amd' }, OTHER_SHA);
  const h200 = epResult({ sku: 'h200-dgxc' });
  const all = casesFor([mi300x, mi325x, h200]);

  it('is just the upload when nothing is stored yet', () => {
    const upload = validateResults(filesOf(all, { [pathOf(h200)]: h200 }));
    const { run, docs, plan } = buildUploadedRun(upload, null, {
      maxStoredRunId: null,
      now: NOW,
    });
    expect(run).toMatchObject({
      run_id: String(NOW_SECONDS),
      run_attempt: 1,
      generated_at: '2026-10-28T12:34:56Z',
      source_sha: SHA,
      source_branch: null,
      conclusion: 'success',
      version: 1,
    });
    expect(run.matrix).toEqual(all);
    expect(run.summary).toMatchObject({ measured_cases: 1, requested_cases: 3 });
    expect(docs).toEqual([h200]);
    expect(plan).toEqual({ baseRunId: null, uploaded: 1, replaced: 0, kept: 0, dropped: [] });
  });

  it('lays uploaded cases over the stored run: replaces by case and keeps the others', () => {
    const stored = storedRow('1800000000', all, [mi300x, mi325x]);
    const newer = { ...epResult({ sku: 'mi300x', vendor: 'amd' }), notes: ['rerun'] };
    const upload = validateResults(filesOf(all, { [pathOf(newer)]: newer, [pathOf(h200)]: h200 }));
    const { run, docs, plan } = buildUploadedRun(upload, stored, {
      maxStoredRunId: '1800000000',
      now: NOW,
    });
    expect(docs).toEqual(
      [newer, mi325x, h200].toSorted((a, b) => pathOf(a).localeCompare(pathOf(b))),
    );
    expect(docs).not.toContain(mi300x);
    expect(run.source_sha).toBe(SHA);
    expect(run.summary.measured_cases).toBe(3);
    expect(plan).toEqual({
      baseRunId: '1800000000',
      uploaded: 2,
      replaced: 1,
      kept: 1,
      dropped: [],
    });
  });

  it('drops stored cases the new cases.json no longer runs, or of another version, naming each', () => {
    const swap = makeSwapDoc('h200-dgxc');
    const oldCases = casesFor([mi300x, mi325x], ['h200-dgxc']);
    const staleVersion = { ...mi325x, version: 2 };
    const stored = storedRow('1800000000', oldCases, [mi300x, staleVersion, swap]);
    // The new matrix drops the swap_blocks case and keeps both EP cases.
    const upload = validateResults(
      filesOf(casesFor([mi300x, mi325x, h200]), { [pathOf(h200)]: h200 }),
    );
    const { docs, plan } = buildUploadedRun(upload, stored, {
      maxStoredRunId: '1800000000',
      now: NOW,
    });
    expect(docs).toEqual([h200, mi300x]);
    expect(plan.kept).toBe(1);
    expect(plan.dropped).toEqual([
      { sku: 'mi325x', caseId: mi325x.identity.case_id, reason: 'version 2, cases.json has 1' },
      {
        sku: 'h200-dgxc',
        caseId: swapCaseId('h200-dgxc'),
        reason: 'not a runnable case in the new cases.json',
      },
    ]);
  });

  it('validates kept stored documents with the rest of the run', () => {
    const leaky = { ...mi300x, notes: ['10.1.2.3'] };
    const stored = storedRow('1800000000', all, [leaky]);
    const upload = validateResults(filesOf(all, { [pathOf(h200)]: h200 }));
    expect(() =>
      buildUploadedRun(upload, stored, { maxStoredRunId: '1800000000', now: NOW }),
    ).toThrow(`stored run 1800000000: mi300x/${mi300x.identity.case_id} contains an IP address`);
  });

  it('refuses an upload whose results do not share one source_sha', () => {
    const a = epResult({ sku: 'mi300x', vendor: 'amd' }, SHA);
    const b = epResult({ sku: 'mi325x', vendor: 'amd' }, OTHER_SHA);
    const upload = validateResults(filesOf(all, { [pathOf(a)]: a, [pathOf(b)]: b }));
    expect(() => buildUploadedRun(upload, null, { maxStoredRunId: null, now: NOW })).toThrow(
      /do not share one source_sha/u,
    );
  });

  it('keeps run_id monotonic past the highest stored id and inside the schema bound', () => {
    const upload = validateResults(filesOf(all, { [pathOf(h200)]: h200 }));
    const ahead = String(NOW_SECONDS + 100);
    expect(buildUploadedRun(upload, null, { maxStoredRunId: ahead, now: NOW }).run.run_id).toBe(
      String(NOW_SECONDS + 101),
    );
    expect(
      buildUploadedRun(upload, null, { maxStoredRunId: String(NOW_SECONDS), now: NOW }).run.run_id,
    ).toBe(String(NOW_SECONDS + 1));
    expect(
      buildUploadedRun(upload, null, { maxStoredRunId: '1700000000', now: NOW }).run.run_id,
    ).toBe(String(NOW_SECONDS));
    expect(() =>
      buildUploadedRun(upload, null, { maxStoredRunId: String(RUN_ID_LIMIT - 1), now: NOW }),
    ).toThrow(/outside/u);
  });
});
