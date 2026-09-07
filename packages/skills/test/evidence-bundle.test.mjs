import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

import { openReplay, reserveBundle } from '../skills/inferencex-api/scripts/evidence-bundle.mjs';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function savedResponse(body = [{ id: 'result-1' }]) {
  const bytes = Buffer.from(JSON.stringify(body));
  return {
    id: sha256(bytes),
    status: 200,
    retrievedAt: '2026-09-07T01:02:03.000Z',
    bytes,
    body,
  };
}

test('bundle completion deduplicates decoded responses and commits the manifest last', async () => {
  const root = mkdtempSync(join(tmpdir(), 'evidence-bundle-'));
  const directory = join(root, 'run');
  const writer = await reserveBundle(directory);
  const response = savedResponse();
  const client = {
    attempts: [],
    get(spec) {
      this.attempts.push({
        operation: spec.operation,
        url: spec.url,
        ordinal: 1,
        startedAt: '2026-09-07T01:02:02.000Z',
        endedAt: response.retrievedAt,
        status: 200,
        consumedBytes: response.bytes.length,
        retry: { decision: 'accepted', reason: 'allowed_status' },
      });
      return response;
    },
  };
  const spec = {
    operation: 'benchmarks',
    url: 'https://inferencex.semianalysis.com/api/v1/benchmarks?model=GLM-5',
    allowedStatuses: [200],
  };
  await writer.get(spec, client);
  await writer.get(spec, client);
  const resultBytes = Buffer.from('{"selected":1}\n');
  const completed = await writer.complete({
    command: 'powerx export',
    kind: 'powerx',
    contractVersion: 1,
    options: { model: 'GLM-5', isl: 8192, osl: 1024, format: 'json' },
    producerVersion: '1.0.0',
    generatedAt: '2026-09-07T01:02:04.000Z',
    policy: { requireHardware: ['h200_sxm'], minComparablePairs: null },
    built: {
      format: 'json',
      bytes: resultBytes,
      coverage: {
        status: 'complete',
        selected_records: 1,
        comparable_pairs: null,
        hardware: [{ hardware: 'h200_sxm', valid_records: 1 }],
        reasons: [],
      },
    },
  });

  assert.equal(completed.manifest.requests.length, 2);
  assert.deepEqual(completed.manifest.summary, {
    schema_version: 1,
    command: 'powerx export',
    kind: 'powerx',
    package_version: '1.0.0',
    created_at: '2026-09-07T01:02:04.000Z',
    validity: 'valid',
    coverage: {
      status: 'complete',
      selected_records: 1,
      comparable_pairs: null,
      hardware: [{ hardware: 'h200_sxm', valid_records: 1 }],
      reasons: [],
    },
    policy: {
      status: 'passed',
      requirements: { require_hardware: ['h200_sxm'], min_comparable_pairs: null },
      reasons: [],
    },
    output: { result: 'result.json', manifest: 'manifest.json' },
  });
  assert.equal(completed.manifest.requests[0].response.path, `responses/${response.id}.body`);
  assert.equal(completed.manifest.requests[1].response.path, `responses/${response.id}.body`);
  assert.equal(
    readFileSync(join(directory, 'responses', `${response.id}.body`)).length,
    response.bytes.length,
  );
  assert.equal(readFileSync(join(directory, 'result.json')).compare(resultBytes), 0);
  assert.equal(existsSync(join(directory, 'manifest.json')), true);
});

test('replay matches exact request scope and requires every request to be consumed', async () => {
  const root = mkdtempSync(join(tmpdir(), 'evidence-replay-'));
  const directory = join(root, 'run');
  const writer = await reserveBundle(directory);
  const response = savedResponse();
  const spec = {
    operation: 'benchmarks',
    url: 'https://inferencex.semianalysis.com/api/v1/benchmarks?model=GLM-5',
    allowedStatuses: [200],
  };
  const client = {
    attempts: [],
    get() {
      this.attempts.push({
        operation: spec.operation,
        url: spec.url,
        ordinal: 1,
        startedAt: '2026-09-07T01:02:02.000Z',
        endedAt: response.retrievedAt,
        status: 200,
        consumedBytes: response.bytes.length,
        retry: { decision: 'accepted', reason: 'allowed_status' },
      });
      return response;
    },
  };
  await writer.get(spec, client);
  await writer.complete({
    kind: 'powerx',
    contractVersion: 1,
    options: { model: 'GLM-5', isl: 8192, osl: 1024, format: 'json' },
    producerVersion: '1.0.0',
    generatedAt: '2026-09-07T01:02:04.000Z',
    built: {
      format: 'json',
      bytes: Buffer.from('{}\n'),
      coverage: {
        status: 'complete',
        selected_records: 1,
        comparable_pairs: null,
        hardware: [{ hardware: 'h200_sxm', valid_records: 1 }],
        reasons: [],
      },
    },
  });

  const replay = await openReplay(directory);
  await assert.rejects(
    replay.get({ ...spec, url: `${spec.url}&date=2026-09-07` }),
    /request scope/u,
  );
  await assert.rejects(replay.assertConsumed(), /not consumed/u);
  const replayed = await replay.get(spec);
  assert.deepEqual(replayed.body, response.body);
  await replay.assertConsumed();
});

test('cancellation before manifest commit preserves an incomplete owned directory', async () => {
  const root = mkdtempSync(join(tmpdir(), 'evidence-cancel-'));
  const directory = join(root, 'run');
  const writer = await reserveBundle(directory);
  const controller = new AbortController();
  controller.abort(new Error('cancel before commit'));
  await assert.rejects(
    writer.complete({
      kind: 'powerx',
      contractVersion: 1,
      options: {},
      producerVersion: '1.0.0',
      generatedAt: '2026-09-07T01:02:04.000Z',
      signal: controller.signal,
      built: {
        format: 'json',
        bytes: Buffer.from('{}\n'),
        coverage: {
          status: 'empty',
          selected_records: 0,
          comparable_pairs: null,
          hardware: [],
          reasons: [],
        },
      },
    }),
    /cancel before commit/u,
  );
  assert.equal(existsSync(directory), true);
  assert.equal(existsSync(join(directory, 'manifest.json')), false);
});

test('an existing file, empty directory or symlink destination is never adopted', async () => {
  const root = mkdtempSync(join(tmpdir(), 'evidence-existing-'));
  const file = join(root, 'file');
  const directory = join(root, 'directory');
  const link = join(root, 'link');
  writeFileSync(file, 'owned by caller');
  mkdirSync(directory);
  symlinkSync(file, link);
  for (const destination of [file, directory, link]) {
    await assert.rejects(reserveBundle(destination), /already exists/u);
  }
  assert.equal(readFileSync(file, 'utf8'), 'owned by caller');
  assert.equal(existsSync(directory), true);
  assert.equal(readFileSync(link, 'utf8'), 'owned by caller');
});

test('a response over the local per-file limit is rejected before persistence', async () => {
  const root = mkdtempSync(join(tmpdir(), 'evidence-large-'));
  const directory = join(root, 'run');
  const writer = await reserveBundle(directory);
  const bytes = Buffer.alloc(32 * 1024 * 1024 + 1, 32);
  const response = {
    id: sha256(bytes),
    status: 200,
    retrievedAt: '2026-09-07T01:02:03.000Z',
    bytes,
    body: null,
  };
  await assert.rejects(
    writer.get(
      {
        operation: 'benchmarks',
        url: 'https://inferencex.semianalysis.com/api/v1/benchmarks?model=GLM-5',
        allowedStatuses: [200],
      },
      { attempts: [], get: () => response },
    ),
    /32 MiB/u,
  );
  assert.equal(existsSync(join(directory, 'responses', `${response.id}.body`)), false);
});

test('completion rejects a consumed response with no request-attempt ledger', async () => {
  const root = mkdtempSync(join(tmpdir(), 'evidence-ledger-'));
  const directory = join(root, 'run');
  const writer = await reserveBundle(directory);
  const response = savedResponse();
  const spec = {
    operation: 'benchmarks',
    url: 'https://inferencex.semianalysis.com/api/v1/benchmarks?model=GLM-5',
    allowedStatuses: [200],
  };
  await writer.get(spec, { attempts: [], get: () => response });
  await assert.rejects(
    writer.complete({
      kind: 'powerx',
      contractVersion: 1,
      options: { model: 'GLM-5', isl: 8192, osl: 1024, format: 'json' },
      producerVersion: '1.0.0',
      generatedAt: '2026-09-07T01:02:04.000Z',
      built: {
        format: 'json',
        bytes: Buffer.from('{}\n'),
        coverage: {
          status: 'complete',
          selected_records: 1,
          comparable_pairs: null,
          hardware: [{ hardware: 'h200_sxm', valid_records: 1 }],
          reasons: [],
        },
      },
    }),
    /attempt ledger/u,
  );
  assert.equal(existsSync(join(directory, 'manifest.json')), false);
});

test('replay checks every duplicate response reference against the cached body', async () => {
  const root = mkdtempSync(join(tmpdir(), 'evidence-duplicate-'));
  const directory = join(root, 'run');
  const writer = await reserveBundle(directory);
  const response = savedResponse();
  const spec = {
    operation: 'benchmarks',
    url: 'https://inferencex.semianalysis.com/api/v1/benchmarks?model=GLM-5',
    allowedStatuses: [200],
  };
  const client = {
    attempts: [],
    get() {
      this.attempts.push({
        operation: spec.operation,
        url: spec.url,
        ordinal: 1,
        startedAt: '2026-09-07T01:02:02.000Z',
        endedAt: response.retrievedAt,
        status: 200,
        consumedBytes: response.bytes.length,
        retry: { decision: 'accepted', reason: 'allowed_status' },
      });
      return response;
    },
  };
  await writer.get(spec, client);
  await writer.get(spec, client);
  const { manifest } = await writer.complete({
    kind: 'powerx',
    contractVersion: 1,
    options: { model: 'GLM-5', isl: 8192, osl: 1024, format: 'json' },
    producerVersion: '1.0.0',
    generatedAt: '2026-09-07T01:02:04.000Z',
    built: {
      format: 'json',
      bytes: Buffer.from('{}\n'),
      coverage: {
        status: 'complete',
        selected_records: 1,
        comparable_pairs: null,
        hardware: [{ hardware: 'h200_sxm', valid_records: 1 }],
        reasons: [],
      },
    },
  });
  manifest.requests[1].response.size = 0;
  manifest.requests[1].attempts[0].consumedBytes = 0;
  writeFileSync(join(directory, 'manifest.json'), `${JSON.stringify(manifest)}\n`);
  await assert.rejects(openReplay(directory), /size or SHA-256/u);
});

test('replay rejects arbitrary request-attempt states', async () => {
  const root = mkdtempSync(join(tmpdir(), 'evidence-attempt-'));
  const directory = join(root, 'run');
  const writer = await reserveBundle(directory);
  const response = savedResponse();
  const spec = {
    operation: 'benchmarks',
    url: 'https://inferencex.semianalysis.com/api/v1/benchmarks?model=GLM-5',
    allowedStatuses: [200],
  };
  const client = {
    attempts: [],
    get() {
      this.attempts.push({
        operation: spec.operation,
        url: spec.url,
        ordinal: 1,
        startedAt: 'yesterday',
        endedAt: response.retrievedAt,
        status: 200,
        consumedBytes: response.bytes.length,
        retry: { decision: 'anything', reason: 'because' },
      });
      return response;
    },
  };
  await writer.get(spec, client);
  await assert.rejects(
    writer.complete({
      kind: 'powerx',
      contractVersion: 1,
      options: { model: 'GLM-5', isl: 8192, osl: 1024, format: 'json' },
      producerVersion: '1.0.0',
      generatedAt: '2026-09-07T01:02:04.000Z',
      built: {
        format: 'json',
        bytes: Buffer.from('{}\n'),
        coverage: {
          status: 'complete',
          selected_records: 1,
          comparable_pairs: null,
          hardware: [{ hardware: 'h200_sxm', valid_records: 1 }],
          reasons: [],
        },
      },
    }),
    /attempt ledger/u,
  );
});

test('owned response paths reject a replaced symlink ancestor before writing', async () => {
  const root = mkdtempSync(join(tmpdir(), 'evidence-owned-'));
  const outside = join(root, 'outside');
  mkdirSync(outside);
  const directory = join(root, 'run');
  const writer = await reserveBundle(directory);
  rmSync(join(directory, 'responses'), { recursive: true });
  symlinkSync(outside, join(directory, 'responses'));
  const response = savedResponse();
  await assert.rejects(
    writer.get(
      {
        operation: 'benchmarks',
        url: 'https://inferencex.semianalysis.com/api/v1/benchmarks?model=GLM-5',
        allowedStatuses: [200],
      },
      { attempts: [], get: () => response },
    ),
    /owned responses directory/iu,
  );
  assert.equal(existsSync(join(outside, `${response.id}.body`)), false);
});

test('bundle write failures are OUTPUT_ERROR while a raced manifest stays INVALID_RESPONSE', () => {
  const root = mkdtempSync(join(tmpdir(), 'evidence-write-failure-'));
  const preload = join(root, 'preload.mjs');
  const runner = join(root, 'runner.mjs');
  writeFileSync(
    preload,
    `
import fs from 'node:fs';
import { basename } from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
const original = fs.promises.writeFile;
const originalLink = fs.promises.link;
fs.promises.writeFile = async (path, ...args) => {
  const value = String(path);
  const phase = process.env.FAIL_PHASE;
  const fail = phase === 'response'
    ? value.includes('/responses/') && value.endsWith('.body')
    : phase === 'result'
      ? value.endsWith('/result.json')
      : phase === 'manifest' && basename(value).startsWith('.manifest-');
  if (fail) {
    const error = new Error('injected ' + phase + ' ENOSPC');
    error.code = 'ENOSPC';
    throw error;
  }
  return original(path, ...args);
};
fs.promises.link = async (source, destination) => {
  if (process.env.FAIL_PHASE === 'manifest-link') {
    const error = new Error('injected manifest link ENOSPC');
    error.code = 'ENOSPC';
    throw error;
  }
  if (process.env.FAIL_PHASE === 'manifest-exists') {
    const error = new Error('injected manifest link EEXIST');
    error.code = 'EEXIST';
    throw error;
  }
  return originalLink(source, destination);
};
syncBuiltinESMExports();
`,
  );
  writeFileSync(
    runner,
    `
import { createHash } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { reserveBundle } from ${JSON.stringify(
      new URL('../skills/inferencex-api/scripts/evidence-bundle.mjs', import.meta.url).href,
    )};
const directory = join(process.env.TEST_ROOT, process.env.FAIL_PHASE);
const writer = await reserveBundle(directory);
const body = [];
const bytes = Buffer.from(JSON.stringify(body));
const response = {
  id: createHash('sha256').update(bytes).digest('hex'),
  status: 200,
  retrievedAt: '2026-09-07T01:02:03.000Z',
  bytes,
  body,
};
const spec = {
  operation: 'benchmarks',
  url: 'https://inferencex.semianalysis.com/api/v1/benchmarks?model=GLM-5',
  allowedStatuses: [200],
};
const client = {
  attempts: [],
  get() {
    this.attempts.push({
      operation: spec.operation,
      url: spec.url,
      ordinal: 1,
      startedAt: '2026-09-07T01:02:02.000Z',
      endedAt: response.retrievedAt,
      status: 200,
      consumedBytes: response.bytes.length,
      retry: { decision: 'accepted', reason: 'allowed_status' },
    });
    return response;
  },
};
try {
  if (process.env.FAIL_PHASE === 'response') await writer.get(spec, client);
  else await writer.complete({
    kind: 'powerx',
    contractVersion: 1,
    options: {},
    producerVersion: '1.0.0',
    generatedAt: '2026-09-07T01:02:04.000Z',
    built: {
      format: 'json',
      bytes: Buffer.from('{}\\n'),
      coverage: {
        status: 'empty', selected_records: 0, comparable_pairs: null, hardware: [], reasons: [],
      },
    },
  });
  console.log(JSON.stringify({ code: null }));
} catch (error) {
  console.log(JSON.stringify({
    code: error.code,
    message: error.message,
    directory: existsSync(directory),
    manifest: existsSync(join(directory, 'manifest.json')),
    files: readdirSync(directory, { recursive: true }).sort(),
  }));
}
`,
  );
  for (const [phase, code] of [
    ['response', 'OUTPUT_ERROR'],
    ['result', 'OUTPUT_ERROR'],
    ['manifest', 'OUTPUT_ERROR'],
    ['manifest-link', 'OUTPUT_ERROR'],
    ['manifest-exists', 'INVALID_RESPONSE'],
  ]) {
    const result = spawnSync(process.execPath, ['--import', pathToFileURL(preload).href, runner], {
      encoding: 'utf8',
      env: { ...process.env, FAIL_PHASE: phase, TEST_ROOT: root },
    });
    assert.equal(result.status, 0, result.stderr);
    const observed = JSON.parse(result.stdout);
    assert.equal(observed.code, code, `${phase}: ${result.stdout}`);
    assert.match(observed.message, /manifest|response|result/u);
    assert.equal(observed.directory, true);
    assert.equal(observed.manifest, false);
  }
});
