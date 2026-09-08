import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import * as agentx from '../skills/inferencex-api/scripts/export-agentx.mjs';
import { AGENTX_CSV_COLUMNS } from '../skills/inferencex-api/scripts/export-contract.mjs';
import { AGENTX_BUNDLE_VARIANTS, agentxAggregate } from './agentx-bundle-fixtures.mjs';
import { bundleSuite } from './bundle-harness.mjs';

const coverageAggregates = {
  'null-groups': { id: 1, isl: null, osl: null, kvCacheUtil: null, prefixCacheHitRate: null },
  'zero-samples': agentxAggregate(1, 0),
  'known-samples': { ...agentxAggregate(1, 0), osl: agentxAggregate(1).osl },
};
const coverageFixtures = Object.fromEntries(
  Object.entries(coverageAggregates).map(([name, aggregate]) => {
    const fixture = structuredClone(AGENTX_BUNDLE_VARIANTS.positive);
    fixture.responses[1].body = { 1: { ...aggregate, extra: { n: 1 } } };
    return [name, fixture];
  }),
);
const bundles = bundleSuite({ agentx: { ...AGENTX_BUNDLE_VARIANTS, ...coverageFixtures } });
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function manifest(directory) {
  return JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
}

function saveManifest(directory, value) {
  writeFileSync(join(directory, 'manifest.json'), `${JSON.stringify(value, null, 2)}\n`);
}

test('AgentX exposes a formal bundle collector', () => {
  assert.equal(typeof agentx.normalizeArgs, 'function');
  assert.equal(typeof agentx.collect, 'function');
  assert.deepEqual(agentx.normalizeArgs(['--model', 'DeepSeek-V4-Pro', '--hardware', 'b300']), {
    model: 'DeepSeek-V4-Pro',
    date: null,
    raw_model: null,
    hardware: 'b300',
    framework: null,
    precision: null,
    spec_method: null,
    offload_mode: null,
    concurrency: null,
    format: 'json',
  });
  assert.throws(() => agentx.normalizeArgs(['--model', 'x', '--model', 'y']), {
    code: 'INVALID_ARGUMENT',
  });
});

test('packed AgentX bundles preserve joins, omissions, fixed columns and exact chunk requests', () => {
  for (const variant of ['positive', 'not-returned', 'no-trace', 'empty', 'multi-chunk']) {
    const saved = bundles.create('agentx', variant);
    const expected = AGENTX_BUNDLE_VARIANTS[variant].expected;
    const output = bundles.readResult(saved.directory);
    assert.equal(saved.result.status, 0, saved.result.stderr);
    assert.equal(output.kind, 'agentx');
    assert.equal(output.metadata.contract_version, 1);
    assert.equal(output.rows.length, expected.selected_records);
    assert.deepEqual(
      output.rows.map((row) => row.benchmark.id),
      expected.ids,
    );
    assert.deepEqual(
      manifest(saved.directory)
        .coverage.hardware.filter((item) => item.valid_records > 0)
        .map((item) => item.hardware),
      expected.valid_hardware,
    );
    assert.deepEqual(
      saved.requests
        .slice(1)
        .map(({ url }) => new URL(url).searchParams.get('ids').split(',').map(Number)),
      expected.request_chunks,
    );
    assert.equal(bundles.verify(saved.directory).status, 0);
  }

  const omitted = bundles.readResult(bundles.create('agentx', 'not-returned').directory).rows[0];
  assert.equal(omitted.agentx.aggregates.status, 'not_returned');
  assert.equal(omitted.agentx.derived_metrics.status, 'available');
  assert.equal(omitted.agentx.trace_availability.value, true);

  const csv = bundles.create('agentx', 'positive', { format: 'csv' });
  assert.deepEqual(
    bundles.readResult(csv.directory).split('\r\n', 1)[0].split(','),
    AGENTX_CSV_COLUMNS,
  );
  assert.equal(bundles.verify(csv.directory).status, 0);
});

test('captured no-trace evidence verifies offline without requesting trace detail', () => {
  const saved = bundles.create('agentx', 'no-trace');
  const verified = bundles.verify(saved.directory, []);
  assert.equal(verified.status, 0);
  assert.equal(JSON.parse(verified.stdout).validity, 'valid');
  assert.equal(
    saved.requests.some(({ operation }) => operation === 'request-timeline'),
    false,
  );
  assert.equal(
    saved.requests.some(({ operation }) => operation === 'conversation-trace'),
    false,
  );
});

for (const variant of Object.keys(coverageAggregates)) {
  test(`AgentX coverage counts only recognized aggregate samples: ${variant}`, () => {
    const usable = variant === 'known-samples';
    for (const format of ['json', 'csv']) {
      const saved = bundles.create('agentx', variant, {
        format,
        policy: ['--require-hardware', 'b300'],
      });
      assert.equal(saved.result.status, usable ? 0 : 3, saved.result.stdout);
      const value = manifest(saved.directory);
      assert.equal(value.coverage.status, usable ? 'complete' : 'partial');
      assert.deepEqual(value.coverage.hardware, [
        { hardware: 'b300', valid_records: usable ? 1 : 0 },
      ]);
      assert.equal(JSON.parse(saved.result.stdout).policy.status, usable ? 'passed' : 'failed');
      if (format === 'json') {
        const row = bundles.readResult(saved.directory).rows[0];
        assert.deepEqual(row.agentx.aggregates.value.extra, { n: 1 });
      }
      const verified = bundles.verify(saved.directory, ['--require-hardware', 'b300']);
      assert.equal(verified.status, usable ? 0 : 3, verified.stderr);
      assert.equal(JSON.parse(verified.stdout).validity, 'valid');
      assert.equal(JSON.parse(verified.stdout).policy.status, usable ? 'passed' : 'failed');
    }
  });
}

test('AgentX replay rejects missing chunks, response substitution, changed scope and rebuilt output', () => {
  {
    const saved = bundles.create('agentx', 'multi-chunk');
    const value = manifest(saved.directory);
    rmSync(join(saved.directory, value.requests[2].response.path));
    assert.notEqual(bundles.verify(saved.directory).status, 0);
  }
  {
    const saved = bundles.create('agentx', 'no-trace');
    const value = manifest(saved.directory);
    value.requests[2].response = structuredClone(value.requests[1].response);
    saveManifest(saved.directory, value);
    assert.notEqual(bundles.verify(saved.directory).status, 0);
  }
  {
    const saved = bundles.create('agentx', 'positive');
    const value = manifest(saved.directory);
    value.requests[1].url += '&changed=1';
    saveManifest(saved.directory, value);
    assert.notEqual(bundles.verify(saved.directory).status, 0);
  }
  {
    const saved = bundles.create('agentx', 'positive');
    const value = manifest(saved.directory);
    const request = value.requests[1];
    const bytes = Buffer.from(JSON.stringify({ 2: agentxAggregate(2) }));
    const id = sha256(bytes);
    writeFileSync(join(saved.directory, 'responses', `${id}.body`), bytes);
    request.response = {
      ...request.response,
      id,
      path: `responses/${id}.body`,
      sha256: id,
      size: bytes.length,
    };
    request.attempts.at(-1).consumedBytes = bytes.length;
    saveManifest(saved.directory, value);
    assert.notEqual(bundles.verify(saved.directory).status, 0);
  }
  {
    const saved = bundles.create('agentx', 'positive');
    const value = manifest(saved.directory);
    value.requests.push(structuredClone(value.requests[0]));
    saveManifest(saved.directory, value);
    assert.notEqual(bundles.verify(saved.directory).status, 0);
  }
  {
    const saved = bundles.create('agentx', 'positive');
    const value = manifest(saved.directory);
    const resultPath = join(saved.directory, value.result.path);
    const changed = Buffer.concat([readFileSync(resultPath), Buffer.from('\n')]);
    writeFileSync(resultPath, changed);
    value.result.size = changed.length;
    value.result.sha256 = sha256(changed);
    saveManifest(saved.directory, value);
    assert.notEqual(bundles.verify(saved.directory).status, 0);
  }
});
