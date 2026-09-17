import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import { commandDescription } from '../skills/inferencex-api/scripts/commands.mjs';
import { observation } from './bundle-fixtures.mjs';
import { AGENTX_BUNDLE_VARIANTS } from './agentx-bundle-fixtures.mjs';
import { provenanceBundleFixtures } from './provenance-bundle-fixtures.mjs';
import { RELEASE_ARGS, releaseObservation } from './releases-bundle-fixtures.mjs';

const schemas = JSON.parse(
  readFileSync(new URL('../skills/inferencex-api/schemas.json', import.meta.url)),
);
const validator = new Ajv2020({ strict: true, allErrors: true, validateFormats: false });

async function output(kind, module, args, responses) {
  const collector = await import(`../skills/inferencex-api/scripts/${module}.mjs`);
  let cursor = 0;
  const built = await collector.collect(collector.normalizeArgs(args), {
    producerVersion: '1.0.0',
    generatedAt: '2026-09-07T00:00:00.000Z',
    get() {
      const response = responses[cursor++];
      assert.ok(response, 'unexpected extra request');
      const bytes = Buffer.from(JSON.stringify(response.body));
      return {
        id: createHash('sha256').update(bytes).digest('hex'),
        bytes,
        body: response.body,
        status: response.status ?? 200,
        retrievedAt: '2026-09-07T00:00:00.000Z',
      };
    },
  });
  assert.equal(cursor, responses.length);
  const result = JSON.parse(built.bytes);
  const validate = validator.compile(schemas[kind]);
  assert.equal(validate(result), true, JSON.stringify(validate.errors));
  return result;
}

test('PowerX schema accepts an observation without a producer URL', async () => {
  const row = observation({ run_url: null });
  delete row.recipe_fingerprint;
  await output(
    'powerx',
    'export-powerx',
    ['--model', 'GLM-5', '--isl', '8192', '--osl', '1024'],
    [{ body: [row] }],
  );
});

test('AgentX schema accepts null provenance and identical enrichment response bodies', async () => {
  const fixture = structuredClone(AGENTX_BUNDLE_VARIANTS.positive);
  fixture.responses[0].body[0].run_url = null;
  fixture.responses[1].body = {};
  fixture.responses[2].body = {};
  const result = await output('agentx', 'export-agentx', fixture.args.slice(2), fixture.responses);
  assert.equal(result.metadata.source_response_ids.length, 4);
  assert.equal(result.metadata.source_response_ids[1], result.metadata.source_response_ids[2]);
});

test('result schema accepts missing optional provenance without fabricating fields', async () => {
  const fixture = provenanceBundleFixtures().result['missing-optional-provenance'];
  const result = await output(
    'result',
    'investigate-result',
    fixture.args.slice(2),
    fixture.responses,
  );
  assert.equal(Object.hasOwn(result.selected_result, 'recipe_fingerprint'), false);
});

test('result schema describes selection by a logical run snapshot', async () => {
  const fixture = provenanceBundleFixtures().result['producer-differs-from-curve'];
  const result = await output(
    'result',
    'investigate-result',
    ['--id', '421', '--model', 'DeepSeek-R1-0528', '--run-id', '123456789'],
    fixture.responses,
  );
  assert.equal(result.metadata.scope.selection, 'logical_run_snapshot');
});

test('release selection exports string IDs for included and excluded numeric observations', async () => {
  const result = await output('releases', 'compare-releases', RELEASE_ARGS, [
    {
      body: [
        releaseObservation(false, { id: 1, run_url: null, workflow_run_id: 4 }),
        releaseObservation(true, { id: 2, run_url: null }),
        releaseObservation(false, { id: 3, image: 'other', curve_workflow_run_id: 5 }),
      ],
    },
  ]);
  assert.equal(result.selection.before.rows[0].id, '1');
  assert.equal(result.selection.before.rows[0].workflow_run_id, '4');
  assert.equal(result.selection.after.rows[0].id, '2');
  assert.equal(result.selection.before.excluded[0].row.id, '3');
  assert.equal(result.selection.before.excluded[0].row.curve_workflow_run_id, '5');
});

test('utility metadata does not direct consumers to an unrelated summary schema', () => {
  for (const command of ['describe', 'schema']) {
    assert.equal(commandDescription([command]).output_schema, null);
  }
});

test('release arguments reject impossible dates, unsafe workloads and unsupported metrics', async () => {
  const { normalizeArgs } = await import('../skills/inferencex-api/scripts/compare-releases.mjs');
  for (const [flag, value] of [
    ['--isl', '0'],
    ['--osl', '9007199254740993'],
    ['--before-date', '2026-02-30'],
    ['--metric', 'mean_ttft'],
  ]) {
    const args = [...RELEASE_ARGS];
    args[args.indexOf(flag) + 1] = value;
    assert.throws(() => normalizeArgs(args), { code: 'INVALID_ARGUMENT' });
  }
  assert.throws(() => normalizeArgs([...RELEASE_ARGS, '--isl', '8192']), {
    code: 'INVALID_ARGUMENT',
  });
});
