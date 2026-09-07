import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { test } from 'node:test';

import {
  COMMANDS,
  FORMAL_OPERATIONS,
  commandDescription,
  parseOperation,
} from '../skills/inferencex-api/scripts/commands.mjs';
import { isMain } from '../skills/inferencex-api/scripts/cli-contract.mjs';

test('registry fixes all six formal routes and public utility commands', () => {
  assert.deepEqual(
    FORMAL_OPERATIONS.map(({ command }) => command),
    [
      'powerx export',
      'agentx export',
      'result inspect',
      'tco compare',
      'releases compare',
      'collectivex compare',
    ],
  );
  assert.deepEqual(
    COMMANDS.filter(({ formal }) => !formal).map(({ command }) => command),
    ['discover', 'verify', 'describe', 'schema', 'doctor'],
  );
});

test('parseOperation separates stable global arguments from domain arguments', () => {
  assert.deepEqual(
    parseOperation([
      'powerx',
      'export',
      '--model',
      'DeepSeek-V4-Pro',
      '--output-dir',
      '证据 bundle',
      '--format',
      'csv',
      '--require-hardware=h200_sxm',
      '--require-hardware',
      'b200',
      '--timeout-ms',
      '5000',
      '--max-attempts=1',
      '--human',
      '--error-format=text',
    ]),
    {
      command: 'powerx export',
      kind: 'powerx',
      args: ['--model', 'DeepSeek-V4-Pro', '--format', 'csv'],
      outputDir: '证据 bundle',
      policy: { requireHardware: ['h200_sxm', 'b200'], minComparablePairs: null },
      human: true,
      timeoutMs: 5000,
      maxAttempts: 1,
    },
  );
});

test('parseOperation rejects duplicate globals, legacy outputs, and inapplicable policy', () => {
  for (const args of [
    ['powerx', 'export', '--output-dir', 'one', '--output-dir', 'two'],
    ['powerx', 'export', '--output', 'old'],
    ['powerx', 'export', '--evidence-dir=old'],
    ['powerx', 'export', '--output-dir', 'new', '--min-comparable-pairs', '1'],
    ['releases', 'compare', '--output-dir', 'new', '--require-hardware', 'b200'],
    [
      'powerx',
      'export',
      '--output-dir',
      'new',
      '--require-hardware',
      'b200',
      '--require-hardware=b200',
    ],
  ]) {
    assert.throws(() => parseOperation(args), { code: 'INVALID_ARGUMENT' });
  }
});

test('zero comparable pairs is a valid explicit threshold', () => {
  const parsed = parseOperation([
    'releases',
    'compare',
    '--output-dir',
    'new',
    '--min-comparable-pairs',
    '0',
  ]);
  assert.equal(parsed.policy.minComparablePairs, 0);
});

test('operation timeouts retain stricter domain caps and can only be lowered', () => {
  assert.equal(parseOperation(['powerx', 'export', '--output-dir', 'new']).timeoutMs, 30_000);
  assert.equal(
    parseOperation(['powerx', 'export', '--output-dir', 'new', '--timeout-ms', '120000']).timeoutMs,
    30_000,
  );
  assert.equal(
    parseOperation(['powerx', 'export', '--output-dir', 'new', '--timeout-ms', '5000']).timeoutMs,
    5_000,
  );
  assert.equal(parseOperation(['agentx', 'export', '--output-dir', 'new']).timeoutMs, 120_000);
});

test('offline commands reject network controls and missing global values', () => {
  for (const args of [
    ['verify', 'bundle', '--timeout-ms', '10'],
    ['describe', '--max-attempts', '1'],
    ['describe', '--human'],
    ['schema', 'error', '--human'],
    ['powerx', 'export', '--output-dir', '--format', 'json'],
  ]) {
    assert.throws(() => parseOperation(args), { code: 'INVALID_ARGUMENT' });
  }
});

test('describe metadata is detached from the immutable registry', () => {
  const description = commandDescription(['powerx', 'export']);
  assert.equal(description.command, 'powerx export');
  assert.deepEqual(description.formats, ['json', 'csv']);
  description.formats.push('xml');
  description.options[0].description = 'changed';
  assert.deepEqual(commandDescription(['powerx', 'export']).formats, ['json', 'csv']);
  assert.deepEqual(
    commandDescription(['powerx', 'export'])
      .options.filter(({ required }) => required)
      .map(({ name }) => name),
    ['--model', '--isl', '--osl', '--output-dir'],
  );
  assert.equal(
    commandDescription(['tco', 'compare']).options.some(
      ({ name, required }) => name === '--gpu-hourly-prices' && required,
    ),
    true,
  );
});

test('isMain resolves the invoked path and treats an absent path as an import', () => {
  const invoked = process.argv[1];
  try {
    process.argv[1] = import.meta.filename;
    assert.equal(isMain(import.meta.url), true);
    process.argv.length = 1;
    assert.equal(isMain(import.meta.url), false);
  } finally {
    process.argv[1] = invoked;
  }
});

test('importing domain modules is inert', async () => {
  const before = readdirSync(process.cwd()).toSorted();
  const stdout = process.stdout.write;
  const stderr = process.stderr.write;
  const fetch = globalThis.fetch;
  let writes = 0;
  process.stdout.write = () => {
    writes++;
    return true;
  };
  process.stderr.write = () => {
    writes++;
    return true;
  };
  globalThis.fetch = () => {
    throw new Error('domain import attempted network access');
  };
  try {
    for (const { module } of FORMAL_OPERATIONS) {
      const url = new URL(`../skills/inferencex-api/scripts/${module.slice(2)}`, import.meta.url);
      await import(`${url.href}?inert=${encodeURIComponent(module)}`);
    }
  } finally {
    process.stdout.write = stdout;
    process.stderr.write = stderr;
    globalThis.fetch = fetch;
  }
  assert.equal(writes, 0);
  assert.deepEqual(readdirSync(process.cwd()).toSorted(), before);
});
